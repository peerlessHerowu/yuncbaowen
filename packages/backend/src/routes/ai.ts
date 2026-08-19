import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth, requireActivated } from '../middleware/auth'
import { aiLimiter } from '../middleware/rateLimit'
import {
  generateTitles, analyzeStyle, generateArticle,
  rewriteArticle, generatePlatforms, deaiProcess, detectContent,
  extractPoints, rewriteFromPoints,
} from '../services/ai/tasks'
import { execute } from '../db/connection'

export const aiRouter = Router()
aiRouter.use(requireAuth, requireActivated, aiLimiter)

// ── 输入长度常量（防 Prompt Injection 和超长输入耗尽 token）──────
const LIMITS = {
  TOPIC:    200,   // 主题/话题
  CONTENT: 20000,  // 文章正文（约1万字）
  STYLE:   1000,   // 风格描述
  URL_COUNT: 10,   // 风格分析 URL 数量上限
  URL_LEN:  500,   // 单个 URL 长度
  PLATFORM_COUNT: 7, // 多平台推文平台数量
}

/** 校验字符串字段，超长则返回 400 */
function checkLen(val: unknown, max: number, field: string, res: Response): boolean {
  if (typeof val === 'string' && val.length > max) {
    res.status(400).json({ success: false, error: `${field} 长度不能超过 ${max} 字符` })
    return false
  }
  return true
}

// 爆款标题
aiRouter.post('/title', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkLen(req.body.topic, LIMITS.TOPIC, 'topic', res)) return
    if (!checkLen(req.body.style, LIMITS.STYLE, 'style', res)) return
    const count = Math.min(Math.max(parseInt(req.body.count) || 12, 1), 20)
    req.body.count = count

    const result = await generateTitles(req.user!.id, req.body)
    await execute(
      'INSERT INTO creations (user_id,type,title,content,meta) VALUES (?,?,?,?,?)',
      [req.user!.id, 'title', `标题生成：${req.body.topic}`,
       JSON.stringify(result.titles), JSON.stringify({ topic: req.body.topic, provider: result.provider })]
    )
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

// 风格分析
aiRouter.post('/style-analyze', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const urls = req.body.urls
    if (!Array.isArray(urls) || urls.length === 0) {
      return void res.status(400).json({ success: false, error: '请提供至少一个 URL' })
    }
    if (urls.length > LIMITS.URL_COUNT) {
      return void res.status(400).json({ success: false, error: `URL 数量不能超过 ${LIMITS.URL_COUNT} 个` })
    }
    for (const url of urls) {
      if (!checkLen(url, LIMITS.URL_LEN, 'URL', res)) return
    }
    const result = await analyzeStyle(req.user!.id, req.body)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

// 定向生成（SSE 流式）
aiRouter.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkLen(req.body.topic, LIMITS.TOPIC, 'topic', res)) return
    if (!checkLen(req.body.style_prompt, LIMITS.STYLE, 'style_prompt', res)) return
    const wordCount = Math.min(Math.max(parseInt(req.body.word_count) || 1500, 300), 5000)
    req.body.word_count = wordCount

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    let full = ''
    const { provider } = await generateArticle(req.user!.id, req.body, chunk => {
      full += chunk
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`)
    })
    await execute(
      'INSERT INTO creations (user_id,type,title,content,meta,source_style_id) VALUES (?,?,?,?,?,?)',
      [req.user!.id, 'article', req.body.topic, full,
       JSON.stringify({ provider }), req.body.style_prompt_id || null]
    )
    res.write(`data: ${JSON.stringify({ done: true, provider })}\n\n`)
    res.end()
  } catch (err) { next(err) }
})

// 二次仿写（SSE）
aiRouter.post('/rewrite', async (req: Request, res: Response, next: NextFunction) => {
  let sseStarted = false
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null

  const startKeepalive = () => {
    // 每 8 秒发一个 SSE 注释行，防止 Cloudflare Tunnel / 代理因空闲超时断开连接
    keepaliveTimer = setInterval(() => {
      try { res.write(': keepalive\n\n') } catch { /* 连接已断，忽略 */ }
    }, 8000)
  }

  const stopKeepalive = () => {
    if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null }
  }

  try {
    if (!checkLen(req.body.original, LIMITS.CONTENT, 'original', res)) return

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    sseStarted = true
    startKeepalive()

    let full = ''
    const result = await rewriteArticle(
      req.user!.id,
      req.body,
      chunk => {
        full += chunk
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`)
      },
      (stage, progress, meta) => {
        res.write(`data: ${JSON.stringify({ stage, progress, ...meta })}\n\n`)
      }
    )

    const meta: Record<string, unknown> = { provider: result.provider }
    if (result.similarity !== undefined) meta.similarity = result.similarity
    if (result.fixCount !== undefined) meta.fixCount = result.fixCount
    if (result.taskId) meta.taskId = result.taskId

    if (full.trim()) {
      await execute(
        'INSERT INTO creations (user_id,type,title,content,meta) VALUES (?,?,?,?,?)',
        [req.user!.id, 'rewrite', '二次仿写', full, JSON.stringify(meta)]
      )
    }
    stopKeepalive()
    res.write(`data: ${JSON.stringify({ done: true, ...meta })}\n\n`)
    res.end()
  } catch (err) {
    stopKeepalive()
    const msg = err instanceof Error ? err.message : '仿写失败，请重试'
    if (sseStarted) {
      try {
        res.write(`data: ${JSON.stringify({ error: msg, done: true })}\n\n`)
        res.end()
      } catch { /* 连接已断开 */ }
    } else {
      next(err)
    }
  }
})

