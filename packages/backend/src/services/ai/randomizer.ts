/**
 * Layer 3：随机化处理器
 * 目标：打断 AI 写作的统计规律，降低平台风控命中率
 *
 * 平台风控主要检测：
 * 1. 句子长度标准差（AI 写的句子长度很均匀）
 * 2. 标点分布规律（AI 每段末尾都是句号）
 * 3. 高频词分布（AI 用词均匀，缺少口语变化）
 * 4. 段落长度均匀（AI 每段字数接近）
 * 5. 缺少口语停顿词（真人有"其实""说真的""嗯"等）
 *
 * 所有操作都是确定性随机（用内容 hash 做种子），
 * 保证同一篇文章每次处理结果一致，不会每次都不一样。
 */

// ── 同义词替换表 ─────────────────────────────────────────────────
// key: 原词（AI 常用），value: 替换候选（真人口语）
const SYNONYM_MAP: Record<string, string[]> = {
  // 连接词
  '但是': ['但', '不过', '可', '然而', '话说回来'],
  '然而': ['但', '不过', '只是', '可话说回来'],
  '因此': ['所以', '这样一来', '于是', '就这样'],
  '所以': ['因此', '于是', '这样一来', '就'],
  '并且': ['而且', '还', '加上', '另外'],
  '同时': ['另外', '还有', '与此同时', '顺带'],
  '例如': ['比如', '像', '举个例子', '就说'],
  '比如': ['像', '举个例子', '就好比', '好比'],
  '通过': ['靠', '用', '借助', '凭'],
  '对于': ['对', '关于', '就'],
  '关于': ['说到', '谈到', '讲到'],
  '如果': ['要是', '假如', '万一', '倘若'],
  '虽然': ['虽说', '尽管', '即使', '就算'],
  '已经': ['早就', '都已经', '已', '就'],
  '非常': ['很', '挺', '相当', '蛮', '特别'],
  '十分': ['很', '挺', '相当', '蛮'],
  '极其': ['特别', '相当', '超级', '很'],
  '相当': ['挺', '很', '蛮', '还挺'],
  '开始': ['起步', '着手', '动手', '起'],
  '进行': ['做', '搞', '推进', '推动'],
  '实现': ['做到', '达到', '完成', '搞定'],
  '提高': ['提升', '增强', '改善', '加强'],
  '发展': ['成长', '推进', '扩展', '壮大'],
  '问题': ['麻烦', '事', '情况', '状况'],
  '方面': ['层面', '这块', '这边', '点上'],
  '情况': ['状态', '状况', '局面', '现状'],
  '影响': ['冲击', '改变', '左右', '动'],
  '体现': ['表现', '说明', '反映', '展示'],
  '表示': ['说', '表明', '讲', '觉得'],
  '认为': ['觉得', '认识到', '感觉', '看来'],
  // 扩展：更多 AI 常用词
  '与此同时': ['同时', '另外', '顺带'],
  '值得注意的是': ['有一点', '要说', '另外'],
  '不可否认': ['确实', '没错', '这一点'],
  '毋庸置疑': ['这是肯定的', '显然', '没什么好说的'],
  '显而易见': ['明显', '很明显', '一看就知道'],
  '尤其是': ['特别是', '尤其', '更是'],
  '此外': ['另外', '还有', '加上'],
  '然后': ['接着', '后来', '之后', '再'],
  '以及': ['和', '还有', '加上'],
  '导致': ['让', '使得', '造成', '引发'],
  '需要': ['得', '要', '应该'],
  '可以': ['能', '行', '可以的', '没问题'],
  '使用': ['用', '拿', '借'],
  '获得': ['拿到', '得到', '获取'],
  '具有': ['有', '带有', '拥有'],
  '展现': ['显示', '表现出', '呈现'],
  '构建': ['建立', '搭起', '做出'],
  '推动': ['带动', '促进', '驱动'],
  '助力': ['帮助', '支持', '推进'],
  '赋能': ['帮助', '让...能够', '支持'],
  '落地': ['实现', '推进', '做成', '落实'],
  '打造': ['做出', '建成', '创造'],
  '探索': ['尝试', '试试', '摸索'],
  '整合': ['结合', '合并', '汇总'],
  '聚焦': ['关注', '盯着', '针对'],
  '赋予': ['给', '带来', '提供'],
  '凸显': ['显示出', '说明', '反映出'],
}

// ── 口语停顿词（在合适位置插入）────────────────────────────────
// 按语境分类，避免乱插
const PAUSE_WORDS = {
  // 段落开头可插入
  START: ['说实话，', '其实，', '老实说，', '说真的，', '坦白讲，', '你看，', '有意思的是，'],
  // 转折前可插入
  TURN: ['话又说回来，', '当然了，', '不过话说回来，'],
  // 举例前可插入
  EXAMPLE: ['就拿', '比方说，', '举个真实的例子，'],
}

