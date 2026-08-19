"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const connection_1 = require("../src/db/connection");
const logger_1 = require("../src/utils/logger");
async function seed() {
    logger_1.logger.info('Seeding test data...');
    // 测试用卡密
    const codes = ['YUNC-TEST-2026-PRO1', 'YUNC-TEST-2026-PRO2', 'YUNC-TEST-2026-DEV1'];
    for (const code of codes) {
        await (0, connection_1.execute)('INSERT IGNORE INTO card_keys (code, plan, duration_days) VALUES (?,?,?)', [code, 'pro', 365]);
    }
    logger_1.logger.info('✅ Card keys seeded:', codes);
    // 测试用户
    const hash = await bcryptjs_1.default.hash('test123456', 12);
    await (0, connection_1.execute)('INSERT IGNORE INTO users (username,email,password_hash,is_activated,plan) VALUES (?,?,?,?,?)', ['testuser', 'test@example.com', hash, 0, 'free']);
    logger_1.logger.info('✅ Test user: testuser / test123456');
    await connection_1.pool.end();
    logger_1.logger.info('✅ Seed complete');
}
seed().catch(err => { logger_1.logger.error(err); process.exit(1); });
