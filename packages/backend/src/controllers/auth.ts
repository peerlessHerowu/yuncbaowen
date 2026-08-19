import { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { query, queryOne, execute } from '../db/connection'
import type { RegisterDto, LoginDto, ActivateDto, AuthResponse, ApiResponse } from '@yuncbaowen/shared'

function signToken(userId: number) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET!, {
    expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as string,
  })
}

function signRefresh(userId: number) {
  return jwt.sign({ sub: userId }, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as string,
  })
}

/** 生成 refresh token，同时将 hash 存库（支持吊销） */
async function issueRefreshToken(userId: number): Promise<string> {
  const token = signRefresh(userId)
  // 存 hash 而非明文，防止数据库泄露后 token 被直接使用
  const hash = crypto.createHash('sha256').update(token).digest('hex')
  await execute('UPDATE users SET refresh_token_hash=? WHERE id=?', [hash, userId])
  return token
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    // 注册开关：REGISTRATION_ENABLED=false 时关闭自由注册
    if (process.env.REGISTRATION_ENABLED === 'false') {
      return void res.status(403).json({ success: false, error: '注册功能已关闭，请联系管理员' })
    }

    const { username, email, password, card_key } = req.body as RegisterDto
    if (!username || !email || !password)
      return void res.status(400).json({ success: false, error: '用户名、邮箱和密码不能为空' })
    if (username.length < 2 || username.length > 32)
      return void res.status(400).json({ success: false, error: '用户名长度 2-32 位' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return void res.status(400).json({ success: false, error: '邮箱格式不正确' })
    if (password.length < 8)
      return void res.status(400).json({ success: false, error: '密码至少 8 位' })

    const existing = await queryOne('SELECT id FROM users WHERE username=? OR email=?', [username, email])
    if (existing) return void res.status(409).json({ success: false, error: '用户名或邮箱已被注册' })

    const hash = await bcrypt.hash(password, 12)

    // 检查卡密
    let isActivated = false
    let cardPlan = 'free'
    if (card_key) {
      const card = await queryOne<{ id: number; is_used: number; plan: string }>(
        'SELECT id, is_used, plan FROM card_keys WHERE code=?', [card_key]
      )
      if (!card) return void res.status(400).json({ success: false, error: '卡密不存在' })
      if (card.is_used)  return void res.status(400).json({ success: false, error: '卡密已被使用' })
      isActivated = true
      cardPlan = card.plan
    }

    const result = await execute(
      'INSERT INTO users (username,email,password_hash,is_activated,plan,card_key) VALUES (?,?,?,?,?,?)',
      [username, email, hash, isActivated ? 1 : 0, cardPlan, card_key || null]
    )
    const userId = result.insertId

    if (card_key && isActivated) {
      await execute('UPDATE card_keys SET is_used=1, used_by=?, used_at=NOW() WHERE code=?', [userId, card_key])
    }

    const user = await queryOne<AuthResponse['user']>(
      'SELECT id, username, email, avatar_url, is_activated, plan, created_at FROM users WHERE id=?', [userId]
    )

    res.status(201).json({
      success: true,
      data: { user, token: signToken(userId), refresh_token: await issueRefreshToken(userId) },
    } as ApiResponse<AuthResponse>)
  } catch (err) { next(err) }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, password } = req.body as LoginDto
    if (!username || !password)
      return void res.status(400).json({ success: false, error: '用户名和密码不能为空' })

    const user = await queryOne<{ id: number; password_hash: string; username: string; email: string; avatar_url: string | null; is_activated: number; plan: string; created_at: string }>(
      'SELECT id, password_hash, username, email, avatar_url, is_activated, plan, created_at FROM users WHERE username=? OR email=?',
      [username, username]
    )
    if (!user) return void res.status(401).json({ success: false, error: '用户名或密码错误' })

    const ok = await bcrypt.compare(password, user.password_hash)
    if (!ok) return void res.status(401).json({ success: false, error: '用户名或密码错误' })

    const { password_hash: _, ...safeUser } = user
    const authUser = { ...safeUser, is_activated: Boolean(safeUser.is_activated) }

    res.json({
      success: true,
      data: { user: authUser, token: signToken(user.id), refresh_token: await issueRefreshToken(user.id) },
    } as ApiResponse<AuthResponse>)
  } catch (err) { next(err) }
}