// 草稿保存（手动编辑后保存）
aiRouter.post('/rewrite/draft', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { content, original } = req.body
    if (!content?.trim()) return void res.status(400).json({ success: false, error: '内容不能为空' })
    await execute(
      'INSERT INTO creations (user_id,type,title,content,meta) VALUES (?,?,?,?,?)',
      [req.user!.id, 'rewrite', '手动草稿', content,
       JSON.stringify({ isDraft: true, original: (original || '').slice(0, 200) })]
    )
    res.json({ success: true })
  } catch (err) { next(err) }
})

// L3 信息重组 - Step 1: 提取核心要点
aiRouter.post('/rewrite/extract-points', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkLen(req.body.original, LIMITS.CONTENT, 'original', res)) return

    const result = await extractPoints(req.user!.id, req.body.original)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

// L3 信息重组 - Step 2: 基于要点生成新文章（SSE）
aiRouter.post('/rewrite/from-points', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { points, structure, word_count, keywords } = req.body
    if (!Array.isArray(points) || points.length === 0) {
      return void res.status(400).json({ success: false, error: '请提供至少一个核心要点' })
    }
    if (points.length > 15) {
      return void res.status(400).json({ success: false, error: '要点数量不能超过 15 个' })
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    let full = ''
    const { provider } = await rewriteFromPoints(
      req.user!.id,
      points,
      structure || 'story-lead',
      word_count || 1500,
      keywords,
      chunk => {
        full += chunk
        res.write(`data: ${JSON.stringify({ chunk })}\n\n`)
      }
    )

    await execute(
      'INSERT INTO creations (user_id,type,title,content,meta) VALUES (?,?,?,?,?)',
      [req.user!.id, 'rewrite', '深度改写（信息重组）', full, JSON.stringify({ provider, mode: 'l3' })]
    )
    res.write(`data: ${JSON.stringify({ done: true, provider })}\n\n`)
    res.end()
  } catch (err) { next(err) }
})

// 多平台推文
aiRouter.post('/platform', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkLen(req.body.content, LIMITS.CONTENT, 'content', res)) return
    const platforms = req.body.platforms
    if (!Array.isArray(platforms) || platforms.length === 0) {
      return void res.status(400).json({ success: false, error: '请选择至少一个平台' })
    }
    if (platforms.length > LIMITS.PLATFORM_COUNT) {
      return void res.status(400).json({ success: false, error: `平台数量不能超过 ${LIMITS.PLATFORM_COUNT} 个` })
    }

    const result = await generatePlatforms(req.user!.id, req.body)
    await execute(
      'INSERT INTO creations (user_id,type,title,content,meta) VALUES (?,?,?,?,?)',
      [req.user!.id, 'platform', '多平台推文', JSON.stringify(result.results),
       JSON.stringify({ provider: result.provider })]
    )
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

// 去AI味（同步闭环，可能较慢）
aiRouter.post('/deai', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkLen(req.body.content, LIMITS.CONTENT, 'content', res)) return
    const maxRounds = Math.min(Math.max(parseInt(req.body.max_rounds) || 3, 1), 5)
    req.body.max_rounds = maxRounds

    const result = await deaiProcess(req.user!.id, req.body)
    await execute(
      'INSERT INTO creations (user_id,type,title,content,meta,ai_score) VALUES (?,?,?,?,?,?)',
      [req.user!.id, 'deai', '去AI味处理', result.final_content,
       JSON.stringify({ rounds: result.rounds.length, provider: result.provider }),
       result.final_score]
    )
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

// 内容检测
aiRouter.post('/detect', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkLen(req.body.content, LIMITS.CONTENT, 'content', res)) return
    const result = await detectContent(req.user!.id, req.body)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

// AI 智能排版（把纯文本转成带 Markdown 格式标记的文章）
aiRouter.post('/format', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!checkLen(req.body.content, LIMITS.CONTENT, 'content', res)) return
    const { content } = req.body as { content: string }
    if (!content?.trim()) return void res.status(400).json({ success: false, error: '内容不能为空' })

    const { chatWithFallback } = await import('../services/ai/chat')
    const prompt = `你是一位专业的公众号排版编辑。请对以下纯文本文章进行 Markdown 格式化处理：

要求：
1. 识别文章标题并标记为 # 一级标题
2. 识别段落小标题标记为 ## 二级标题
3. 识别列表内容标记为 - 列表
4. 识别需要强调的关键词用 **加粗**
5. 识别引言或重点段落用 > 引用格式
6. 保持原文内容不变，只添加格式标记
7. 段落之间用空行分隔

直接输出格式化后的 Markdown，不要任何前言说明。

原文：
${content.slice(0, 5000)}`

    const { content: formatted } = await chatWithFallback(req.user!.id, [{ role: 'user', content: prompt }])
    res.json({ success: true, data: { formatted } })
  } catch (err) { next(err) }
})
