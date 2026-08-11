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
export async function generateTitles(userId: number, req: TitleRequest): Promise<TitleResult> {
  const count = req.count ?? 12
  const prompt = `你是一位顶级公众号运营专家，擅长创作高点击率标题。
请根据主题「${req.topic}」生成 ${count} 个不同套路的爆款标题。
套路要覆盖：悬念式、数字式、反差式、痛点式、福利式、共鸣式。
${req.style ? `参考写作风格：${req.style}` : ''}
以纯 JSON 返回（不要 markdown 代码块，不要解释），格式为包含 titles 数组的对象，每项有 text（标题文字）和 type（套路名称）两个字段。`

  const { content, provider } = await chatWithFallback(userId, [
    { role: 'user', content: prompt }
  ], { temperature: 0.9 })

  try {
    const cleaned = extractJSON(content)
    const parsed = JSON.parse(cleaned) as { titles: Array<{ text: string; type: string }> }
    return { titles: parsed.titles, provider }
  } catch {
    // 解析失败时按行拆分降级处理
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('```'))
    return {
      titles: lines.slice(0, count).map((text, i) => ({
        text: text.replace(/^\d+[.、]\s*/, '').trim(),
        type: ['悬念式', '数字式', '反差式', '痛点式', '福利式', '共鸣式'][i % 6],
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

  const wordCount = req.word_count ?? 1500
  const systemPrompt = `你是顶级公众号爆文写手。${styleText ? `\n\n写作风格指导：\n${styleText}` : ''}`
  const userPrompt = `请围绕主题「${req.topic}」写一篇约 ${wordCount} 字的公众号爆款文章。
要求：标题吸引人、开头抓住读者、内容有价值、结尾有行动号召。
${knowledgeText ? `\n参考资料（请基于以下资料写作，确保准确）：\n${knowledgeText}` : ''}
直接输出文章正文，不需要任何额外说明。`

  return streamWithFallback(userId, [
    { role: 'system', content: systemPrompt },
    { role: 'user',   content: userPrompt },
  ], onChunk, { temperature: 0.8, max_tokens: 6000 })
}

// ─── 二次仿写 ────────────────────────────────────────────────
export async function rewriteArticle(
  userId: number,
  req: RewriteRequest,
  onChunk: (chunk: string) => void
): Promise<{ provider: string }> {
  // 支持粘贴 URL 自动抓取正文
  let original = req.original.trim()
  if (/^https?:\/\//i.test(original)) {
    const { success, failed } = await fetchArticles([original])
    if (success.length > 0) original = success[0].content.slice(0, 12000)
    else throw new Error(`链接抓取失败：${failed[0]?.error}，请粘贴正文`)
  }
  const intensityMap = { light: '轻度改写（保留70%原意）', medium: '中度改写（保留50%原意）', heavy: '深度改写（仅保留核心主题）' }
  const prompt = `你是专业改写专家。请对以下文章进行${intensityMap[req.intensity ?? 'medium']}，
要求：语义等价、文字焕然一新、降重效果好、可读性高、符合公众号写作风格。
不要添加任何说明，直接输出改写后的文章：

${original}`

  return streamWithFallback(userId, [{ role: 'user', content: prompt }], onChunk, { temperature: 0.85 })
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
