# 云创一键爆文 · 全栈产品

> 公众号 / 头条 AI 写作助手 — 从热点选题到成稿发布，真正能用的全栈产品

---

## 技术栈

| 层 | 技术 |
|---|-----|
| 前端 | React 18 + Vite + TypeScript + Tailwind CSS |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | MySQL 8 |
| 缓存 | Redis |
| 认证 | JWT + bcrypt |
| AI | BYOK 多模型代理（DeepSeek/OpenAI/Claude/通义/Kimi/智谱/Gemini）|
| 文件 | Multer 本地存储 |

## 项目结构

```
yuncbaowen/
├── packages/
│   ├── frontend/     # React + Vite 前端
│   ├── backend/      # Express API 后端
│   └── shared/       # 前后端共享类型
├── scripts/
│   └── dev.sh        # 一键启动脚本
└── docs/             # 产品/技术/UI 设计文档
    ├── 01-产品需求/PRD.md
    ├── 02-技术设计/技术架构.md
    ├── 03-UI设计/UI设计规范.md
    └── 04-全栈设计/01-架构设计.md
```

## 功能模块（13+）

| 分类 | 功能 |
|-----|-----|
| 选题·找爆点 | 热点追踪（微博/知乎/抖音/头条）、爆款标题生成 |
| 创作·出爆文 | 风格复刻、定向生成（流式）、二次仿写（流式）、多平台推文 |
| 质检·更真更稳 | 去AI味闭环（自动3轮）、四维内容检测、本地知识库 RAG |
| 成稿·直接发 | Markdown 排版、多主题配色、封面生成、创作历史 |
| 系统 | 注册/登录、卡密激活、多模型 BYOK、故障切换 |

## 本地运行

### 1. 前置条件

- Node.js >= 18
- MySQL 8（本地运行）
- pnpm

### 2. 安装依赖

```bash
cd yuncbaowen
pnpm install --ignore-scripts
```

### 3. 配置环境变量

```bash
cp packages/backend/.env.example packages/backend/.env
# 按需修改 DB_PASSWORD、JWT_SECRET 等
```

### 4. 初始化数据库

```bash
cd packages/backend
npx tsx scripts/init-db.ts
npx tsx scripts/seed.ts
```

数据库初始化后会创建测试账号：
- 用户名：`testuser` 密码：`test123456`
- 测试卡密：`YUNC-TEST-2026-PRO1`

### 5. 启动项目

```bash
# 在项目根目录
pnpm dev

# 或分别启动
cd packages/backend  && npx tsx src/index.ts   # http://localhost:3001
cd packages/frontend && npx vite               # http://localhost:5173
```

### 6. 配置 AI 模型

登录后进入「模型设置」，添加你的 API Key：
- DeepSeek：https://platform.deepseek.com
- OpenAI：https://platform.openai.com
- Claude：https://console.anthropic.com
- 通义：https://dashscope.aliyun.com
- Kimi：https://platform.moonshot.cn

Key 使用 AES-256-GCM 加密存储在数据库，不会以明文返回前端。

## API 文档

### Auth
```
POST /api/auth/register  注册
POST /api/auth/login     登录
POST /api/auth/activate  激活卡密
GET  /api/auth/me        获取当前用户
```

### AI 功能（需登录+激活）
```
POST /api/ai/title           爆款标题
POST /api/ai/style-analyze   风格分析
POST /api/ai/generate        定向生成（SSE流式）
POST /api/ai/rewrite         二次仿写（SSE流式）
POST /api/ai/platform        多平台推文
POST /api/ai/deai            去AI味（自动多轮）
POST /api/ai/detect          内容检测
```

### 其他
```
GET  /api/trending           热点追踪
POST /api/knowledge/upload   上传知识库文档
GET  /api/knowledge/list     文档列表
POST /api/knowledge/search   关键词检索
GET  /api/creations          创作历史
GET  /api/settings/models    模型配置
PUT  /api/settings/models    保存模型配置
POST /api/settings/test      测试连通性
```

## 安全说明

- 密码：bcrypt rounds=12 哈希
- JWT：7天有效期，refresh token 30天
- API Key：AES-256-GCM 加密存储，从不明文返回
- 接口限流：登录 20次/分钟，AI 120次/小时
- SQL：全部 prepared statements，无 SQL 注入风险
- 文件上传：类型白名单 + 20MB 大小限制
