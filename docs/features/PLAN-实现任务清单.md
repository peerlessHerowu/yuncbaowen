# 实现任务清单

> 基于各功能设计文档，按优先级排列所有待实现任务。
> 每完成一个批次提交一次 git。

---

## 第一批：去AI味 + 内容检测（核心差异化）

### 1.1 规则引擎扩展
- [ ] `pattern-detector.ts`：新增模式33（被动语态）、34（数据虚引用）、35（强因果套式）、36（空洞升华句）
- [ ] `pattern-detector.ts`：动态 PASS_SCORE（根据文本长度：<200字=75，<500字=78，<1000字=80，>1000字=82）
- [ ] `randomizer.ts`：同义词表扩展到 80+ 组

### 1.2 Humanizer Prompt 重写
- [ ] `humanizer-prompt.ts`：按文档 3.3 节完整重写，加入目标读者画像和约束

### 1.3 内容检测重构
- [ ] 新建 `forbidden-words.ts`：本地违禁词库（广告法 200+ 词）
- [ ] `tasks.ts detectContent`：ai_taste 改用规则引擎，forbidden_words 用本地词库
- [ ] 检测总时间目标：< 5s（当前 15-30s）

### 1.4 去AI味前端重设计
- [ ] `DeAIPage.tsx`：三阶段进度条（规则检测/AI改写/随机优化）
- [ ] `DeAIPage.tsx`：左右对比视图（原文 vs 改写后）
- [ ] `DeAIPage.tsx`：评分环形图 + 问题词汇高亮

### 1.5 内容检测前端重设计
- [ ] `DetectPage.tsx`：评分环形图
- [ ] `DetectPage.tsx`：分项评分条形图
- [ ] `DetectPage.tsx`：问题词汇在原文中高亮
- [ ] `DetectPage.tsx`：每个问题旁边的行动快捷按钮

**提交：** `feat: 去AI味和内容检测全面升级`

---

## 第二批：多平台推文 + 热点追踪

### 2.1 多平台推文 SSE 化
- [ ] `routes/ai.ts`：`/api/ai/platform` 改为 SSE，逐平台推送
- [ ] `tasks.ts generatePlatforms`：逐平台生成并推送事件
- [ ] `formatter.ts`（新建）：各平台专项格式化（字数截断、emoji、hashtag）

### 2.2 多平台推文前端
- [ ] `PlatformPage.tsx`：SSE 接收，逐平台显示（不等全部完成）
- [ ] `PlatformPage.tsx`：内联编辑器（contenteditable textarea）
- [ ] `PlatformPage.tsx`：实时字数计算 + 超限警告
- [ ] `PlatformPage.tsx`：平台预览卡片风格（微博/小红书/朋友圈）

### 2.3 热点追踪
- [ ] `fetcher.ts`（trending）：缓存降级策略（返回 stale 数据 + 后台刷新）
- [ ] `TrendingPage.tsx`：数据新鲜度显示
- [ ] `TrendingPage.tsx`：热度进度条（相对最高值）
- [ ] `TrendingPage.tsx`：「以此选题」携带标题跳转

**提交：** `feat: 多平台推文SSE化+热点追踪优化`

---

## 第三批：创作链路（风格/生成/仿写）

### 3.1 定向生成流式体验
- [ ] 新建 `useStreamWriter.ts` hook（复用打字机逻辑）
- [ ] `GeneratePage.tsx`：真实打字机效果（requestAnimationFrame）
- [ ] `GeneratePage.tsx`：停止生成按钮 + AbortController
- [ ] `GeneratePage.tsx`：字数进度条
- [ ] `GeneratePage.tsx`：文章结构模板选择（5种）
- [ ] `GeneratePage.tsx`：完成后行动按钮（去AI味/检测/多平台/复制）

### 3.2 二次仿写
- [ ] `RewritePage.tsx`：复用 useStreamWriter hook
- [ ] `RewritePage.tsx`：改写意图选择（降重/换平台风格/口语化/趣味化）
- [ ] `RewritePage.tsx`：保留关键词输入框
- [ ] `RewritePage.tsx`：左右对比视图

### 3.3 风格复刻
- [ ] 新建 `metrics.ts`（style）：风格量化指标计算
- [ ] `StylePage.tsx`：URL 输入改为 Tag 模式
- [ ] `StylePage.tsx`：风格卡片展示量化指标

### 3.4 爆款标题
- [ ] `tasks.ts generateTitles`：扩展到 13 种套路，前端本地计算预估点击率
- [ ] `TitlePage.tsx`：标题卡片展示套路类型 + 点击率预估
- [ ] `TitlePage.tsx`：收藏功能（localStorage）
- [ ] `TitlePage.tsx`：「以此生成文章」携带 topic 跳转

**提交：** `feat: 创作链路全面优化（生成/仿写/风格/标题）`

---

## 第四批：文章排版（重建）

- [ ] `LayoutPage.tsx`：三栏布局（设置/编辑/预览）
- [ ] `LayoutPage.tsx`：5 种排版主题
- [ ] `LayoutPage.tsx`：手机形状预览
- [ ] `LayoutPage.tsx`：一键复制到公众号（富文本）
- [ ] 后端：`POST /api/ai/format`（AI 智能排版建议）

**提交：** `feat: 文章排版功能完整实现`

---

## 第五批：知识库 + 工作台

### 5.1 知识库
- [ ] 安装 `pdf-parse`，更新 `extractor.ts`
- [ ] `KnowledgePage.tsx`：三种添加方式（文件/粘贴/URL）
- [ ] `KnowledgePage.tsx`：知识库卡片重设计（chunk数/关键词/查看内容）
- [ ] 后端：`POST /api/knowledge/import-url`

### 5.2 工作台
- [ ] 后端：`GET /api/dashboard`（统计数据 + 热点摘要）
- [ ] `DashboardPage.tsx`：个性化问候 + 今日推荐
- [ ] `DashboardPage.tsx`：工作流动态进度
- [ ] `DashboardPage.tsx`：功能卡片重设计

**提交：** `feat: 知识库和工作台优化`

---

## 第六批：全局 UI 统一

- [ ] 建立 `components/ui/` 组件库（Card/Button/Badge/Empty/Progress）
- [ ] 全局空状态组件 + 应用到所有页面
- [ ] 快捷键支持（Cmd+Enter 提交）
- [ ] 移动端响应式（侧边栏折叠）
- [ ] 动画统一（所有页面用相同的进入动画）

**提交：** `feat: 全局UI统一和体验提升`

---

## 验收标准

每个功能完成后需要验证：
1. **功能正确**：用真实数据测试，不能有 500 错误
2. **性能**：AI 接口响应时间在合理范围（标注目标时间）
3. **UI**：符合设计规范，有空状态、错误状态
4. **移动端**：在 375px 宽度下可正常使用
5. **截图存档**：每个功能完成后截图保存到 `docs/screenshots/`
