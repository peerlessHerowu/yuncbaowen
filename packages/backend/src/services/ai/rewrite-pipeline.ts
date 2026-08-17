/**
 * 改写管道编排器
 * 串联 Layer 0-5：预处理 → AI改写 → 连续词检测 → 修补 → Randomizer → 相似度计算
 */

import { streamWithFallback } from './chat'
import { buildDedupPrompt } from './dedup-prompt'
import { splitText } from './text-splitter'
import { detectConsecutiveMatches, estimateSimilarity, fixConsecutiveMatches } from './dedup-checker'
import { randomizeText } from './randomizer'
import { logger } from '../../utils/logger'

export interface PipelineOptions {
  userId: number
  original: string
  intensity: 'light' | 'medium' | 'heavy'
  intent?: 'dedup' | 'platform' | 'casual' | 'fun'
  keywords?: string
  onChunk: (chunk: string) => void
  onStage: (stage: string, progress: number, meta?: Record<string, unknown>) => void
}

export interface PipelineResult {
  provider: string
  similarity: number
  fixCount: number
  content: string
}

/**
 * 降重改写管道主函数
 * 仅在 intent === 'dedup' 时走此管道
 */
export async function runDedupPipeline(options: PipelineOptions): Promise<PipelineResult> {
  const { userId, original, intensity, keywords, onChunk, onStage } = options

  // ─── Layer 0: 预处理（分段）───────────────────────────
  const segments = splitText(original, 4000)  // 4000字以下不分段，减少串行调用
  const isMultiSegment = segments.length > 1

  logger.info(`Dedup pipeline: ${original.length} chars, ${segments.length} segments`)
  onStage('rewriting', 0.05)

  // ─── Layer 1: AI 深度改写 ─────────────────────────────
  let rewrittenFull = ''
  let provider = ''

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const progress = 0.05 + (0.75 * (i / segments.length))
    onStage('rewriting', progress)

    const contextSummary = isMultiSegment
      ? [
          seg.contextBefore ? `前文末尾：「${seg.contextBefore}」` : '',
          seg.contextAfter ? `后文开头：「${seg.contextAfter}」` : '',
        ].filter(Boolean).join('；')
      : undefined

    const messages = buildDedupPrompt(seg.content, {
      intensity,
      keywords,
      isSegment: isMultiSegment,
      contextSummary,
    })

    let segResult = ''
    const result = await streamWithFallback(userId, messages, chunk => {
      segResult += chunk
      onChunk(chunk)
    }, { temperature: 0.7, max_tokens: 6000 })

    provider = result.provider
    rewrittenFull += (rewrittenFull && segResult ? '\n\n' : '') + segResult
  }

  // ─── Layer 2: 连续词检测 ──────────────────────────────
  onStage('checking', 0.82)

  const matches = detectConsecutiveMatches(original, rewrittenFull, 8)
  logger.info(`Dedup checker: found ${matches.length} consecutive matches`)

  // ─── Layer 3: 自动修补 ────────────────────────────────
  let finalContent = rewrittenFull
  let fixCount = 0

  if (matches.length > 0) {
    onStage('fixing', 0.88, { fixCount: matches.length })

    const fixResult = await fixConsecutiveMatches(
      original, rewrittenFull, matches, userId, 8
    )
    finalContent = fixResult.fixed
    fixCount = fixResult.fixCount

    logger.info(`Dedup fixer: fixed ${fixCount}/${matches.length} matches`)
  }

  // ─── Layer 4: Randomizer 后处理 ───────────────────────
  onStage('randomizing', 0.95)
  finalContent = randomizeText(finalContent, {
    synonyms: true,
    punctuation: true,
    paragraphRhythm: true,
    pauseWords: false, // 降重场景不加停顿词（避免引入不必要的口语）
  })

  // ─── Layer 5: 相似度计算 ──────────────────────────────
  const finalMatches = detectConsecutiveMatches(original, finalContent, 8)
  const similarity = estimateSimilarity(original, finalContent, finalMatches)

  onStage('done', 1.0, { similarity, fixCount })
  logger.info(`Dedup pipeline done: similarity=${similarity}%, fixCount=${fixCount}`)

  return { provider, similarity, fixCount, content: finalContent }
}
