/**
 * 规则引擎：AI 写作模式检测器
 * 基于 humanizer Skill / Wikipedia "Signs of AI writing"
 * 扫描高确定性的可正则匹配模式，输出精确定位结果
 */

export interface PatternHit {
  patternId: number      // 对应 33 种模式中的编号
  patternName: string    // 模式名称
  text: string           // 命中的文字
  index: number          // 在原文中的起始位置
  severity: 'high' | 'medium' | 'low'
  suggestion: string     // 改写建议
}

export interface DetectionReport {
  score: number          // 0-100，100 = 完全无 AI 模式
  hitCount: number
  hits: PatternHit[]
  summary: string        // 给 AI 改写用的简洁诊断
}

// ── 模式7：AI 高频词表 ──────────────────────────────────────────
const AI_VOCAB: string[] = [
  'actually', 'additionally', 'crucial', 'delve', 'emphasizing',
  'enduring', 'enhance', 'fostering', 'garner', 'highlight',
  'interplay', 'intricate', 'intricacies', 'pivotal', 'showcase',
  'tapestry', 'testament', 'underscore', 'valuable', 'vibrant',
  // 中文 AI 高频词
  '至关重要', '深入探讨', '错综复杂', '不可或缺', '彰显', '凸显',
  '赋能', '赋予', '深刻', '深远影响', '全面', '系统性',
  '独特魅力', '丰富多彩', '蓬勃发展', '欣欣向荣',
  // 补充典型 AI 中文套话
  '日新月异', '前所未有', '深刻地', '深刻影响', '革命性',
  '不可替代', '重要力量', '必然结果', '共同努力',
  '可持续发展', '动力源泉', '应用潜力', '技术迭代',
  '开放包容', '积极拥抱', '审慎思考', '有效规避',
  '技术红利', '潜在风险', '双刃剑', '各界', '社会各界',
  '人类命运', '命运共同体', '贡献力量', '美好未来',
  // 新增：更多中文 AI 特征词
  '广泛关注', '高度重视', '多维度', '全方位', '深层次',
  '新局面', '新高度', '新篇章', '新征程', '新阶段',
  '持续推进', '稳步推进', '扎实推进', '全面推进',
  '赋予重要', '具有重要', '发挥重要', '扮演重要',
  '引领作用', '示范作用', '带动作用', '支撑作用',
]

// ── 模式29：中文 AI 结构套路（新增）────────────────────────────
// 「首先…其次…最后/综上所述」三段式结构
const CHINESE_STRUCTURE_PHRASES: string[] = [
  '首先，', '其次，', '再次，', '最后，',
  '综上所述', '总而言之', '总的来说', '由此可见',
  '不难发现', '值得注意的是', '毋庸置疑',
  '在当今', '在当今这个', '随着时代', '时代背景下',
  '机遇与挑战', '与此同时', '与时俱进',
]

// ── 模式33：被动语态（AI 偏好）────────────────────────────────
const PASSIVE_VOICE: string[] = [
  '被认为是', '被广泛应用', '被大量使用', '被证明', '被视为',
  '得到了广泛', '受到了关注', '引起了重视', '获得了认可',
  '被广大', '被人们', '被越来越多',
]

// ── 模式34：数据虚引用（无来源的「权威背书」）──────────────────
const FAKE_DATA_REFS: string[] = [
  '研究表明', '数据显示', '据统计', '调查发现', '专家指出',
  '报告显示', '分析认为', '业内人士表示', '有关专家认为',
  '相关数据表明', '最新研究发现',
]

// ── 模式35：强因果套式（AI 逻辑连接词）────────────────────────
const CAUSAL_PATTERNS_RE = /之所以[\s\S]{1,30}是因为|正是由于[\s\S]{1,30}才|不仅[\s\S]{1,20}还[\s\S]{1,20}而且|一方面[\s\S]{1,30}另一方面/g

