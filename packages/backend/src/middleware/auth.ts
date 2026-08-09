import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { queryOne } from '../db/connection'

export interface AuthUser {
  id: number
  username: string
  email: string
  is_activated: boolean
  plan: string
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: '未登录，请先登录' })
    return
  }
  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret') as { sub: number }
    queryOne<AuthUser>(
      'SELECT id, username, email, is_activated, plan FROM users WHERE id = ?',
      [payload.sub]
    ).then(user => {
      if (!user) { res.status(401).json({ success: false, error: '用户不存在' }); return }
      req.user = user
      next()
    }).catch(next)
  } catch {
    res.status(401).json({ success: false, error: 'Token 无效或已过期' })
  }
}

export function requireActivated(req: Request, res: Response, next: NextFunction) {
  if (!req.user?.is_activated) {
    res.status(403).json({ success: false, error: '请先激活卡密以使用全部功能' })
    return
  }
  next()
}
