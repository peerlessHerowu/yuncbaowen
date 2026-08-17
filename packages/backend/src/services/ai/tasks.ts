import { chatWithFallback, streamWithFallback } from './chat'
import { detectPatterns, calcPassScore } from './pattern-detector'
import { HUMANIZER_SYSTEM_PROMPT } from './humanizer-prompt'
import { randomizeText } from './randomizer'
import { fetchArticles } from '../crawler/fetcher'
import { formatForPlatform } from '../platform/formatter'
import { query } from '../../db/connection'
import type {
  TitleRequest, TitleResult,
  StyleAnalyzeRequest, StylePrompt,
  GenerateRequest,
  RewriteRequest,
  PlatformRequest, PlatformResult,
  DeAIRequest, DeAIResult,
  DetectRequest, DetectResult,
} from '@yuncbaowen/shared'

/**
 * 从 AI 返回的文本中提取 JSON
 * 只做一件事：去掉 markdown 代码块后直接 JSON.parse
 * 如果 Claude 返回了纯 JSON（无代码块），直接成功
 * 如果有代码块，去掉后成功
 */
function extractJSON(text: string): string {
  // 去掉开头的 ```json 或 ``` 以及结尾的 ```
  return text
    .replace(/^\s*```(?:json)?\s*\n?/i, '')
    .replace(/\n?\s*```\s*$/i, '')
    .trim()
}

// ─── 爆款标题 ────────────────────────────────────────────────
// 13 种套路，每次随机选 count 个要覆盖的类型
const ALL_TITLE_TYPES = [
  { type: '悬念式',   hint: '隐藏关键信息，引发好奇心，让读者想点进来看答案' },
  { type: '数字式',   hint: '用具体数字增加可信度，如「5个方法」「3天学会」' },
  { type: '反差式',   hint: '打破常规认知，制造意外冲击，如「月薪3千的他，却活得比年薪百万的人更自由」' },
  { type: '痛点式',   hint: '直击目标读者的真实痛苦，让人感同身受' },
  { type: '福利式',   hint: '提供免费干货价值，让人觉得不看亏了' },
  { type: '共鸣式',   hint: '让目标读者觉得「这说的就是我」，强烈代入感' },
  { type: '案例式',   hint: '用真实人物故事开头，增加真实感和背书' },
  { type: '对比式',   hint: '用鲜明对比证明价值，如「做了 vs 没做」「以前 vs 现在」' },
  { type: '提问式',   hint: '直接向读者提问，引发自我审视和思考' },
  { type: '打赌式',   hint: '用挑战语气激发读者好奇心，如「我打赌你没见过这个方法」' },
  { type: '紧迫式',   hint: '制造时间紧迫感，如「2026年前必须知道的」' },
  { type: '身份式',   hint: '用身份定位吸引目标人群，如「给还在迷茫的你」' },
  { type: '趋势式',   hint: '蹭热点或时代感，让人觉得紧跟潮流' },
]

export async function generateTitles(userId: number, req: TitleRequest): Promise<TitleResult> {
  const count = req.count ?? 12
  // 每次随机选 min(count, 8) 个套路覆盖，让结果更多样
  const shuffled = [...ALL_TITLE_TYPES].sort(() => Math.random() - 0.5)
  const selectedTypes = shuffled.slice(0, Math.min(count, 8))
  const typeList = selectedTypes.map(t => `- ${t.type}：${t.hint}`).join('\n')

  const prompt = `你是一位顶级公众号运营专家，擅长写高点击率标题。

主题：「${req.topic}」
${req.style ? `写作风格参考：${req.style}` : ''}

请用以下套路各生成 1-2 个标题，共生成 ${count} 个：
${typeList}

要求：
- 标题长度 15-28 字（太短没信息量，太长会被截断）
- 有具体细节，不要空洞（❌「如何提升效率」→ ✅「用这3个AI工具，我每天省了4小时」）
- 避免违禁词：最好、最快、第一、最强

以纯 JSON 返回（不要 markdown，直接输出），格式：{"titles":[{"text":"标题文字","type":"套路类型"}]}`

  const { content, provider } = await chatWithFallback(userId, [
    { role: 'user', content: prompt }
  ], { temperature: 0.9 })

  try {
    const cleaned = extractJSON(content)
    const parsed = JSON.parse(cleaned) as { titles: Array<{ text: string; type: string }> }
    return { titles: parsed.titles.slice(0, count + 3), provider }  // 多返回几个备用
  } catch {
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('```'))
    return {
      titles: lines.slice(0, count).map((text, i) => ({
        text: text.replace(/^\d+[.、]\s*/, '').trim(),
        type: ALL_TITLE_TYPES[i % ALL_TITLE_TYPES.length].type,
      })),
      provider,
    }
  }
}