// ── 模式36：空洞升华句（文章末尾的宏大结论）──────────────────
const HOLLOW_ENDINGS: string[] = [
  '让我们共同', '携手共创', '为构建', '贡献自己的力量',
  '期待未来', '相信未来', '必将迎来', '共同迎接',
  '书写新篇章', '开创新局面', '迈向新征程',
  '在这个伟大的时代', '站在历史的', '肩负着时代的',
]

// ── 动态 PASS_SCORE：根据文本长度调整通过阈值 ──────────────────
/** ponytail: 线性插值近似，实际理想方案是基于文体类型细分，当前足够用 */
export function calcPassScore(textLength: number): number {
  if (textLength < 200) return 75
  if (textLength < 500) return 78
  if (textLength < 1000) return 80
  return 82
}
// ── 模式14：Em Dash（英文 em dash，不含中文破折号 ——）──────────
// 中文里的 —— 是正常标点，只检测单个 — 或英文 –
const EM_DASH_RE = /(?<!—)—(?!—)|–| -- /g

// ── 模式10：规则三（三元并列）───────────────────────────────────
// 匹配"A、B 和 C" 或 "A，B，以及 C" 或英文 "A, B, and C"
const RULE_OF_THREE_RE = /[\u4e00-\u9fff\w]+[、，,]\s*[\u4e00-\u9fff\w]+[、，,]\s*(以及|和|与|及|and|or)\s*[\u4e00-\u9fff\w]+/g

// ── 模式3：-ing 虚假深度（英文）─────────────────────────────────
const ING_CLAUSE_RE = /,\s*(highlighting|underscoring|emphasizing|reflecting|symbolizing|contributing|cultivating|fostering|showcasing)\s/gi

// ── 模式28：预告式开场白 ─────────────────────────────────────────
const SIGNPOST_PHRASES: string[] = [
  "let's dive in", "let's explore", "let's break this down",
  "here's what you need to know", "without further ado",
  "让我们深入", "让我们探索", "让我们来了解", "下面我们来",
  "接下来让我们", "话不多说",
]

// ── 模式20：对话协作痕迹 ─────────────────────────────────────────
const CHAT_ARTIFACTS: string[] = [
  "i hope this helps", "let me know if", "would you like",
  "want me to", "feel free to", "don't hesitate",
  "希望这对你有帮助", "如有疑问", "欢迎继续提问", "如需了解更多",
]

// ── 模式27：权威感套语 ───────────────────────────────────────────
const AUTHORITY_PHRASES: string[] = [
  "the real question is", "at its core", "what really matters",
  "the heart of the matter", "fundamentally speaking",
  "归根结底", "本质上", "说到底", "究其根本", "核心在于",
]

// ── 模式1/4：重要性/宣传词 ──────────────────────────────────────
const IMPORTANCE_WORDS: string[] = [
  'serves as', 'stands as', 'marks a', 'represents a',
  'is a testament', 'is a reminder', 'setting the stage',
  'groundbreaking', 'breathtaking', 'stunning', 'nestled',
  '标志着', '代表着', '体现了', '彰显了', '见证了',
]

// ── 模式22：讨好语气（中文场景）────────────────────────────────
const SYCOPHANTIC: string[] = [
  '当然！', '当然可以！', '好的！', '没问题！', '很好的问题',
  '这是一个很好', '非常好的', '非常棒的',
]

// ─── 工具函数 ────────────────────────────────────────────────────

function findAllMatches(text: string, re: RegExp, patternId: number, name: string, severity: PatternHit['severity'], suggestion: string): PatternHit[] {
  const hits: PatternHit[] = []
  const clone = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')
  let m: RegExpExecArray | null
  while ((m = clone.exec(text)) !== null) {
    hits.push({ patternId, patternName: name, text: m[0], index: m.index, severity, suggestion })
  }
  return hits
}

function findPhrases(text: string, phrases: string[], patternId: number, name: string, severity: PatternHit['severity'], suggestion: string): PatternHit[] {
  const lower = text.toLowerCase()
  const hits: PatternHit[] = []
  for (const phrase of phrases) {
    let pos = 0
    const p = phrase.toLowerCase()
    while ((pos = lower.indexOf(p, pos)) !== -1) {
      hits.push({ patternId, patternName: name, text: text.slice(pos, pos + phrase.length), index: pos, severity, suggestion })
      pos += p.length
    }
  }
  return hits
}

