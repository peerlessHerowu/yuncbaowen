import { chatWithFallback, streamWithFallback } from './chat'
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
 * 从 AI 返回的文本中提取第一个完整 JSON 对象
 * 用括号深度匹配，不依赖 rfind，兼容 Claude 在 reason 里带单引号等边界情况
 */
function extractJSON(text: string): string {
  // 去掉 markdown 代码块标记（支持多行）
  const stripped = text
    .replace(/^```(?:json)?\s*/im, '')
    .replace(/\s*```\s*$/m, '')
    .trim()

  const objIdx = stripped.indexOf('{')
  const arrIdx = stripped.indexOf('[')
  let start = -1
  if (objIdx !== -1 && arrIdx !== -1) start = Math.min(objIdx, arrIdx)
  else if (objIdx !== -1) start = objIdx
  else if (arrIdx !== -1) start = arrIdx
  if (start === -1) return stripped

  const opener = stripped[start]
  const closer = opener === '{' ? '}' : ']'
  let depth = 0
  let inString = false
  let escape = false

  for (let i = start; i < stripped.length; i++) {
    const c = stripped[i]
    if (escape)              { escape = false; continue }
    if (c === '\\' && inString) { escape = true;  continue }
    if (c === '"')           { inString = !inString; continue }
    if (inString)            continue
    if (c === opener)        depth++
    else if (c === closer)   { depth--; if (depth === 0) return stripped.slice(start, i + 1) }
  }
  return stripped.slice(start)
}

// ─── 爆款标题 ────────────────────────────────────────────────
export async function generateTitles(userId: number, req: TitleRequest): Promise<TitleResult> {
  const count = req.count ?? 12
  const prompt = `你是一位顶级公众号运营专家，擅长创作高点击率标题。
请根据主题「${req.topic}」生成 ${count} 个不同套路的爆款标题。
套路要覆盖：悬念式、数字式、反差式、痛点式、福利式、共鸣式。
${req.style ? `参考写作风格：${req.style}` : ''}
返回 JSON 格式，字段：titles: [{text: string, type: string}]
只返回 JSON，不要任何解释。`

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
  const urlList = req.urls.map((u, i) => `${i + 1}. ${u}`).join('\n')
  const prompt = `你是写作风格分析专家。请分析以下 ${req.urls.length} 篇文章的写作风格指纹：
${urlList}

请从以下维度深度分析并生成可复用的专属写作提示词：
1. 语言风格（口语化/书面/幽默/严肃）
2. 句式特点（长句/短句/排比/反问）
3. 结构模式（开头/中间/结尾的固定套路）
4. 情感基调（共鸣/激励/悬念/干货）
5. 金句特征（有无金句/位置/形式）

返回 JSON：
{
  "name": "风格名称（简短）",
  "description": "一句话描述",
  "prompt_content": "详细的写作提示词（200-400字，可直接用于指导AI写作）"
}
只返回 JSON，不要解释。`

  const { content } = await chatWithFallback(userId, [{ role: 'user', content: prompt }])
  const cleaned = extractJSON(content)
  const parsed = JSON.parse(cleaned) as { name: string; description: string; prompt_content: string }
  return { ...parsed, source_urls: req.urls }
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
  const intensityMap = { light: '轻度改写（保留70%原意）', medium: '中度改写（保留50%原意）', heavy: '深度改写（仅保留核心主题）' }
  const prompt = `你是专业改写专家。请对以下文章进行${intensityMap[req.intensity ?? 'medium']}，
要求：语义等价、文字焕然一新、降重效果好、可读性高、符合公众号写作风格。
不要添加任何说明，直接输出改写后的文章：

${req.original}`

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

  const selected = req.platforms.filter(p => platformGuides[p])
  const prompt = `请将以下内容改写为${selected.length}个平台的专属文案：
${selected.map(p => `- ${p}（${platformGuides[p]}）`).join('\n')}

原内容：
${req.content}

返回 JSON 格式：{"weixin":"...","xiaohongshu":"..."}
只返回 JSON。`

  const { content, provider } = await chatWithFallback(userId, [{ role: 'user', content: prompt }], { max_tokens: 8000 })
  const cleaned = extractJSON(content)
  return { results: JSON.parse(cleaned), provider }
}

// ─── 去 AI 味（闭环） ─────────────────────────────────────────
export async function deaiProcess(userId: number, req: DeAIRequest): Promise<DeAIResult> {
  const maxRounds = req.max_rounds ?? 3
  const PASS_SCORE = 80
  let current = req.content
  const rounds: DeAIResult['rounds'] = []

  for (let round = 1; round <= maxRounds; round++) {
    const detectResult = await detectContent(userId, { content: current })
    const score = detectResult.dimensions.ai_taste.score

    if (score >= PASS_SCORE) {
      rounds.push({ round, content: current, score, passed: true })
      return { rounds, final_content: current, final_score: score, provider: detectResult.provider }
    }

    if (round === maxRounds) {
      rounds.push({ round, content: current, score, passed: false })
      break
    }

    // 改写
    const issues = detectResult.dimensions.ai_taste.issues.map(i => `"${i.text}"`).join('、')
    const prompt = `你是去AI味专家。以下文章被AI检测扣分，请改写使其更像真人写作。
扣分点：${issues || '整体AI感较强'}
改写要求：使用更口语化表达、增加个人视角和情感、打破机械句式、增加具体细节。
当前评分：${score}分，目标：${PASS_SCORE}分以上。
直接输出改写后的文章，不要解释：
${current}`

    const { content: rewritten } = await chatWithFallback(userId, [{ role: 'user', content: prompt }], { temperature: 0.9 })
    rounds.push({ round, content: current, score, passed: false })
    current = rewritten
  }

  const finalDetect = await detectContent(userId, { content: current })
  return {
    rounds,
    final_content: current,
    final_score: finalDetect.dimensions.ai_taste.score,
    provider: finalDetect.provider,
  }
}

// ─── 内容检测 ────────────────────────────────────────────────
export async function detectContent(userId: number, req: DetectRequest): Promise<DetectResult> {
  const prompt = `你是专业内容检测系统。请对以下文章进行四维检测：
1. AI痕迹（0-100分）：检测AI写作痕迹，100分=完全像真人
2. 违禁词（0-100分）：检测违规内容，100分=完全合规
3. 原创度（0-100分）：内容原创程度
4. 可读性（0-100分）：阅读体验

对每个维度：找出具体扣分句子（text字段），说明原因（reason字段）。

返回严格 JSON：
{
  "ai_taste":       {"score":85,"issues":[{"text":"...","start":0,"end":10,"reason":"..."}]},
  "forbidden_words":{"score":100,"issues":[]},
  "originality":    {"score":78,"issues":[]},
  "readability":    {"score":82,"issues":[]}
}

文章内容：
${req.content.slice(0, 3000)}`

  const { content, provider } = await chatWithFallback(userId, [{ role: 'user', content: prompt }])
  const cleaned = extractJSON(content)
  const dims = JSON.parse(cleaned) as DetectResult['dimensions']
  const scores = [dims.ai_taste.score, dims.forbidden_words.score, dims.originality.score, dims.readability.score]
  const overall = Math.round(scores.reduce((a, b) => a + b, 0) / 4)
  return { overall_score: overall, passed: overall >= 75, dimensions: dims, provider }
}
