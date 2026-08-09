import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
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

// 静态文件（上传的知识库文件）
app.use('/uploads', express.static(process.env.UPLOAD_DIR || './uploads'))

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