// ── 模式30：句子长度标准差检测 ──────────────────────────────────
// AI 写的句子长度极度均匀，标准差通常 < 10
// 真人写作标准差通常 > 15（有短句有长句）
function detectSentenceUniformity(text: string): PatternHit[] {
  const sentences = text
    .split(/[。！？!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 3)
  if (sentences.length < 4) return []

  const lengths = sentences.map(s => s.length)
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
  const variance = lengths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lengths.length
  const std = Math.sqrt(variance)

  if (std < 8) {
    return [{
      patternId: 30,
      patternName: '句子长度高度均匀',
      text: `均值${mean.toFixed(0)}字，标准差${std.toFixed(1)}（AI特征：<8）`,
      index: 0,
      severity: 'high',
      suggestion: '主动引入长短句交替：插入3-8字短句，或把长句拆成两句',
    }]
  }
  if (std < 12) {
    return [{
      patternId: 30,
      patternName: '句子长度较均匀',
      text: `均值${mean.toFixed(0)}字，标准差${std.toFixed(1)}（偏AI：<12）`,
      index: 0,
      severity: 'medium',
      suggestion: '适当引入更多短句',
    }]
  }
  return []
}

// ── 模式31：段落长度均匀度检测 ──────────────────────────────────
// AI 写的段落长度非常接近，真人写作段落长短不一
function detectParagraphUniformity(text: string): PatternHit[] {
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 10)
  if (paragraphs.length < 3) return []

  const lengths = paragraphs.map(p => p.length)
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length
  const variance = lengths.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lengths.length
  const std = Math.sqrt(variance)
  const cv = std / mean  // 变异系数，越小说明越均匀

  if (cv < 0.15) {
    return [{
      patternId: 31,
      patternName: '段落长度高度均匀',
      text: `${paragraphs.length}个段落，变异系数${(cv * 100).toFixed(0)}%（AI特征：<15%）`,
      index: 0,
      severity: 'medium',
      suggestion: '有意识地让某些段落非常短（1-2句），某些段落较长',
    }]
  }
  return []
}

// ── 模式32：句尾标点单一检测 ────────────────────────────────────
// AI 写作几乎所有句子都以句号结尾，真人会混用感叹号、问号
function detectPunctuationMonotony(text: string): PatternHit[] {
  const endings = (text.match(/[。！？!?]/g) || [])
  if (endings.length < 5) return []

  const periodCount = endings.filter(e => e === '。').length
  const periodRatio = periodCount / endings.length

  if (periodRatio > 0.92) {
    return [{
      patternId: 32,
      patternName: '句尾标点单一',
      text: `句号占比${(periodRatio * 100).toFixed(0)}%（AI特征：>92%）`,
      index: 0,
      severity: 'medium',
      suggestion: '适当用感叹号表达情绪，用问句引发思考',
    }]
  }
  return []
}

// ─── 主检测函数 ──────────────────────────────────────────────────

