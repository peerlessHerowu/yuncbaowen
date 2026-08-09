import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { register, login, activate, getMe } from '../controllers/auth'
import { requireAuth } from '../middleware/auth'
import { loginLimiter } from '../middleware/rateLimit'

export const authRouter = Router()

authRouter.post('/register', loginLimiter, register)
authRouter.post('/login',    loginLimiter, login)
authRouter.post('/activate', requireAuth,  activate)
authRouter.get('/me',        requireAuth,  getMe)
