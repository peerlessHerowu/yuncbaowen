import { Request, Response, NextFunction } from 'express'
import { logger } from '../utils/logger'

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now()
  res.on('finish', () => {
    const ms = Date.now() - start
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'debug'
    logger[level](`${req.method} ${req.path} ${res.statusCode} ${ms}ms`)
  })
  next()
}
