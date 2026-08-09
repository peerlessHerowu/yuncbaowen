# UI 设计规范

> 版本：v1.0 | 日期：2026-08-09

---

## 1. 设计理念

**关键词**：灵动、高级感、科技感、不千篇一律

- **暗色优先**：主背景深夜色，营造沉浸感，与同类产品白底形成差异
- **渐变点缀**：主色用紫→蓝渐变（AI科技感），辅以橙色高亮（行动力）
- **玻璃拟态**：卡片采用 glassmorphism，backdrop-filter 模糊，层次丰富
- **微动效**：卡片 hover 浮起 + 光晕，按钮点击涟漪，数字滚动计数

---

## 2. 色彩系统

```css
:root {
  /* 主背景 */
  --bg-primary:    #0a0a0f;   /* 深空黑 */
  --bg-secondary:  #0f0f1a;   /* 次级背景 */
  --bg-card:       rgba(255,255,255,0.04);  /* 卡片底色 */
  --bg-card-hover: rgba(255,255,255,0.08);

  /* 主色：紫→蓝渐变 */
  --accent-start:  #7c3aed;   /* 紫罗兰 */
  --accent-end:    #2563eb;   /* 宝蓝 */
  --accent-grad:   linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);

  /* 辅助色 */
  --accent-orange: #f97316;   /* 橙色（CTA / 高亮） */
  --accent-green:  #10b981;   /* 绿色（成功状态） */
  --accent-pink:   #ec4899;   /* 粉色（特殊标签） */

  /* 文字 */
  --text-primary:  #f8fafc;   /* 主文字：近白 */
  --text-secondary:#94a3b8;   /* 次级：浅灰蓝 */
  --text-muted:    #475569;   /* 弱化：深灰 */

  /* 边框 */
  --border-subtle: rgba(255,255,255,0.08);
  --border-accent: rgba(124,58,237,0.4);

  /* 发光效果 */
  --glow-purple:   0 0 40px rgba(124,58,237,0.3);
  --glow-blue:     0 0 40px rgba(37,99,235,0.3);
}
```

---

## 3. 字体系统

```css
/* 标题：Inter（英文）+ Noto Sans SC（中文） */
--font-display: 'Inter', 'Noto Sans SC', -apple-system, sans-serif;
/* 正文：系统字体栈 */
--font-body:    -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
/* 代码/数字：Mono */
--font-mono:    'JetBrains Mono', 'Fira Code', monospace;

/* 字号阶梯（8pt 基础网格） */
--text-xs:   0.75rem;   /* 12px */
--text-sm:   0.875rem;  /* 14px */
--text-base: 1rem;      /* 16px */
--text-lg:   1.125rem;  /* 18px */
--text-xl:   1.25rem;   /* 20px */
--text-2xl:  1.5rem;    /* 24px */
--text-3xl:  1.875rem;  /* 30px */
--text-4xl:  2.25rem;   /* 36px */
--text-5xl:  3rem;      /* 48px */
--text-6xl:  3.75rem;   /* 60px */
--text-7xl:  4.5rem;    /* 72px */
```

---

## 4. 间距系统（8pt 网格）

```css
--sp-1:  0.25rem;  /* 4px  */
--sp-2:  0.5rem;   /* 8px  */
--sp-3:  0.75rem;  /* 12px */
--sp-4:  1rem;     /* 16px */
--sp-6:  1.5rem;   /* 24px */
--sp-8:  2rem;     /* 32px */
--sp-12: 3rem;     /* 48px */
--sp-16: 4rem;     /* 64px */
--sp-20: 5rem;     /* 80px */
--sp-24: 6rem;     /* 96px */
```

---

## 5. 组件规范

### 5.1 按钮

```
Primary CTA（橙色）：
  background: linear-gradient(135deg, #f97316, #ea580c)
  padding: 14px 32px
  border-radius: 12px
  font-weight: 600
  box-shadow: 0 0 24px rgba(249,115,22,0.4)
  hover: scale(1.03) + glow 增强

Secondary（描边）：
  border: 1px solid rgba(255,255,255,0.2)
  background: rgba(255,255,255,0.06)
  backdrop-filter: blur(12px)
  hover: border-color 变亮
```

