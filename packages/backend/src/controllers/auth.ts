import { Request, Response, NextFunction } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { query, queryOne, execute } from '../db/connection'
import type { RegisterDto, LoginDto, ActivateDto, AuthResponse, ApiResponse } from '@yuncbaowen/shared'

function signToken(userId: number) {
  return jwt.sign({ sub: userId }, process.env.JWT_SECRET || 'secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  })
}

function signRefresh(userId: number) {
  return jwt.sign({ sub: userId }, process.env.JWT_REFRESH_SECRET || 'refresh', {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  })
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
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
      data: { user, token: signToken(userId), refresh_token: signRefresh(userId) },
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
      data: { user: authUser, token: signToken(user.id), refresh_token: signRefresh(user.id) },
    } as ApiResponse<AuthResponse>)
  } catch (err) { next(err) }
}

export async function activate(req: Request, res: Response, next: NextFunction) {
  try {
    const { card_key } = req.body as ActivateDto
    if (!card_key) return void res.status(400).json({ success: false, error: '请输入卡密' })

    const card = await queryOne<{ id: number; is_used: number; plan: string }>(
      'SELECT id, is_used, plan FROM card_keys WHERE code=?', [card_key]
    )
    if (!card)    return void res.status(400).json({ success: false, error: '卡密不存在' })
    if (card.is_used) return void res.status(400).json({ success: false, error: '卡密已被使用' })

    await execute('UPDATE users SET is_activated=1, plan=?, card_key=? WHERE id=?', [card.plan, card_key, req.user!.id])
    await execute('UPDATE card_keys SET is_used=1, used_by=?, used_at=NOW() WHERE id=?', [req.user!.id, card.id])

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