// ─── 风格分析 ────────────────────────────────────────────────
export async function analyzeStyle(userId: number, req: StyleAnalyzeRequest): Promise<StylePrompt> {
  // 先抓取所有 URL 的真实内容
  const { success: articles, failed } = await fetchArticles(req.urls)

  if (articles.length === 0) {
    const errMsg = failed.map(f => `${f.url}: ${f.error}`).join('；')
    throw new Error(`所有文章抓取失败：${errMsg}`)
  }

  // 构建文章内容摘要，每篇最多 3000 字防止 token 超限
  const articleSummaries = articles.map((a, i) => {
    const preview = a.content.slice(0, 3000)
    return `【文章${i + 1}】标题：${a.title}\n作者：${a.author || '未知'}\n正文：\n${preview}`
  }).join('\n\n---\n\n')

  // 告知哪些 URL 抓取失败
  const failedNote = failed.length > 0
    ? `\n注意：以下 ${failed.length} 篇文章抓取失败，已跳过：${failed.map(f => f.url).join('、')}`
    : ''

  const prompt = `你是写作风格分析专家。请分析以下 ${articles.length} 篇文章的写作风格指纹：
${failedNote}

${articleSummaries}

请从以下维度深度分析并生成可复用的专属写作提示词：
1. 语言风格（口语化/书面/幽默/严肃）
2. 句式特点（长句/短句/排比/反问）
3. 结构模式（开头/中间/结尾的固定套路）
4. 情感基调（共鸣/激励/悬念/干货）
5. 金句特征（有无金句/位置/形式）

以纯 JSON 返回（不要 markdown 代码块，不要解释，直接输出 JSON），包含三个字段：
name（风格名称，简短）、description（一句话描述）、prompt_content（详细写作提示词，200-400字）`

  const { content } = await chatWithFallback(userId, [{ role: 'user', content: prompt }])
  try {
    const cleaned = extractJSON(content)
    const parsed = JSON.parse(cleaned) as { name: string; description: string; prompt_content: string }
    return { ...parsed, source_urls: req.urls }
  } catch {
    // JSON 解析失败时，用正则兜底提取三个字段
    const name = content.match(/"name"\s*:\s*"([^"]+)"/)
    const description = content.match(/"description"\s*:\s*"([^"]+)"/)
    const promptContent = content.match(/"prompt_content"\s*:\s*"([\s\S]+?)"(?:\s*[,}])/)
    if (name && description && promptContent) {
      return {
        name: name[1],
        description: description[1],
        prompt_content: promptContent[1].replace(/\\n/g, '\n').replace(/\\"/g, '"'),
        source_urls: req.urls,
      }
    }
    // 最终兜底：把 AI 返回的内容直接作为 prompt_content
    return {
      name: articles[0]?.author || '未命名风格',
      description: `基于 ${articles.length} 篇文章提炼的写作风格`,
      prompt_content: content.slice(0, 1000),
      source_urls: req.urls,
    }
  }
}

