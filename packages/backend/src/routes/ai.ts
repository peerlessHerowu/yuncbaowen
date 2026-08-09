import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth, requireActivated } from '../middleware/auth'
import { aiLimiter } from '../middleware/rateLimit'
import {
  generateTitles, analyzeStyle, generateArticle,
  rewriteArticle, generatePlatforms, deaiProcess, detectContent,
} from '../services/ai/tasks'
import { execute } from '../db/connection'

export const aiRouter = Router()
aiRouter.use(requireAuth, requireActivated, aiLimiter)

// 爆款标题
aiRouter.post('/title', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await generateTitles(req.user!.id, req.body)
    // 保存到历史
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
    const result = await analyzeStyle(req.user!.id, req.body)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})

// 定向生成（SSE 流式）
aiRouter.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    let full = ''
    const { provider } = await generateArticle(req.user!.id, req.body, chunk => {
      full += chunk
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`)
    })
    // 保存历史
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
  try {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()

    let full = ''
    const { provider } = await rewriteArticle(req.user!.id, req.body, chunk => {
      full += chunk
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`)
    })
    await execute(
      'INSERT INTO creations (user_id,type,title,content,meta) VALUES (?,?,?,?,?)',
      [req.user!.id, 'rewrite', '二次仿写', full, JSON.stringify({ provider })]
    )
    res.write(`data: ${JSON.stringify({ done: true, provider })}\n\n`)
    res.end()
  } catch (err) { next(err) }
})

// 多平台推文
aiRouter.post('/platform', async (req: Request, res: Response, next: NextFunction) => {
  try {
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
    const result = await detectContent(req.user!.id, req.body)
    res.json({ success: true, data: result })
  } catch (err) { next(err) }
})
