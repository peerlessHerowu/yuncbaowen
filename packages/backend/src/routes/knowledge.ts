import { Router, Request, Response, NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { requireAuth, requireActivated } from '../middleware/auth'
import { execute, query, queryOne } from '../db/connection'
import { extractText, extractKeywords, chunkText, searchByKeywords } from '../services/rag/extractor'

export const knowledgeRouter = Router()
knowledgeRouter.use(requireAuth, requireActivated)

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads')
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_, file, cb) => {
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`
    cb(null, name)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || '20971520') },
  fileFilter: (_, file, cb) => {
    const allowed = ['.txt', '.md', '.pdf', '.json', '.markdown']
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true)
    else cb(new Error('仅支持 TXT / MD / PDF / JSON 格式'))
  },
})

// 上传文件
knowledgeRouter.post('/upload', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return void res.status(400).json({ success: false, error: '请选择文件' })

    const text     = await extractText(req.file.path)
    const keywords = extractKeywords(text)
    const chunks   = chunkText(text)

    const result = await execute(
      'INSERT INTO knowledge_docs (user_id,filename,file_path,file_size,content_text,keywords,chunk_count) VALUES (?,?,?,?,?,?,?)',
      [req.user!.id, req.file.originalname, req.file.path, req.file.size,
       text.slice(0, 200000), JSON.stringify(keywords), chunks.length]
    )
    res.json({
      success: true,
      data: {
        id: result.insertId,
        filename: req.file.originalname,
        file_size: req.file.size,
        chunk_count: chunks.length,
        keywords,
      },
    })
  } catch (err) { next(err) }
})

// 列表
knowledgeRouter.get('/list', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const docs = await query(
      'SELECT id,filename,file_size,chunk_count,keywords,created_at FROM knowledge_docs WHERE user_id=? ORDER BY created_at DESC',
      [req.user!.id]
    )
    res.json({ success: true, data: { docs } })
  } catch (err) { next(err) }
})

// 删除
knowledgeRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const doc = await queryOne<{ file_path: string }>(
      'SELECT file_path FROM knowledge_docs WHERE id=? AND user_id=?',
      [req.params.id, req.user!.id]
    )
    if (!doc) return void res.status(404).json({ success: false, error: '文件不存在' })
    try { fs.unlinkSync(doc.file_path) } catch {}
    await execute('DELETE FROM knowledge_docs WHERE id=? AND user_id=?', [req.params.id, req.user!.id])
    res.json({ success: true, message: '删除成功' })
  } catch (err) { next(err) }
})

// 关键词搜索
knowledgeRouter.post('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { query: q, doc_ids } = req.body as { query: string; doc_ids?: number[] }
    if (!q) return void res.status(400).json({ success: false, error: '请输入搜索词' })

    let sql = 'SELECT id,filename,content_text FROM knowledge_docs WHERE user_id=?'
    const params: unknown[] = [req.user!.id]
    if (doc_ids?.length) {
      sql += ` AND id IN (${doc_ids.map(() => '?').join(',')})`
      params.push(...doc_ids)
    }

    const docs = await query<{ id: number; filename: string; content_text: string }>(sql, params)
    const results = docs.flatMap(doc => {
      const chunks  = chunkText(doc.content_text || '')
      const matches = searchByKeywords(chunks, q, 2)
      return matches.map(m => ({
        doc_id:    doc.id,
        filename:  doc.filename,
        snippet:   m.chunk.slice(0, 200),
        relevance: m.score,
      }))
    }).sort((a, b) => b.relevance - a.relevance).slice(0, 5)

    res.json({ success: true, data: { results } })
  } catch (err) { next(err) }
})
