/**
 * 改写管道编排器 v2 — 支持断点续传
 *
 * 原理：
 * 1. 将原文分段，为每次改写任务生成一个 task_id
 * 2. 每段改写完成后立即写入 rewrite_tasks.segments（JSON 状态机）
 * 3. 重试时：已完成的段直接从 DB 读取结果，跳过 LLM 调用
 * 4. 前端收到 taskId，可以用来恢复上次未完成的改写
 */

import { randomUUID } from 'crypto'
import { execute, queryOne } from '../../db/connection'
import { streamWithFallback } from './chat'
import { buildDedupPrompt } from './dedup-prompt'
import { splitText } from './text-splitter'
import { detectConsecutiveMatches, estimateSimilarity, fixConsecutiveMatches } from './dedup-checker'
import { randomizeText } from './randomizer'
import { logger } from '../../utils/logger'

// ── 图片提取 / 插回工具 ───────────────────────────────────────────

interface ImagePosition {
  afterParagraphIndex: number  // 在第 N 段纯文字后面
  markdown: string             // 完整的 ![alt](url)
}

/**
 * 把图片从内容中摘出，只把纯文字给 LLM 改写
 * 返回纯文字内容 + 图片位置映射
 */
function extractImages(content: string): { textOnly: string; images: ImagePosition[] } {
  const paragraphs = content.split(/\n\n+/)
  const images: ImagePosition[] = []
  const textParagraphs: string[] = []

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (/^!\[/.test(trimmed)) {
      // 图片单独成段，记录它在第几段纯文字后面
      images.push({ afterParagraphIndex: textParagraphs.length - 1, markdown: trimmed })
    } else if (trimmed) {
      textParagraphs.push(para)
    }
  }

  return { textOnly: textParagraphs.join('\n\n'), images }
}

/**
 * 改写完成后，把图片按位置插回对应段落
 */
function reinsertImages(rewrittenText: string, images: ImagePosition[]): string {
  if (images.length === 0) return rewrittenText

  const paragraphs = rewrittenText.split(/\n\n+/)

  // 从后往前插入，避免位置偏移
  const sorted = [...images].sort((a, b) => b.afterParagraphIndex - a.afterParagraphIndex)
  for (const img of sorted) {
    const pos = Math.min(Math.max(img.afterParagraphIndex, 0), paragraphs.length - 1)
    paragraphs.splice(pos + 1, 0, img.markdown)
  }

  return paragraphs.join('\n\n')
}

/**
 * 过滤版权声明行（常见的样板文）
 * 这类内容不需要改写，也不应计入相似度
 */
