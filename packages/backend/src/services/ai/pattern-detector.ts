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
  // 中文对应词
  '至关重要', '深入探讨', '错综复杂', '不可或缺', '彰显', '凸显',
  '赋能', '赋予', '深刻', '深远影响', '全面', '系统性', '深度',
  '独特魅力', '丰富多彩', '蓬勃发展', '欣欣向荣',
]

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

// ─── 主检测函数 ──────────────────────────────────────────────────

export function detectPatterns(text: string): DetectionReport {
  const allHits: PatternHit[] = []

  // 模式 7：AI 高频词（连续出现 2 个以上才算强信号，单个降为 low）
  const vocabHits = findPhrases(text, AI_VOCAB, 7, 'AI高频词', 'medium', '替换为更具体、更普通的表达')
  // 统计不同词的命中数
  const uniqueVocab = new Set(vocabHits.map(h => h.text.toLowerCase()))
  vocabHits.forEach(h => {
    h.severity = uniqueVocab.size >= 3 ? 'high' : 'low'
    allHits.push(h)
  })

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