// ─── 定向生成（流式） ─────────────────────────────────────────
export async function generateArticle(
  userId: number,
  req: GenerateRequest,
  onChunk: (chunk: string) => void
): Promise<{ provider: string }> {
  let styleText = ''
  if (req.style_prompt_id) {
    const rows = await query<{ prompt_content: string }>(
      'SELECT prompt_content FROM style_prompts WHERE id=? AND user_id=?',
      [req.style_prompt_id, userId]
    )
    styleText = rows[0]?.prompt_content ?? ''
  } else if (req.style_prompt) {
    styleText = req.style_prompt
  }

  let knowledgeText = ''
  if (req.use_knowledge && req.knowledge_doc_ids?.length) {
    const placeholders = req.knowledge_doc_ids.map(() => '?').join(',')
    const docs = await query<{ content_text: string; filename: string }>(
      `SELECT content_text, filename FROM knowledge_docs WHERE id IN (${placeholders}) AND user_id=?`,
      [...req.knowledge_doc_ids, userId]
    )
    knowledgeText = docs.map(d => `【${d.filename}】\n${d.content_text?.slice(0, 2000)}`).join('\n\n')
  }

  const STRUCTURES = {
    'total-split-total': '文章结构：总分总（先给结论，再展开论述，最后强化结论）',
    'problem-solution':  '文章结构：问题解决型（先提出目标读者的真实痛点，再提供解决方案）',
    'story-lead':        '文章结构：故事引入型（用一个真实小故事开头，再提炼出普适性规律）',
    'listicle':          '文章结构：干货列表型（N个方法/技巧/建议，每个独立成节）',
    'contrast':          '文章结构：对比型（普通人 vs 高手 / 做了 vs 没做 / 以前 vs 现在）',
    'freeform':          '',
  }
  const structureHint = req.structure && req.structure !== 'freeform'
    ? `\n${STRUCTURES[req.structure]}`
    : ''

  const wordCount = req.word_count ?? 1500
  const systemPrompt = `你是顶级公众号爆文写手。${styleText ? `\n\n写作风格指导：\n${styleText}` : ''}`
  const userPrompt = `请围绕主题「${req.topic}」写一篇约 ${wordCount} 字的公众号爆款文章。${structureHint}
要求：标题吸引人、开头前 3 句话必须抓住读者、内容有真实价值、结尾有行动号召。
${knowledgeText ? `\n参考资料（请基于以下资料写作）：\n${knowledgeText}` : ''}
直接输出文章正文，不需要任何额外说明。`

  return streamWithFallback(userId, [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt },
  ], onChunk, { temperature: 0.8, max_tokens: 6000 })
}

// ─── 二次仿写 ────────────────────────────────────────────────
export interface RewriteResult {
  provider: string
  similarity?: number
  fixCount?: number
}

