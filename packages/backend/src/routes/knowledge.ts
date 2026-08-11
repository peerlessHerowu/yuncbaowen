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
    const id = parseInt(req.params.id)
    if (isNaN(id)) return void res.status(400).json({ success: false, error: 'ID 格式错误' })
    const doc = await queryOne<{ file_path: string }>(
      'SELECT file_path FROM knowledge_docs WHERE id=? AND user_id=?',
      [id, req.user!.id]
    )
    if (!doc) return void res.status(404).json({ success: false, error: '文件不存在' })
    try { fs.unlinkSync(doc.file_path) } catch {}
    await execute('DELETE FROM knowledge_docs WHERE id=? AND user_id=?', [id, req.user!.id])
    res.json({ success: true, message: '删除成功' })
  } catch (err) { next(err) }
})

// 鉴权文件下载（替代 /uploads 静态目录暴露）
// 只有文件归属当前用户才能下载，防止横向越权
knowledgeRouter.get('/files/:filename', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const filename = path.basename(req.params.filename) // 防止路径遍历：只取文件名
    const doc = await queryOne<{ filename: string; file_path: string }>(
      'SELECT filename, file_path FROM knowledge_docs WHERE file_path LIKE ? AND user_id=?',
      [`%${filename}`, req.user!.id]
    )
    if (!doc) return void res.status(403).json({ success: false, error: '无权访问或文件不存在' })
    const absPath = path.resolve(doc.file_path)
    // 二次确认：文件必须在 UPLOAD_DIR 目录下，防止路径遍历
    if (!absPath.startsWith(UPLOAD_DIR)) {
      return void res.status(403).json({ success: false, error: '非法路径' })
    }
    res.download(absPath, doc.filename)
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

// URL 导入（复用 crawler fetcher）
knowledgeRouter.post('/import-url', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url } = req.body as { url: string }
    if (!url?.startsWith('http')) return void res.status(400).json({ success: false, error: '请提供有效的 URL' })

    const { fetchArticle } = await import('../services/crawler/fetcher')
    const article = await fetchArticle(url)
    if (article.content.length < 50) {
      return void res.status(400).json({ success: false, error: '抓取的内容太少，可能被反爬拦截' })
    }

    const keywords = extractKeywords(article.content)
    const chunks   = chunkText(article.content)
    const filename = article.title.slice(0, 60) || `网页文章_${Date.now()}`
    const filePath = `url:${url}`  // URL 来源不存本地文件

    const result = await execute(
      'INSERT INTO knowledge_docs (user_id,filename,file_path,file_size,content_text,keywords,chunk_count) VALUES (?,?,?,?,?,?,?)',
      [req.user!.id, filename, filePath, article.content.length, article.content, JSON.stringify(keywords), chunks.length]
    )
    res.status(201).json({ success: true, data: { id: result.insertId, filename, chunk_count: chunks.length } })
  } catch (err) { next(err) }
})

// 粘贴文本导入
knowledgeRouter.post('/import-text', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { text, title } = req.body as { text: string; title?: string }
    if (!text?.trim() || text.trim().length < 20) {
      return void res.status(400).json({ success: false, error: '内容至少 20 字' })
    }

    const keywords = extractKeywords(text.trim())
    const chunks   = chunkText(text.trim())
    const filename = (title?.trim() || `粘贴文本_${new Date().toLocaleDateString('zh-CN')}`).slice(0, 60)

    const result = await execute(
      'INSERT INTO knowledge_docs (user_id,filename,file_path,file_size,content_text,keywords,chunk_count) VALUES (?,?,?,?,?,?,?)',
      [req.user!.id, filename, 'text:paste', text.length, text.trim(), JSON.stringify(keywords), chunks.length]
    )
    res.status(201).json({ success: true, data: { id: result.insertId, filename, chunk_count: chunks.length } })
  } catch (err) { next(err) }
})
