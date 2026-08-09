import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth, requireActivated } from '../middleware/auth'
import { query, queryOne, execute } from '../db/connection'

export const styleRouter = Router()
styleRouter.use(requireAuth, requireActivated)

// 列表
styleRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const styles = await query(
      'SELECT id,name,description,source_urls,created_at FROM style_prompts WHERE user_id=? ORDER BY created_at DESC',
      [req.user!.id]
    )
    res.json({ success: true, data: { styles } })
  } catch (err) { next(err) }
})

// 创建（风格分析后保存）
styleRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, description, source_urls, prompt_content } = req.body
    if (!name || !prompt_content)
      return void res.status(400).json({ success: false, error: '名称和提示词不能为空' })
    const result = await execute(
      'INSERT INTO style_prompts (user_id,name,description,source_urls,prompt_content) VALUES (?,?,?,?,?)',
      [req.user!.id, name, description || '', JSON.stringify(source_urls || []), prompt_content]
    )
    res.status(201).json({ success: true, data: { id: result.insertId } })
  } catch (err) { next(err) }
})

// 详情
styleRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const style = await queryOne(
      'SELECT * FROM style_prompts WHERE id=? AND user_id=?',
      [req.params.id, req.user!.id]
    )
    if (!style) return void res.status(404).json({ success: false, error: '风格不存在' })
    res.json({ success: true, data: { style } })
  } catch (err) { next(err) }
})

// 删除
styleRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await execute(
      'DELETE FROM style_prompts WHERE id=? AND user_id=?',
      [req.params.id, req.user!.id]
    )
    if (result.affectedRows === 0)
      return void res.status(404).json({ success: false, error: '风格不存在' })
    res.json({ success: true, message: '删除成功' })
  } catch (err) { next(err) }
})