export async function rewriteArticle(
  userId: number,
  req: RewriteRequest,
  onChunk: (chunk: string) => void,
  onStage?: (stage: string, progress: number, meta?: Record<string, unknown>) => void
): Promise<RewriteResult> {
  // 支持粘贴 URL 自动抓取正文
  let original = req.original.trim()
  if (/^https?:\/\//i.test(original)) {
    const { success, failed } = await fetchArticles([original])
    if (success.length > 0) original = success[0].content.slice(0, 12000)
    else throw new Error(`链接抓取失败：${failed[0]?.error}，请粘贴正文`)
  }

  // 安全清理：移除抓取内容中残留的代码/脚本片段
  original = original
    .replace(/```[\s\S]*?```/g, '')
    .replace(/(?:^|\n)(?:var |function |const |let )[\s\S]*?(?=\n\n|$)/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  // 降重意图 → 走专用降重管道
  if (req.intent === 'dedup') {
    const { runDedupPipeline } = await import('./rewrite-pipeline')
    const result = await runDedupPipeline({
      userId,
      original,
      intensity: req.intensity ?? 'medium',
      intent: 'dedup',
      keywords: req.keywords,
      onChunk,
      onStage: onStage || (() => {}),
    })
    return {
      provider: result.provider,
      similarity: result.similarity,
      fixCount: result.fixCount,
    }
  }

  // 非降重意图 → 保持原逻辑
  const intensityMap = {
    light:  '轻度改写（保留 80% 原意，换词换句，不改结构）',
    medium: '中度改写（保留 60% 原意，调整结构和表达）',
    heavy:  '深度改写（仅保留核心主题，完全重构）',
  }

  const intentMap = {
    platform: '目标：风格转换，从公众号长文改写成小红书短文风格（分段短、有 emoji、有话题标签）',
    casual:   '目标：口语化，把书面语改成自然对话风格',
    fun:      '目标：增加趣味性，加入幽默感和人格魅力',
  }

  const intensityText = intensityMap[req.intensity ?? 'medium']
  const intentText = req.intent ? intentMap[req.intent] : ''
  const keywordsText = req.keywords ? `\n必须保留的词/短语（不能改动）：${req.keywords}` : ''

  const prompt = `你是一位专业改写编辑。请对以下文章进行${intensityText}。
${intentText}${keywordsText}

改写要求：
- 语义等价，不添加原文没有的事实
- 文字焕然一新，可读性高
- 符合公众号写作风格（除非指定平台转换）
- 若原文含有 ![图片说明](URL) 格式的图片，保留在改写后对应位置
- 直接输出改写后的文章，不要任何前言或解释

原文：
${original}`

  const result = await streamWithFallback(userId, [{ role: 'user', content: prompt }], onChunk, { temperature: 0.8 })
  return { provider: result.provider }
}

// ─── L3 信息重组：提取核心要点 ───────────────────────────────
export async function extractPoints(
  userId: number,
  original: string
): Promise<{ points: string[]; suggestedStructure: string; provider: string }> {
  // 支持 URL 输入
  let text = original.trim()
  if (/^https?:\/\//i.test(text)) {
    const { success, failed } = await fetchArticles([text])
    if (success.length > 0) text = success[0].content.slice(0, 12000)
    else throw new Error(`链接抓取失败：${failed[0]?.error}，请粘贴正文`)
  }

  const prompt = `请阅读以下文章，提取其中所有核心信息点。

要求：
1. 每个要点是一个完整的陈述句（15-40字）
2. 只提取事实和观点，不保留原文的任何措辞和修辞
3. 提取 5-10 个最重要的信息点
4. 按逻辑重要性排序（最重要的在前）
5. 同时推荐一个适合重新写作的结构类型

以纯 JSON 返回（不要 markdown 代码块）：
{"points":["要点1","要点2",...],"structure":"story-lead"}

structure 可选值：
- story-lead: 故事引入式
- problem-solution: 问题-方案式
- contrast: 对比论证式
- listicle: 清单式
- total-split-total: 总分总

原文：
${text}`

  const result = await chatWithFallback(userId, [{ role: 'user', content: prompt }], { temperature: 0.3 })

  try {
    const cleaned = result.content
      .replace(/^\s*```(?:json)?\s*\n?/i, '')
      .replace(/\n?\s*```\s*$/i, '')
      .trim()
    const parsed = JSON.parse(cleaned) as { points: string[]; structure: string }
    return {
      points: parsed.points || [],
      suggestedStructure: parsed.structure || 'story-lead',
      provider: result.provider,
    }
  } catch {
    throw new Error('要点提取失败，请重试')
  }
}

// ─── L3 信息重组：基于要点生成新文章 ─────────────────────────
export async function rewriteFromPoints(
  userId: number,
  points: string[],
  structure: string,
  wordCount: number,
  keywords: string | undefined,
  onChunk: (chunk: string) => void
): Promise<{ provider: string }> {
  const structureGuide: Record<string, string> = {
    'story-lead':      '以一个具体场景或故事开头，引出主题，然后展开论述',
    'problem-solution': '先描述问题/痛点，再逐步给出解决方案',
    'contrast':         '正反对比、新旧对比或多方案对比',
    'listicle':         '以编号列表组织，每个点有小标题+展开',
    'total-split-total': '先总述观点，分别论证，最后总结',
  }

  const guide = structureGuide[structure] || structureGuide['story-lead']
  const keywordsHint = keywords ? `\n必须自然融入以下关键词：${keywords}` : ''

  const prompt = `你是一位资深公众号写手。请基于以下核心信息点，用你自己的方式写一篇全新的文章。

要求：
1. 文章结构：${guide}
2. 字数约 ${wordCount} 字
3. 完全用自己的话表达，不要参考任何已有文章的措辞
4. 语言自然流畅，像真人公众号作者的风格
5. 段落有长有短，节奏感好
6. 不要用「首先/其次/最后」「综上所述」等套话${keywordsHint}

核心信息点：
${points.map((p, i) => `${i + 1}. ${p}`).join('\n')}

直接输出文章正文，不要标题，不要任何前言或解释。`

  return streamWithFallback(userId, [{ role: 'user', content: prompt }], onChunk, {
    temperature: 0.8,
    max_tokens: 6000,
  })
}

// ─── 多平台推文 ───────────────────────────────────────────────
export async function generatePlatforms(userId: number, req: PlatformRequest): Promise<PlatformResult> {
  const platformGuides: Record<string, string> = {
    weixin:       '公众号：1000-3000字，结构清晰，有标题，适合深度阅读',
    xiaohongshu:  '小红书：300-500字，多emoji，分段短，有话题标签，活泼可爱',
    weibo:        '微博：140字内，简洁有力，附热点话题标签',
    zhihu:        '知乎：500-1500字，专业深度，有数据和逻辑，知识分享风格',
    douyin:       '抖音口播：200-400字，口语化，有节奏感，适合TTS朗读，每句话短',
    pyq:          '朋友圈：50-150字，情感真实，有场景感，适合引发共鸣',
    shipinhao:    '视频号：标题党+简短文案，100字内，突出视频卖点',
  }

  // 如果 content 是 URL，自动抓取正文，支持公众号等链接直接粘贴
  let inputContent = req.content.trim()
  if (/^https?:\/\//i.test(inputContent)) {
    const { success, failed } = await fetchArticles([inputContent])
    if (success.length > 0) {
      inputContent = success[0].content.slice(0, 8000)
    } else {
      throw new Error(`链接抓取失败：${failed[0]?.error || '未知错误'}，请直接粘贴文章正文`)
    }
  }

  const selected = req.platforms.filter(p => platformGuides[p])
  const prompt = `请将以下内容改写为${selected.length}个平台的专属文案。

平台列表：
${selected.map(p => `- ${p}（${platformGuides[p]}）`).join('\n')}

原内容：
${inputContent}

以纯 JSON 返回（不要 markdown 代码块，不要解释）。
重要：JSON value 中的换行必须用 \\n 转义，不能使用真实换行符。
格式：{"weibo":"文案内容","xiaohongshu":"文案内容"}`

  const { content, provider } = await chatWithFallback(userId, [{ role: 'user', content: prompt }], { max_tokens: 8000 })
  try {
    const cleaned = extractJSON(content)
    const fixed = cleaned.replace(/("(?:[^"\\]|\\.)*")\s*:/g, (m) => m)
      .replace(/:\s*"([\s\S]*?)"\s*([,}])/g, (_, val, end) => {
        const escaped = val.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
        return `: "${escaped}"${end}`
      })
    const rawResults = JSON.parse(fixed) as Record<string, string>
    // 对每个平台做格式化后处理
    const formattedResults: Record<string, string> = {}
    for (const [p, text] of Object.entries(rawResults)) {
      formattedResults[p] = formatForPlatform(p, text)
    }
    return { results: formattedResults, provider }
  } catch {
    const results: Record<string, string> = {}
    for (const p of selected) {
      const re = new RegExp(`[\"']?${p}[\"']?\\s*[：:,]\\s*[\"']?([\\s\\S]{20,500}?)[\"']?(?=[,}]|\\n[\"']?(?:${selected.join('|')})[\"']?\\s*[：:]|$)`)
      const m = content.match(re)
      if (m) results[p] = formatForPlatform(p, m[1].trim().replace(/^['"]+|['"]+$/g, '').replace(/\\n/g, '\n'))
    }
    if (Object.keys(results).length === 0) {
      const paragraphs = content.split(/\n{2,}/).filter(s => s.trim().length > 20)
      selected.forEach((p, i) => { if (paragraphs[i]) results[p] = formatForPlatform(p, paragraphs[i].trim()) })
    }
    return { results, provider }
  }
}

// ─── 去 AI 味（三层流水线）────────────────────────────────────────
//
// Layer 1：规则引擎检测（本地，0 token）
//   └── 评分 >= PASS_SCORE → 直接进 Layer 3，跳过 AI 改写
//
// Layer 2：AI 定向改写（精准 prompt）
//   ├── 改写后立即用规则引擎复检
//   ├── 新分数 >= 旧分数 → 接受改写结果，继续下一轮或进 Layer 3
//   └── 新分数 < 旧分数 → 拒绝这次改写，保留旧版本（防越改越差）
//   └── 最多执行 (max_rounds - 1) 次 AI 改写，最后一轮留给复检
//
// Layer 3：随机化处理（本地，0 token，防平台风控）
//   ├── 同义词替换（打断词频规律）
//   ├── 标点随机化（打破句尾全是句号的规律）
//   ├── 段落节奏打散（合并相邻短段）
//   └── 插入口语停顿词（提升真人感）
//
export async function deaiProcess(userId: number, req: DeAIRequest): Promise<DeAIResult> {
  const maxAiRounds = Math.max(1, (req.max_rounds ?? 2) - 1)

  // 支持粘贴 URL 自动抓取正文
  let inputContent = req.content.trim()
  if (/^https?:\/\//i.test(inputContent)) {
    const { success, failed } = await fetchArticles([inputContent])
    if (success.length > 0) inputContent = success[0].content.slice(0, 12000)
    else throw new Error(`链接抓取失败：${failed[0]?.error}，请粘贴正文`)
  }

  // 动态 PASS_SCORE：根据文本长度调整（短文宽松，长文严格）
  const PASS_SCORE = calcPassScore(inputContent.length)

  let current = inputContent
  const rounds: DeAIResult['rounds'] = []
  let lastProvider = 'rule-engine'

  // ── Layer 1：初始规则检测 ────────────────────────────────────
  let currentReport = detectPatterns(current)

  // 初始就通过 → 直接进 Layer 3，不消耗任何 AI token
  if (currentReport.score >= PASS_SCORE) {
    rounds.push({ round: 0, content: current, score: currentReport.score, passed: true })
    const final = randomizeText(current)
    const finalReport = detectPatterns(final)
    return {
      rounds,
      final_content: final,
      final_score: finalReport.score,
      provider: 'rule-engine+randomizer',
    }
  }

  // ── Layer 2：AI 改写循环 ─────────────────────────────────────
  for (let round = 1; round <= maxAiRounds; round++) {
    const userPrompt = `请对以下文章进行去AI味改写。

${currentReport.hitCount > 0
  ? `规则引擎检测到以下AI写作模式，请重点修复：\n${currentReport.summary}`
  : '规则引擎未发现明显词汇模式，请从句式节奏和段落结构进行优化。'
}

当前评分：${currentReport.score}分，目标：${PASS_SCORE}分以上。
直接输出改写后的文章，不要任何解释：

${current}`

    const { content: rewritten, provider } = await chatWithFallback(
      userId,
      [
        { role: 'system', content: HUMANIZER_SYSTEM_PROMPT },
        { role: 'user',   content: userPrompt },
      ],
      { temperature: 0.9 }
    )
    lastProvider = provider

    // 改写质量校验：新分数必须 >= 旧分数才接受
    const newReport = detectPatterns(rewritten)
    if (newReport.score >= currentReport.score) {
      // 接受改写
      rounds.push({ round, content: current, score: currentReport.score, passed: false })
      current = rewritten
      currentReport = newReport
    } else {
      // 拒绝改写，保留旧版本，记录但不更新 current
      rounds.push({ round, content: current, score: currentReport.score, passed: false })
      // 分数下降说明这轮 AI 改写方向不对，停止继续改写
      break
    }

    // 已达标则提前退出
    if (currentReport.score >= PASS_SCORE) break
  }

  // ── Layer 3：随机化处理（防平台风控）──────────────────────────
  const final = randomizeText(current)
  const finalReport = detectPatterns(final)

  return {
    rounds,
    final_content: final,
    final_score: finalReport.score,
    provider: lastProvider === 'rule-engine' ? lastProvider : `${lastProvider}+randomizer`,
  }
}

// ─── 内容检测 ────────────────────────────────────────────────
export async function detectContent(userId: number, req: DetectRequest): Promise<DetectResult> {
  // 支持粘贴 URL 自动抓取正文
  let inputContent = req.content.trim()
  if (/^https?:\/\//i.test(inputContent)) {
    const { success, failed } = await fetchArticles([inputContent])
    if (success.length > 0) inputContent = success[0].content.slice(0, 8000)
    else throw new Error(`链接抓取失败：${failed[0]?.error}，请粘贴正文`)
  }

  const prompt = `你是专业内容检测系统。请对以下文章进行四维检测并以纯 JSON 格式返回结果（不要 markdown 代码块，不要任何解释，直接输出 JSON）：

检测维度：
- ai_taste：AI痕迹（0-100分，100分=完全像真人）
- forbidden_words：违禁词（0-100分，100分=完全合规）
- originality：原创度（0-100分）
- readability：可读性（0-100分）

每个维度包含 score（数字）和 issues（数组），issues 中每项包含 text（扣分句子）、start（起始位置）、end（结束位置）、reason（扣分原因）。

文章内容：
${inputContent.slice(0, 3000)}`

  const { content, provider } = await chatWithFallback(userId, [{ role: 'user', content: prompt }])
  try {
    const cleaned = extractJSON(content)
    const dims = JSON.parse(cleaned) as DetectResult['dimensions']
    const scores = [dims.ai_taste.score, dims.forbidden_words.score, dims.originality.score, dims.readability.score]
    const overall = Math.round(scores.reduce((a, b) => a + b, 0) / 4)
    return { overall_score: overall, passed: overall >= 75, dimensions: dims, provider }
  } catch {
    // JSON 解析失败，用规则引擎分数兜底
    const ruleReport = detectPatterns(req.content)
    const aiScore = ruleReport.score
    const fallbackDims: DetectResult['dimensions'] = {
      ai_taste:        { score: aiScore,  issues: ruleReport.hits.slice(0, 5).map(h => ({ text: h.text, start: h.index, end: h.index + h.text.length, reason: h.suggestion })) },
      forbidden_words: { score: 95, issues: [] },
      originality:     { score: 70, issues: [] },
      readability:     { score: 75, issues: [] },
    }
    const overall = Math.round((aiScore + 95 + 70 + 75) / 4)
    return { overall_score: overall, passed: overall >= 75, dimensions: fallbackDims, provider: 'rule-engine' }
  }
}
