import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { register, login, activate, getMe, refresh, logout, adminCreateUser } from '../controllers/auth'
import { requireAuth } from '../middleware/auth'
import { loginLimiter } from '../middleware/rateLimit'

export const authRouter = Router()

authRouter.post('/register',             loginLimiter, register)
authRouter.post('/login',                loginLimiter, login)
authRouter.post('/activate',             requireAuth,  activate)
authRouter.get('/me',                    requireAuth,  getMe)
authRouter.post('/refresh',              refresh)
authRouter.post('/logout',               requireAuth,  logout)
authRouter.post('/admin/create-user',    adminCreateUser)  // 需要 X-Admin-Secret header
