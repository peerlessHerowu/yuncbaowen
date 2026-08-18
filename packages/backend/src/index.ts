import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import path from 'path'
import fs from 'fs'
import { authRouter } from './routes/auth'
import { aiRouter } from './routes/ai'
import { trendingRouter } from './routes/trending'
import { knowledgeRouter } from './routes/knowledge'
import { creationRouter } from './routes/creation'
import { settingsRouter } from './routes/settings'
import { styleRouter } from './routes/style'
import { errorHandler } from './middleware/error'
import { requestLogger } from './middleware/logger'
import { testConnection } from './db/connection'
import { logger } from './utils/logger'

// ── 启动前安全校验：必须配置的环境变量 ──────────────────────────
const REQUIRED_ENV = ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'AES_SECRET_KEY', 'ADMIN_SECRET'] as const
for (const key of REQUIRED_ENV) {
  if (!process.env[key] || process.env[key]!.length < 16) {
    console.error(`[FATAL] 环境变量 ${key} 未配置或长度不足16位，拒绝启动。请在 .env 中设置。`)
    process.exit(1)
  }
}
// JWT/AES 需要更长
for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'AES_SECRET_KEY'] as const) {
  if (process.env[key]!.length < 32) {
    console.error(`[FATAL] 环境变量 ${key} 长度不足32位，拒绝启动。`)
    process.exit(1)
  }
}

const app = express()
const PORT = process.env.PORT || 3001

// 基础中间件
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(requestLogger)

// 注意：/uploads 静态中间件已移除，改为 /api/knowledge/files/:filename 鉴权下载
// 缓存图片：公开可访问（用于仿写结果中的图片，解决微信防盗链 + 头条签名过期问题）
const CACHED_IMGS_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads', 'cached-imgs')
if (!fs.existsSync(CACHED_IMGS_DIR)) fs.mkdirSync(CACHED_IMGS_DIR, { recursive: true })
app.use('/imgs', express.static(CACHED_IMGS_DIR, { maxAge: '365d', immutable: true }))

// 路由
app.use('/api/auth',      authRouter)
app.use('/api/ai',        aiRouter)
app.use('/api/trending',  trendingRouter)
app.use('/api/knowledge', knowledgeRouter)
app.use('/api/creations', creationRouter)
app.use('/api/settings',  settingsRouter)
app.use('/api/style',     styleRouter)

// 健康检查
app.get('/health', (_, res) => res.json({ status: 'ok', ts: Date.now() }))

// 错误处理（必须放最后）
app.use(errorHandler)

async function start() {
  await testConnection()
  app.listen(PORT, () => {
    logger.info(`🚀 Backend running at http://localhost:${PORT}`)
  })
}

start().catch(err => {
  logger.error('Failed to start server', err)
  process.exit(1)
})
