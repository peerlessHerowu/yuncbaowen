import 'dotenv/config'
import mysql from 'mysql2/promise'
import { logger } from '../src/utils/logger'

const SQL = `
CREATE DATABASE IF NOT EXISTS yuncbaowen CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE yuncbaowen;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  username     VARCHAR(32)  NOT NULL UNIQUE,
  email        VARCHAR(128) NOT NULL UNIQUE,
  password_hash VARCHAR(128) NOT NULL,
  avatar_url   VARCHAR(512),
  is_activated TINYINT(1)  NOT NULL DEFAULT 0,
  plan         ENUM('free','pro','enterprise') NOT NULL DEFAULT 'free',
  model_config JSON,
  card_key     VARCHAR(64),
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email)
) ENGINE=InnoDB;

-- 卡密表
CREATE TABLE IF NOT EXISTS card_keys (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code         VARCHAR(64)  NOT NULL UNIQUE,
  is_used      TINYINT(1)  NOT NULL DEFAULT 0,
  used_by      INT UNSIGNED,
  used_at      DATETIME,
  plan         ENUM('pro','enterprise') NOT NULL DEFAULT 'pro',
  duration_days INT NOT NULL DEFAULT 365,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- 风格提示词库
CREATE TABLE IF NOT EXISTS style_prompts (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id        INT UNSIGNED NOT NULL,
  name           VARCHAR(64)  NOT NULL,
  description    TEXT,
  source_urls    JSON,
  prompt_content LONGTEXT     NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
) ENGINE=InnoDB;

-- 创作历史
CREATE TABLE IF NOT EXISTS creations (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL,
  type            ENUM('title','article','rewrite','platform','deai','style') NOT NULL,
  title           VARCHAR(256) NOT NULL,
  content         LONGTEXT     NOT NULL,
  meta            JSON,
  source_style_id INT UNSIGNED,
  platform        VARCHAR(32),
  ai_score        TINYINT UNSIGNED,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_type (user_id, type),
  INDEX idx_user_created (user_id, created_at)
) ENGINE=InnoDB;

-- 知识库文档
CREATE TABLE IF NOT EXISTS knowledge_docs (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id      INT UNSIGNED NOT NULL,
  filename     VARCHAR(256) NOT NULL,
  file_path    VARCHAR(512) NOT NULL,
  file_size    INT UNSIGNED NOT NULL,
  content_text LONGTEXT,
  keywords     JSON,
  chunk_count  INT UNSIGNED NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id)
) ENGINE=InnoDB;

-- 热点缓存
CREATE TABLE IF NOT EXISTS trending_cache (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  platform    VARCHAR(16)  NOT NULL,
  title       VARCHAR(512) NOT NULL,
  url         VARCHAR(1024),
  heat_value  INT UNSIGNED NOT NULL DEFAULT 0,
  category    VARCHAR(32)  NOT NULL DEFAULT 'all',
  rank_pos    INT UNSIGNED NOT NULL DEFAULT 0,
  fetched_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_platform_fetched (platform, fetched_at)
) ENGINE=InnoDB;
`

async function init() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  })
  try {
    await conn.query(SQL)
    logger.info('✅ Database initialized successfully')
  } finally {
    await conn.end()
  }
}

init().catch(err => { logger.error(err); process.exit(1) })
