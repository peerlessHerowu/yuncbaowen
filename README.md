# 云创一键爆文 · 落地页

> 公众号 / 头条 AI 写作助手 — 从热点选题到成稿发布，一条流水线，去 AI 味，爆款率高。

## 预览

- Hero：主标题打字动画 + 粒子背景 + 数据统计卡片
- Workflow：五步流程时间线（动态流光连接线）
- Features：四大功能 Tab 切换 + Mock UI 预览
- Why Us：差异化优势 2×2 对比卡片
- CTA：转化区 + Footer

## 技术栈

- 纯原生 HTML5 + CSS3 + JavaScript（无框架、无构建工具）
- Canvas API 粒子网络背景
- CSS Custom Properties 深色/浅色主题切换
- IntersectionObserver 滚动动画
- Google Fonts（Inter + Noto Sans SC）

## 文件结构

```
yuncbaowen/
├── index.html          # 主入口
├── css/
│   ├── tokens.css      # Design Tokens + Reset + 工具类
│   ├── navbar.css      # 导航栏
│   ├── hero.css        # Hero 区块
│   ├── workflow.css    # 五步流程
│   ├── features.css    # 功能 Tab
│   ├── whyus.css       # 差异对比
│   └── footer.css      # CTA + Footer
├── js/
│   ├── particles.js    # Canvas 粒子
│   ├── navbar.js       # 吸顶 + 汉堡菜单
│   ├── features.js     # Tab 切换
│   └── main.js         # 动画 + 数字计数 + 主题切换
└── docs/
    ├── 01-产品需求/PRD.md
    ├── 02-技术设计/技术架构.md
    └── 03-UI设计/UI设计规范.md
```

## 本地运行

直接用浏览器打开 `index.html`，或启动本地服务器：

```bash
python3 -m http.server 8080
# 访问 http://localhost:8080
```
