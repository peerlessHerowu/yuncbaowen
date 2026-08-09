import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { pool, execute } from '../src/db/connection'
import { logger } from '../src/utils/logger'

async function seed() {
  logger.info('Seeding test data...')

  // 测试用卡密
  const codes = ['YUNC-TEST-2026-PRO1', 'YUNC-TEST-2026-PRO2', 'YUNC-TEST-2026-DEV1']
  for (const code of codes) {
    await execute(
      'INSERT IGNORE INTO card_keys (code, plan, duration_days) VALUES (?,?,?)',
      [code, 'pro', 365]
    )
  }
  logger.info('✅ Card keys seeded:', codes)

  // 测试用户
  const hash = await bcrypt.hash('test123456', 12)
  await execute(
    'INSERT IGNORE INTO users (username,email,password_hash,is_activated,plan) VALUES (?,?,?,?,?)',
    ['testuser', 'test@example.com', hash, 0, 'free']
  )
  logger.info('✅ Test user: testuser / test123456')

  await pool.end()
  logger.info('✅ Seed complete')
}

seed().catch(err => { logger.error(err); process.exit(1) })