export async function activate(req: Request, res: Response, next: NextFunction) {
  try {
    const { card_key } = req.body as ActivateDto
    if (!card_key) return void res.status(400).json({ success: false, error: '请输入卡密' })

    // 先查 plan（不锁行，仅读取用于后续更新 users）
    const card = await queryOne<{ id: number; is_used: number; plan: string }>(
      'SELECT id, is_used, plan FROM card_keys WHERE code=?', [card_key]
    )
    if (!card) return void res.status(400).json({ success: false, error: '卡密不存在' })

    // 乐观锁：一次 UPDATE 原子标记，WHERE is_used=0 保证并发安全
    // affectedRows=0 说明已被其他请求抢先使用
    const lockResult = await execute(
      'UPDATE card_keys SET is_used=1, used_by=?, used_at=NOW() WHERE code=? AND is_used=0',
      [req.user!.id, card_key]
    )
    if (lockResult.affectedRows === 0) {
      return void res.status(400).json({ success: false, error: '卡密已被使用' })
    }

    await execute('UPDATE users SET is_activated=1, plan=?, card_key=? WHERE id=?', [card.plan, card_key, req.user!.id])

    const user = await queryOne('SELECT id,username,email,avatar_url,is_activated,plan,created_at FROM users WHERE id=?', [req.user!.id])
    res.json({ success: true, data: { user }, message: '激活成功！' })
  } catch (err) { next(err) }
}

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await queryOne(
      'SELECT id,username,email,avatar_url,is_activated,plan,created_at FROM users WHERE id=?',
      [req.user!.id]
    )
    res.json({ success: true, data: { user } })
  } catch (err) { next(err) }
}

/** 用 refresh token 换新的 access token（同时轮换 refresh token） */
export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refresh_token } = req.body
    if (!refresh_token) return void res.status(400).json({ success: false, error: '缺少 refresh_token' })

    let payload: { sub: number }
    try {
      payload = jwt.verify(refresh_token, process.env.JWT_REFRESH_SECRET!) as { sub: number }
    } catch {
      return void res.status(401).json({ success: false, error: 'refresh_token 无效或已过期' })
    }

    // 校验 hash 是否匹配数据库（防止已吊销的 token 被复用）
    const hash = crypto.createHash('sha256').update(refresh_token).digest('hex')
    const user = await queryOne<{ id: number; refresh_token_hash: string }>(
      'SELECT id, refresh_token_hash FROM users WHERE id=?', [payload.sub]
    )
    if (!user || user.refresh_token_hash !== hash) {
      return void res.status(401).json({ success: false, error: 'refresh_token 已失效，请重新登录' })
    }

    // 轮换：旧 refresh token 作废，签发新的
    const newToken        = signToken(user.id)
    const newRefreshToken = await issueRefreshToken(user.id)
    res.json({ success: true, data: { token: newToken, refresh_token: newRefreshToken } })
  } catch (err) { next(err) }
}

/** 登出：清除数据库中的 refresh_token_hash，使所有旧 refresh token 立即失效 */
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    await execute('UPDATE users SET refresh_token_hash=NULL WHERE id=?', [req.user!.id])
    res.json({ success: true, message: '已退出登录' })
  } catch (err) { next(err) }
}

/**
 * 管理员创建用户接口
 * 校验 Header: X-Admin-Secret，只有持有 ADMIN_SECRET 才能创建账号
 * 用法：curl -X POST /api/auth/admin/create-user -H "X-Admin-Secret: xxx" -d '{"username":"xxx","email":"xxx","password":"xxx","plan":"pro"}'
 */
export async function adminCreateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const adminSecret = req.headers['x-admin-secret']
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
      return void res.status(403).json({ success: false, error: '无权限' })
    }

    const { username, email, password, plan = 'free', is_activated = true } = req.body
    if (!username || !email || !password) {
      return void res.status(400).json({ success: false, error: 'username、email、password 不能为空' })
    }
    if (password.length < 8) {
      return void res.status(400).json({ success: false, error: '密码至少 8 位' })
    }

    const existing = await queryOne('SELECT id FROM users WHERE username=? OR email=?', [username, email])
    if (existing) {
      return void res.status(409).json({ success: false, error: '用户名或邮箱已存在' })
    }

    const hash = await bcrypt.hash(password, 12)
    const result = await execute(
      'INSERT INTO users (username,email,password_hash,is_activated,plan) VALUES (?,?,?,?,?)',
      [username, email, hash, is_activated ? 1 : 0, plan]
    )
    res.status(201).json({
      success: true,
      message: `用户 ${username} 创建成功`,
      data: { id: result.insertId, username, email, plan, is_activated },
    })
  } catch (err) { next(err) }
}