function filterBoilerplate(text: string): string {
  const boilerplateRe = /^.*(声明|本文内容.*原创|转载请注明|未经授权.*禁止|版权归.*所有|文章首发|抄袭.*自负).*$/mg
  return text
    .split('\n')
    .filter(line => !boilerplateRe.test(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 评估内容质量，返回纯文字占比和图片数量
 */
function analyzeContent(text: string): { pureTextRatio: number; imageCount: number; textLength: number } {
  const imageCount = (text.match(/!\[/g) || []).length
  const withoutImages = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  const textLength = withoutImages.replace(/\s+/g, '').length
  const totalLength = text.replace(/\s+/g, '').length
  const pureTextRatio = totalLength > 0 ? textLength / totalLength : 1
  return { pureTextRatio, imageCount, textLength }
}

// ── 类型定义 ──────────────────────────────────────────────────────

export interface SegmentState {
  index: number
  content: string       // 该段原文
  result: string        // 改写结果（done 才有值）
  status: 'pending' | 'done' | 'failed'
  error?: string
}

export interface RewriteTask {
  id: string
  userId: number
  originalUrl?: string
  originalText: string
  segments: SegmentState[]
  status: 'running' | 'partial' | 'done' | 'failed'
  meta?: Record<string, unknown>
}

export interface PipelineOptions {
  userId: number
  original: string
  originalUrl?: string
  intensity: 'light' | 'medium' | 'heavy'
  intent?: 'dedup' | 'platform' | 'casual' | 'fun'
  keywords?: string
  taskId?: string       // 传入已有 taskId 则续传，否则新建
  onChunk: (chunk: string) => void
  onStage: (stage: string, progress: number, meta?: Record<string, unknown>) => void
}

export interface PipelineResult {
  provider: string
  similarity: number
  fixCount: number
  content: string
  taskId: string
}

// ── DB 操作 ───────────────────────────────────────────────────────

async function loadTask(taskId: string, userId: number): Promise<RewriteTask | null> {
  const row = await queryOne<{
    id: string; user_id: number; original_url: string | null
    original_text: string; segments: string; status: string; meta: string | null
  }>(
    'SELECT * FROM rewrite_tasks WHERE id = ? AND user_id = ?',
    [taskId, userId]
  )
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    originalUrl: row.original_url ?? undefined,
    originalText: row.original_text,
    segments: JSON.parse(row.segments),
    status: row.status as RewriteTask['status'],
    meta: row.meta ? JSON.parse(row.meta) : undefined,
  }
}

async function createTask(task: Omit<RewriteTask, 'status'>): Promise<void> {
  await execute(
    'INSERT INTO rewrite_tasks (id, user_id, original_url, original_text, segments, status) VALUES (?,?,?,?,?,?)',
    [task.id, task.userId, task.originalUrl ?? null, task.originalText, JSON.stringify(task.segments), 'running']
  )
}

async function updateSegment(taskId: string, segment: SegmentState): Promise<void> {
  // 原子更新单个 segment（JSON_SET 精准定位）
  await execute(
    `UPDATE rewrite_tasks
     SET segments = JSON_SET(segments, CONCAT('$[', ?, ']'), CAST(? AS JSON)),
         status = 'partial',
         updated_at = NOW()
     WHERE id = ?`,
    [segment.index, JSON.stringify(segment), taskId]
  )
}

async function finalizeTask(taskId: string, status: RewriteTask['status'], meta?: Record<string, unknown>): Promise<void> {
  await execute(
    'UPDATE rewrite_tasks SET status = ?, meta = ?, updated_at = NOW() WHERE id = ?',
    [status, meta ? JSON.stringify(meta) : null, taskId]
  )
}

// ── 主管道 ────────────────────────────────────────────────────────

export async function runDedupPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { userId, originalUrl, intensity, keywords, onChunk, onStage } = options

  // ─── Layer 0: 预处理 ─────────────────────────────────
  // 1. 过滤版权声明样板行
  let original = filterBoilerplate(options.original)

  // 2. 内容质量评估
  const { pureTextRatio, imageCount, textLength } = analyzeContent(original)
  logger.info(`Content: pureTextRatio=${(pureTextRatio*100).toFixed(0)}%, images=${imageCount}, textLen=${textLength}`)

  if (pureTextRatio < 0.3) {
    onStage('warning', 0.02, {
      warning: `该文章以图片为主（文字仅占 ${(pureTextRatio*100).toFixed(0)}%），改写效果有限`,
    })
  }

  // 3. 提取图片，只让 LLM 处理纯文字（图片 URL 不送进 LLM，避免 token 浪费和干扰）
  const { textOnly, images: extractedImages } = extractImages(original)
  const hasImages = extractedImages.length > 0
  if (hasImages) {
    logger.info(`Extracted ${extractedImages.length} images, rewriting text-only`)
  }
  const textForRewrite = hasImages ? textOnly : original

  // ─── Layer 0b: 加载或新建任务 ────────────────────────
  let task: RewriteTask | null = null

  if (options.taskId) {
    task = await loadTask(options.taskId, userId)
    if (task) {
      const doneCount = task.segments.filter(s => s.status === 'done').length
      logger.info(`Resuming task ${task.id}: ${doneCount}/${task.segments.length} segments done`)
    }
  }

  if (!task) {
    // 新任务：基于纯文字版本分段（不含图片，减少 token）
    const rawSegments = splitText(textForRewrite, 4000)
    const taskId = randomUUID()
    task = {
      id: taskId,
      userId,
      originalUrl,
      originalText: textForRewrite,  // 存纯文字版本（不含图片）
      segments: rawSegments.map((s, i) => ({
        index: i,
        content: s.content,
        result: '',
        status: 'pending' as const,
      })),
    }
    await createTask(task)
    logger.info(`New task ${taskId}: ${task.segments.length} segments`)
  }

  // 通知前端任务 ID（供续传使用）
  onStage('rewriting', 0.05, { taskId: task.id })

  // ─── Layer 1: 逐段 AI 改写（跳过已完成段）────────────
  const isMultiSegment = task.segments.length > 1
  let provider = ''

  // 先把已完成段的结果流出给前端（续传场景）
  for (const seg of task.segments) {
    if (seg.status === 'done' && seg.result) {
      // 续传时已完成段直接输出，不调用 LLM
      onChunk(seg.result)
    }
  }

  for (const seg of task.segments) {
    if (seg.status === 'done') continue  // 跳过已完成段

    const progress = 0.05 + (0.75 * (seg.index / task.segments.length))
    onStage('rewriting', progress)

    // 构建上下文摘要（让每段改写保持上下文连贯）
    const contextSummary = isMultiSegment
      ? [
          seg.index > 0 && task.segments[seg.index - 1].result
            ? `前段末尾：「${task.segments[seg.index - 1].result.slice(-80)}」`
            : '',
          seg.index < task.segments.length - 1
            ? `后段开头：「${task.segments[seg.index + 1].content.slice(0, 80)}」`
            : '',
        ].filter(Boolean).join('；')
      : undefined

    const messages = buildDedupPrompt(seg.content, {
      intensity,
      keywords,
      isSegment: isMultiSegment,
      contextSummary,
    })

    let segResult = ''
    try {
      const result = await streamWithFallback(userId, messages, chunk => {
        segResult += chunk
        onChunk(chunk)
      }, { temperature: 0.85, max_tokens: 6000 })

      provider = result.provider
      seg.result = segResult
      seg.status = 'done'
      await updateSegment(task.id, seg)
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      seg.status = 'failed'
      seg.error = errMsg
      await updateSegment(task.id, seg)

      // 任何段失败都终止，已完成段已持久化，下次可续传
      await finalizeTask(task.id, 'partial')
      throw new Error(`改写第 ${seg.index + 1} 段失败：${errMsg}（任务 ID 已保存，可断点续传）`)
    }
  }

  // ─── 拼接所有段的结果 ────────────────────────────────
  let rewrittenFull = task.segments.map(s => s.result).join('\n\n')

  // ─── Layer 2: 连续词检测（用纯文字版本比较，排除图片干扰）─────
  onStage('checking', 0.82)
  const matches = detectConsecutiveMatches(textForRewrite, rewrittenFull, 8)
  logger.info(`Dedup checker: found ${matches.length} consecutive matches`)

  // ─── Layer 3: 自动修补 ────────────────────────────────
  let finalContent = rewrittenFull
  let fixCount = 0

  if (matches.length > 0) {
    onStage('fixing', 0.88, { fixCount: matches.length })
    const fixResult = await fixConsecutiveMatches(
      textForRewrite, rewrittenFull, matches, userId,
      Math.min(matches.length, 15)
    )
    finalContent = fixResult.fixed
    fixCount = fixResult.fixCount
    logger.info(`Dedup fixer: fixed ${fixCount}/${matches.length} matches`)
  }

  // ─── Layer 4: Randomizer ─────────────────────────────
  onStage('randomizing', 0.95)
  finalContent = randomizeText(finalContent, {
    synonyms: true,
    punctuation: true,
    paragraphRhythm: true,
    pauseWords: false,
  })

  // ─── Layer 5: 相似度计算（基于纯文字比较）────────────
  const finalMatches = detectConsecutiveMatches(textForRewrite, finalContent, 8)
  const similarity = estimateSimilarity(textForRewrite, finalContent, finalMatches)

  // ─── Layer 6: 图片插回（改写完成后把图片放回对应段落）────────
  if (hasImages) {
    finalContent = reinsertImages(finalContent, extractedImages)
    logger.info(`Reinserted ${extractedImages.length} images back into content`)
  }

  const meta = { provider, similarity, fixCount }
  await finalizeTask(task.id, 'done', meta)

  onStage('done', 1.0, { similarity, fixCount, taskId: task.id })
  logger.info(`Dedup pipeline done: similarity=${similarity}%, fixCount=${fixCount}`)

  return { provider, similarity, fixCount, content: finalContent, taskId: task.id }
}
