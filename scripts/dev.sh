#!/bin/bash
# 一键启动开发环境

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "🚀 云创爆文 · 开发环境启动"
echo "================================"

# 检查 MySQL
if ! mysqladmin ping -h localhost --silent 2>/dev/null; then
  echo "❌ MySQL 未启动，请先启动 MySQL"
  exit 1
fi
echo "✅ MySQL 已连接"

# 初始化数据库（首次）
cd "$ROOT/packages/backend"
if [ ! -f ".db_initialized" ]; then
  echo "📦 初始化数据库..."
  npx tsx scripts/init-db.ts
  npx tsx scripts/seed.ts
  touch .db_initialized
  echo "✅ 数据库初始化完成"
  echo ""
  echo "📋 测试账号："
  echo "   用户名: testuser  密码: test123456"
  echo "   测试卡密: YUNC-TEST-2026-PRO1"
fi

cd "$ROOT"

echo ""
echo "📡 启动后端 (http://localhost:3001)..."
echo "🖥️  启动前端 (http://localhost:5173)..."
echo ""
echo "按 Ctrl+C 停止所有服务"
echo "================================"

# 并发启动
pnpm dev