// ── 确定性随机数生成（基于字符串 hash）───────────────────────────
function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function seededChoice<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]
}

// ── 核心处理函数 ─────────────────────────────────────────────────

/**
 * 替换 AI 高频连接词为更口语化的同义词
 * 每个词用其在文本中的位置作为随机种子，保证确定性
 */
function replaceSynonyms(text: string): string {
  let result = text
  for (const [word, alternatives] of Object.entries(SYNONYM_MAP)) {
    // 用正则找到所有匹配位置
    const re = new RegExp(word, 'g')
    result = result.replace(re, (match, offset) => {
      // 20% 概率保留原词，80% 替换（用 offset 做种子）
      const seed = hashCode(text.slice(Math.max(0, offset - 5), offset + 5))
      if (seed % 5 === 0) return match  // 20% 保留
      return seededChoice(alternatives, seed)
    })
  }
  return result
}

/**
 * 随机化标点符号
 * AI 写作所有句子都以句号结尾，真人会混用感叹号、省略号、问号
 */
function randomizePunctuation(text: string): string {
  const sentences = text.split(/(?<=[。！？])\s*/)
  return sentences.map((sentence, i) => {
    if (!sentence.trim()) return sentence
    // 用句子内容 hash 做种子
    const seed = hashCode(sentence)
    // 只处理以句号结尾的句子，且不是最后一句
    if (sentence.endsWith('。') && i < sentences.length - 1) {
      const r = seed % 10
      if (r === 3) return sentence.slice(0, -1) + '！'   // 10% 换感叹号
      if (r === 7) return sentence.slice(0, -1) + '……'   // 10% 省略号（强调）
    }
    return sentence
  }).join('')
}

/**
 * 打散段落节奏
 * AI 写作段落长度均匀，这里随机合并相邻短段或拆分长句
 */
function shuffleParagraphRhythm(text: string): string {
  const paragraphs = text.split(/\n\n+/)
  if (paragraphs.length <= 2) return text  // 太短不处理

  const result: string[] = []
  let i = 0
  while (i < paragraphs.length) {
    const para = paragraphs[i]
    const seed = hashCode(para)
    // 如果当前段落很短（<30字）且有下一段，15% 概率合并
    if (para.length < 30 && i + 1 < paragraphs.length && seed % 7 === 0) {
      result.push(para + paragraphs[i + 1])
      i += 2
    } else {
      result.push(para)
      i++
    }
  }
  return result.join('\n\n')
}

/**
 * 在部分段落开头插入口语停顿词
 * 提升"真人感"，降低 AI 检测命中
 */
function insertPauseWords(text: string): string {
  const paragraphs = text.split(/\n\n+/)
  if (paragraphs.length <= 1) return text

  return paragraphs.map((para, i) => {
    // 跳过第一段（开头不加停顿词）和空段
    if (i === 0 || !para.trim()) return para
    const seed = hashCode(para)
    // 约 25% 的段落开头插入停顿词
    if (seed % 4 !== 1) return para
    // 根据段落首字判断插入哪类停顿词
    const firstChar = para.trim()[0]
    if (['但', '不', '可', '然', '虽'].includes(firstChar)) {
      return seededChoice(PAUSE_WORDS.TURN, seed) + para
    }
    if (['比', '例', '像', '举'].includes(firstChar)) {
      return seededChoice(PAUSE_WORDS.EXAMPLE, seed) + para
    }
    return seededChoice(PAUSE_WORDS.START, seed) + para
  }).join('\n\n')
}

// ── 主入口 ───────────────────────────────────────────────────────

export interface RandomizeOptions {
  synonyms?: boolean       // 是否做同义词替换（默认 true）
  punctuation?: boolean    // 是否随机化标点（默认 true）
  paragraphRhythm?: boolean // 是否打散段落节奏（默认 true）
  pauseWords?: boolean     // 是否插入口语停顿词（默认 true）
}

/**
 * Layer 3 主处理函数
 * 对 AI 改写后的文本做随机化处理，降低平台风控命中率
 */
export function randomizeText(text: string, options: RandomizeOptions = {}): string {
  const {
    synonyms = true,
    punctuation = true,
    paragraphRhythm = true,
    pauseWords = true,
  } = options

  let result = text
  if (synonyms)        result = replaceSynonyms(result)
  if (paragraphRhythm) result = shuffleParagraphRhythm(result)
  if (pauseWords)      result = insertPauseWords(result)
  if (punctuation)     result = randomizePunctuation(result)
  return result
}