### 5.2 功能卡片

```
背景:  glassmorphism（bg-card + backdrop-filter: blur(16px)）
边框:  1px solid rgba(255,255,255,0.08)
圆角:  16px
hover: 
  - translateY(-6px)
  - border-color: var(--border-accent)
  - box-shadow: var(--glow-purple)
  - 过渡: 300ms cubic-bezier(0.34,1.56,0.64,1)（弹性）
```

### 5.3 Emoji 图标徽章

```
容器:  48px × 48px，border-radius: 14px
背景:  对应功能色系渐变（低饱和度）
字号:  24px
```

### 5.4 标签/Badge

```
Tag:  px-3 py-1，border-radius: 999px
背景: rgba(主色, 0.15)
文字: 主色
边框: 1px solid rgba(主色, 0.3)
```

---

## 6. 各区块视觉规范

### 6.1 Navbar
- 初始：透明背景
- 滚动后：`backdrop-filter: blur(20px)` + 半透明深色背景
- Logo：渐变文字（紫→蓝）+ 闪电图标
- 高度：64px（桌面）/ 56px（移动）

### 6.2 Hero
- 背景：`radial-gradient` 紫光晕 + Canvas 浮动粒子网
- 主标题：72px，font-weight: 800，渐变文字
- 副标题：20px，text-secondary
- 数字统计卡片：横排4个，glassmorphism 风格，数字滚动动画
- CTA 区：左侧主按钮（橙色）+ 右侧次按钮（描边）
- 装饰：漂浮的模糊色块（绝对定位，blur 80px）

### 6.3 Workflow 五步流程
- 布局：水平时间线，居中线条，上下交替内容
- 线条：渐变色（紫→蓝），带流动动画
- 节点：圆形徽章，数字 + 渐变背景
- 箭头：SVG 弧形箭头连接各步骤

### 6.4 Features 四大功能
- 切换方式：Tab 切换（SOURCING / WRITING / QUALITY / PUBLISH）
- 内容区：左侧功能列表 + 右侧 Mock UI 截图区
- Mock UI：圆角矩形模拟界面，渐变边框，内含功能说明

### 6.5 Why Us
- 布局：2×2 网格（桌面）/ 1列（移动）
- 卡片：glassmorphism + 左上角大图标
- 对比信息：「别家」vs「我们」横向对比行

### 6.6 CTA Bottom
- 背景：渐变网格背景
- 标题：40px，渐变色
- 按钮：特大橙色 CTA

### 6.7 Footer
- 背景：纯黑 #050508
- 分3列：品牌/产品链接/法律
- 分割线：1px 渐变淡入淡出

---

## 7. 动效规范

| 动效类型 | 参数 | 触发条件 |
|---------|-----|---------|
| 滚动淡入上移 | translateY(30px)→0, opacity 0→1, 600ms ease-out | 进入视口 |
| 卡片 hover 浮起 | translateY(-6px), 300ms cubic-bezier弹性 | hover |
| 数字计数 | 0→目标值，1200ms ease-out | 进入视口 |
| Canvas 粒子 | 60fps，线条连接，鼠标排斥 | 页面加载 |
| 时间线流动 | 渐变色 background-position 动画，3s linear infinite | 始终 |
| Tab 切换 | fade + slide，200ms | 点击 Tab |
| 深色/浅色切换 | CSS变量切换 + transition 200ms | 点击按钮 |

---

## 8. 响应式断点

```css
/* Mobile first */
/* xs: 0-479px   (单列，font-size 缩小) */
/* sm: 480-767px (单列，部分组件2列) */
/* md: 768-1023px (2列网格) */
/* lg: 1024-1279px (标准桌面) */
/* xl: 1280px+  (宽屏，最大宽度1280px居中) */

--container-max: 1280px;
--container-pad: clamp(1rem, 5vw, 4rem);
```
