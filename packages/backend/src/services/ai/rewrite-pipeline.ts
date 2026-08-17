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
  const { userId, original, originalUrl, intensity, keywords, onChunk, onStage } = options

  // ─── Layer 0: 加载或新建任务 ─────────────────────────
  let task: RewriteTask | null = null

  if (options.taskId) {
    task = await loadTask(options.taskId, userId)
    if (task) {
      const doneCount = task.segments.filter(s => s.status === 'done').length
      logger.info(`Resuming task ${task.id}: ${doneCount}/${task.segments.length} segments done`)
    }
  }

  if (!task) {
    // 新任务：分段
    const rawSegments = splitText(original, 4000)
    const taskId = randomUUID()
    task = {
      id: taskId,
      userId,
      originalUrl,
      originalText: original,
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
      }, { temperature: 0.7, max_tokens: 6000 })

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

  // ─── Layer 2: 连续词检测 ─────────────────────────────
  onStage('checking', 0.82)
  const matches = detectConsecutiveMatches(original, rewrittenFull, 8)
  logger.info(`Dedup checker: found ${matches.length} consecutive matches`)

  // ─── Layer 3: 自动修补（不限制 maxFixes） ────────────
  let finalContent = rewrittenFull
  let fixCount = 0

  if (matches.length > 0) {
    onStage('fixing', 0.88, { fixCount: matches.length })
    const fixResult = await fixConsecutiveMatches(
      original, rewrittenFull, matches, userId,
      Math.min(matches.length, 15)  // 全部修补，最多15处
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

  // ─── Layer 5: 相似度计算 ─────────────────────────────
  const finalMatches = detectConsecutiveMatches(original, finalContent, 8)
  const similarity = estimateSimilarity(original, finalContent, finalMatches)

  const meta = { provider, similarity, fixCount }
  await finalizeTask(task.id, 'done', meta)

  onStage('done', 1.0, { similarity, fixCount, taskId: task.id })
  logger.info(`Dedup pipeline done: similarity=${similarity}%, fixCount=${fixCount}`)

  return { provider, similarity, fixCount, content: finalContent, taskId: task.id }
}
