import winston from 'winston'

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, stack }) =>
      stack ? `${timestamp} [${level}] ${message}\n${stack}` : `${timestamp} [${level}] ${message}`
    )
  ),
  transports: [new winston.transports.Console()],
})
