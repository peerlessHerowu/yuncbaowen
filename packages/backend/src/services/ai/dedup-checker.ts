/**
 * 连续词检测 + 相似度预估 + 自动修补
 * 核心功能：检测改写后残留的与原文连续 N 字以上相同的片段
 */

import { streamWithFallback } from './chat'
import { logger } from '../../utils/logger'

export interface ConsecutiveMatch {
  fragment: string
  originalPos: number
  rewrittenPos: number
  length: number
}

// 图片 markdown 正则（排除相似度计算中的图片内容）
const IMG_MARKDOWN_RE = /!\[[^\]]*\]\([^)]*\)/g

/**
 * 检测改写文本中与原文连续 N 字以上相同的片段
 * 算法：n-gram 索引法，O(n+m) 时间复杂度
 * 注意：计算前会排除图片 markdown（![]()），避免图片标题/URL 污染相似度结果
 */
export function detectConsecutiveMatches(
  original: string,
  rewritten: string,
  threshold: number = 8
): ConsecutiveMatch[] {
  if (!original || !rewritten || threshold < 3) return []

  // 排除图片 markdown 再做比较（图片 URL/alt 相同是正常的，不算抄袭）
  const cleanOriginal = original.replace(IMG_MARKDOWN_RE, '').replace(/\s+/g, '')
  const cleanRewritten = rewritten.replace(IMG_MARKDOWN_RE, '').replace(/\s+/g, '')

  if (cleanOriginal.length < threshold || cleanRewritten.length < threshold) return []

  // 构建原文 n-gram 索引：gram → [position]
  const gramIndex = new Map<string, number[]>()
  for (let i = 0; i <= cleanOriginal.length - threshold; i++) {
    const gram = cleanOriginal.slice(i, i + threshold)
    const positions = gramIndex.get(gram)
    if (positions) positions.push(i)
    else gramIndex.set(gram, [i])
  }

  // 在改写文中查找匹配并扩展到最长匹配
  const rawMatches: ConsecutiveMatch[] = []
  const visited = new Set<number>() // 已处理的改写文位置

  for (let j = 0; j <= cleanRewritten.length - threshold; j++) {
    if (visited.has(j)) continue

    const gram = cleanRewritten.slice(j, j + threshold)
    const originalPositions = gramIndex.get(gram)
    if (!originalPositions) continue

    // 找到匹配，尝试向后扩展到最长
    for (const i of originalPositions) {
      let len = threshold
      while (
        i + len < cleanOriginal.length &&
        j + len < cleanRewritten.length &&
        cleanOriginal[i + len] === cleanRewritten[j + len]
      ) {
        len++
      }

      rawMatches.push({
        fragment: cleanRewritten.slice(j, j + len),
        originalPos: i,
        rewrittenPos: j,
        length: len,
      })

      // 标记已处理的位置范围
      for (let k = j; k < j + len; k++) visited.add(k)
      break // 只取第一个原文匹配位置
    }
  }

  // 合并重叠/相邻匹配，保留最长
  return deduplicateMatches(rawMatches)
}

/** 合并重叠的匹配，保留最长 */
function deduplicateMatches(matches: ConsecutiveMatch[]): ConsecutiveMatch[] {
  if (matches.length <= 1) return matches

  // 按改写文位置排序
  const sorted = [...matches].sort((a, b) => a.rewrittenPos - b.rewrittenPos)
  const result: ConsecutiveMatch[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1]
    const curr = sorted[i]

    // 如果与前一个重叠或相邻，合并
    if (curr.rewrittenPos <= prev.rewrittenPos + prev.length) {
      const newEnd = Math.max(
        prev.rewrittenPos + prev.length,
        curr.rewrittenPos + curr.length
      )
      prev.length = newEnd - prev.rewrittenPos
      prev.fragment = prev.fragment.slice(0, prev.length)
    } else {
      result.push(curr)
    }
  }

  return result
}

/**
 * 计算预估相似度（0-100）
 * 基于匹配片段覆盖率 + 长片段加权
 */
export function estimateSimilarity(
  original: string,
  rewritten: string,
  matches: ConsecutiveMatch[]
): number {
  if (matches.length === 0) return 0

  // 排除图片 markdown 后计算分母（和 detectConsecutiveMatches 保持一致）
  const cleanOriginalLen = original.replace(IMG_MARKDOWN_RE, '').replace(/\s+/g, '').length
  if (cleanOriginalLen === 0) return 0

  // 基础覆盖率
  const totalMatchedChars = matches.reduce((sum, m) => sum + m.length, 0)
  const coverageRatio = totalMatchedChars / cleanOriginalLen

  // 长片段惩罚：超过 15 字的片段权重加倍
  const longMatchPenalty = matches
    .filter(m => m.length > 15)
    .reduce((sum, m) => sum + (m.length - 15) * 0.5, 0) / cleanOriginalLen

  const similarity = (coverageRatio + longMatchPenalty) * 100
  return Math.min(100, Math.round(similarity * 10) / 10)
}


/**
 * 对残留片段做局部改写修补
 * 提取残留片段+上下文 → 调用 LLM 局部改写 → 替换回原位置
 */
export async function fixConsecutiveMatches(
  original: string,
  rewritten: string,
  matches: ConsecutiveMatch[],
  userId: number,
  maxFixes: number = 8
): Promise<{ fixed: string; fixCount: number }> {
  if (matches.length === 0) return { fixed: rewritten, fixCount: 0 }

  // 只修补最长的 maxFixes 个
  const toFix = [...matches]
    .sort((a, b) => b.length - a.length)
    .slice(0, maxFixes)

  // 按位置从后往前替换（避免位置偏移）
  const sortedByPos = [...toFix].sort((a, b) => b.rewrittenPos - a.rewrittenPos)

  const cleanRewritten = rewritten.replace(/\s+/g, '')
  let fixedClean = cleanRewritten
  let fixCount = 0

  for (const match of sortedByPos) {
    // 提取片段 + 前后 40 字上下文
    const ctxStart = Math.max(0, match.rewrittenPos - 40)
    const ctxEnd = Math.min(cleanRewritten.length, match.rewrittenPos + match.length + 40)
    const context = cleanRewritten.slice(ctxStart, ctxEnd)
    const targetText = match.fragment

    try {
      const fixPrompt = `请改写以下文字片段，要求：
1. 意思完全不变
2. 改写后不能有连续5个字与原片段相同
3. 字数相近（可浮动±20%）
4. 只输出改写后的文字，不要任何解释

上下文：「${context}」

需要改写的片段：「${targetText}」`

      let fixedText = ''
      await streamWithFallback(userId, [
        { role: 'user', content: fixPrompt }
      ], chunk => { fixedText += chunk }, { temperature: 0.8, max_tokens: 200 })

      fixedText = fixedText.trim()
        .replace(/^[「"']/, '').replace(/[」"']$/, '') // 去引号

      if (fixedText && fixedText.length > 2) {
        // 替换到 fixedClean 中
        fixedClean = fixedClean.slice(0, match.rewrittenPos)
          + fixedText
          + fixedClean.slice(match.rewrittenPos + match.length)
        fixCount++
      }
    } catch (err) {
      logger.warn(`修补片段失败: ${(err as Error).message}`)
    }
  }

  // 恢复原始空白格式（简单方案：按段落重新组织）
  // 因为我们用 cleanRewritten 做了操作，需要把段落换行加回去
  // 简化处理：直接返回 fixedClean，因为改写结果本身是纯文本
  return { fixed: fixedClean, fixCount }
}
