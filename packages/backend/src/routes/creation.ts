import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth } from '../middleware/auth'
import { query, queryOne, execute } from '../db/connection'

export const creationRouter = Router()
creationRouter.use(requireAuth)

// ⚠️ /stats/overview 必须在 /:id 之前注册，否则会被 /:id 拦截
// 统计
creationRouter.get('/stats/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const uid = req.user!.id
    const [total, byType, recent, styles, docs] = await Promise.all([
      queryOne<{ c: number }>('SELECT COUNT(*) as c FROM creations WHERE user_id=?', [uid]),
      query<{ type: string; c: number }>('SELECT type, COUNT(*) as c FROM creations WHERE user_id=? GROUP BY type', [uid]),
      query('SELECT id,type,title,created_at FROM creations WHERE user_id=? ORDER BY created_at DESC LIMIT 5', [uid]),
      queryOne<{ c: number }>('SELECT COUNT(*) as c FROM style_prompts WHERE user_id=?', [uid]),
      queryOne<{ c: number }>('SELECT COUNT(*) as c FROM knowledge_docs WHERE user_id=?', [uid]),
    ])
    res.json({
      success: true,
      data: {
        total_creations:  total?.c ?? 0,
        total_styles:     styles?.c ?? 0,
        total_docs:       docs?.c ?? 0,
        by_type:          byType,
        recent_creations: recent,
      },
    })
  } catch (err) { next(err) }
})

// 列表（分页）
creationRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page      = Math.max(1, parseInt(req.query.page as string) || 1)
    const page_size = Math.min(50, parseInt(req.query.page_size as string) || 20)
    const type      = req.query.type as string
    const keyword   = req.query.keyword as string
    // 必须转为 number，mysql2 prepared statement 对 LIMIT/OFFSET 需要 number 类型
    const offset    = (page - 1) * page_size

    let where = 'WHERE user_id=?'
    const params: unknown[] = [req.user!.id]
    if (type && type !== 'all') { where += ' AND type=?'; params.push(type) }
    if (keyword) {
      where += ' AND (title LIKE ? OR content LIKE ?)'
      params.push(`%${keyword}%`, `%${keyword}%`)
    }

    const countSql = `SELECT COUNT(*) as total FROM creations ${where}`
    const listSql  = `SELECT id,type,title,content,meta,ai_score,created_at FROM creations ${where} ORDER BY created_at DESC LIMIT ${page_size} OFFSET ${offset}`

    const [countRows, items] = await Promise.all([
      query<{ total: number }>(countSql, params),
      query(listSql, params),   // LIMIT/OFFSET 直接内联，避免 prepared statement 类型问题
    ])

    res.json({
      success: true,
      data: { items, total: countRows[0]?.total ?? 0, page, page_size },
    })
  } catch (err) { next(err) }
})

// 详情
creationRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) return void res.status(400).json({ success: false, error: '无效的 ID' })
    const item = await queryOne(
      'SELECT * FROM creations WHERE id=? AND user_id=?',
      [id, req.user!.id]
    )
    if (!item) return void res.status(404).json({ success: false, error: '记录不存在' })
    res.json({ success: true, data: { item } })
  } catch (err) { next(err) }
})

// 更新（改标题或内容）
creationRouter.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) return void res.status(400).json({ success: false, error: '无效的 ID' })
    const { title, content } = req.body
    const sets: string[] = []; const vals: unknown[] = []
    if (title)   { sets.push('title=?');   vals.push(title)   }
    if (content) { sets.push('content=?'); vals.push(content) }
    if (!sets.length) return void res.status(400).json({ success: false, error: '无更新字段' })
    vals.push(id, req.user!.id)
    await execute(`UPDATE creations SET ${sets.join(',')} WHERE id=? AND user_id=?`, vals)
    res.json({ success: true, message: '更新成功' })
  } catch (err) { next(err) }
})

// 删除
creationRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id)
    if (isNaN(id)) return void res.status(400).json({ success: false, error: '无效的 ID' })
    const result = await execute('DELETE FROM creations WHERE id=? AND user_id=?', [id, req.user!.id])
    if (result.affectedRows === 0) return void res.status(404).json({ success: false, error: '记录不存在' })
    res.json({ success: true, message: '删除成功' })
  } catch (err) { next(err) }
})