export function detectPatterns(text: string): DetectionReport {
  const allHits: PatternHit[] = []

  // 模式 7：AI 高频词（1个就算 medium，3个以上升为 high）
  const vocabHits = findPhrases(text, AI_VOCAB, 7, 'AI高频词', 'medium', '替换为更具体、更普通的表达')
  const uniqueVocab = new Set(vocabHits.map(h => h.text.toLowerCase()))
  vocabHits.forEach(h => {
    h.severity = uniqueVocab.size >= 3 ? 'high' : 'medium'
    allHits.push(h)
  })

  // 模式 29：中文 AI 结构套路（新增，high 级别）
  allHits.push(...findPhrases(text, CHINESE_STRUCTURE_PHRASES, 29, '中文AI结构套路', 'high', '删除这类程式化开头/结尾，直接说内容'))

  // 模式 14：Em Dash
  allHits.push(...findAllMatches(text, EM_DASH_RE, 14, 'Em Dash 滥用', 'high', '用逗号或句号替代，不要用破折号'))

  // 模式 10：规则三
  allHits.push(...findAllMatches(text, RULE_OF_THREE_RE, 10, '三元并列（规则三）', 'medium', '拆开写，不要强行凑三个'))

  // 模式 3：-ing 虚假深度（英文）
  allHits.push(...findAllMatches(text, ING_CLAUSE_RE, 3, '-ing 虚假深度', 'medium', '删掉 -ing 分词短语，改为独立句子'))

  // 模式 28：预告式开场白
  allHits.push(...findPhrases(text, SIGNPOST_PHRASES, 28, '预告式开场白', 'high', '删掉，直接说内容'))

  // 模式 20：对话协作痕迹
  allHits.push(...findPhrases(text, CHAT_ARTIFACTS, 20, '对话协作痕迹', 'high', '完全删除，这是聊天机器人的对话语，不是内容'))

  // 模式 27：权威感套语
  allHits.push(...findPhrases(text, AUTHORITY_PHRASES, 27, '权威感套语', 'medium', '删掉开场白，直接陈述观点'))

  // 模式 1/4：重要性/宣传词
  allHits.push(...findPhrases(text, IMPORTANCE_WORDS, 1, '重要性/宣传词', 'medium', '改用简单的是/有/做'))

  // 模式 22：讨好语气
  allHits.push(...findPhrases(text, SYCOPHANTIC, 22, '讨好语气', 'high', '直接删除'))

  // 模式 33：被动语态（AI 常用）
  allHits.push(...findPhrases(text, PASSIVE_VOICE, 33, '被动语态', 'medium', '改为主动语态，主语明确'))

  // 模式 34：数据虚引用（无来源的权威背书）
  // ponytail: 简单词匹配；理想情况应区分「研究表明+具体数字」vs 无来源引用，当前偏保守
  allHits.push(...findPhrases(text, FAKE_DATA_REFS, 34, '数据虚引用', 'medium', '去掉或补充真实来源，或改成第一人称「我发现」'))

  // 模式 35：强因果套式
  allHits.push(...findAllMatches(text, CAUSAL_PATTERNS_RE, 35, '强因果套式', 'medium', '改为短句直述，不要强调因果关系'))

  // 模式 36：空洞升华句
  allHits.push(...findPhrases(text, HOLLOW_ENDINGS, 36, '空洞升华句', 'high', '删除这类宏大结论，用具体话替代'))

  // 模式 30：句子长度均匀度（统计分析）
  allHits.push(...detectSentenceUniformity(text))

  // 模式 31：段落长度均匀度（统计分析）
  allHits.push(...detectParagraphUniformity(text))

  // 模式 32：句尾标点单一（统计分析）
  allHits.push(...detectPunctuationMonotony(text))

  // ── 计算评分 ──────────────────────────────────────────────────
  const highCount   = allHits.filter(h => h.severity === 'high').length
  const mediumCount = allHits.filter(h => h.severity === 'medium').length
  const lowCount    = allHits.filter(h => h.severity === 'low').length

  // 每个 high 扣 12 分，medium 扣 6 分，low 扣 2 分，最低 0 分
  const deduction = highCount * 12 + mediumCount * 6 + lowCount * 2
  const score = Math.max(0, 100 - deduction)

  // ── 生成给 AI 用的诊断摘要 ───────────────────────────────────
  const groupedByPattern: Record<string, string[]> = {}
  for (const h of allHits) {
    if (!groupedByPattern[h.patternName]) groupedByPattern[h.patternName] = []
    if (!groupedByPattern[h.patternName].includes(h.text)) {
      groupedByPattern[h.patternName].push(h.text)
    }
  }

  const summaryLines = Object.entries(groupedByPattern).map(([name, examples]) =>
    `【${name}】${examples.slice(0, 3).map(e => `"${e}"`).join('、')}`
  )

  const summary = allHits.length === 0
    ? '规则引擎未检测到明显AI模式'
    : `规则引擎发现 ${allHits.length} 处AI写作模式：\n${summaryLines.join('\n')}`

  return { score, hitCount: allHits.length, hits: allHits, summary }
}
