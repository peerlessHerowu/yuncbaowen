import rateLimit from 'express-rate-limit'

export const loginLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_LOGIN || '5'),
  message: { success: false, error: '登录尝试过多，请 1 分钟后再试' },
  standardHeaders: true,
  legacyHeaders: false,
})

export const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1小时
  max: parseInt(process.env.RATE_LIMIT_MAX_AI || '60'),
  message: { success: false, error: 'AI 请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
})
