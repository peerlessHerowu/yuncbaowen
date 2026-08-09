import { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  logger.error(err.message, err)
  const status = (err as { status?: number }).status || 500
  res.status(status).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
  })
}
