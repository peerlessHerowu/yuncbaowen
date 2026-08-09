import mysql from 'mysql2/promise'
import { logger } from '../utils/logger'

export const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '3306'),
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME     || 'yuncbaowen',
  waitForConnections: true,
  connectionLimit:    20,
  queueLimit:         0,
  timezone:           '+00:00',
})

export async function testConnection() {
  try {
    const conn = await pool.getConnection()
    await conn.ping()
    conn.release()
    logger.info('✅ MySQL connected')
  } catch (err) {
    logger.error('❌ MySQL connection failed', err)
    throw err
  }
}

export async function query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]> {
  const [rows] = await pool.execute(sql, params)
  return rows as T[]
}

export async function queryOne<T = unknown>(sql: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}

export async function execute(sql: string, params?: unknown[]): Promise<mysql.ResultSetHeader> {
  const [result] = await pool.execute(sql, params)
  return result as mysql.ResultSetHeader
}
