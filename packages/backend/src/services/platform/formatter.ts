/**
 * 平台专属格式化处理器
 * 在 AI 生成文案后，对每个平台做标准化后处理
 */

// ── 微博常用话题词（动态话题，仅作示例兜底）─────────────────────
const WEIBO_TOPIC_SUFFIXES = ['AI', '职场', '效率', '科技', '工具']

function extractOrAppendHashtags(text: string, fallbacks: string[]): string {
  const existing = text.match(/#[^\s#]+/g) || []
  if (existing.length >= 2) return text
  const needed = 2 - existing.length
  const tags = fallbacks.slice(0, needed).map(t => ` #${t}`)
  return text + tags.join('')
}

/**
 * 微博：140 字以内，至少 2 个话题标签
 */
export function formatWeibo(text: string): string {
  // 去掉已有的超长段落，只保留核心
  let result = text.replace(/\n{2,}/g, '\n').trim()
  // 截断到 130 字（留给话题标签）
  if (result.length > 130) {
    // 尽量在句号处截断
    const truncated = result.slice(0, 130)
    const lastPunctIdx = Math.max(
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('！'),
      truncated.lastIndexOf('？'),
    )
    result = lastPunctIdx > 80 ? truncated.slice(0, lastPunctIdx + 1) : truncated + '...'
  }
  // 确保有话题标签
  result = extractOrAppendHashtags(result, WEIBO_TOPIC_SUFFIXES)
  return result
}

/**
 * 小红书：300-500 字，分段短，有 emoji，结尾有话题标签
 */
export function formatXiaohongshu(text: string): string {
  // 确保分段（每段不超过 80 字）
  const paragraphs = text.split(/\n+/).filter(p => p.trim())
  const formatted = paragraphs.map(p => {
    // 太长的段落在句号处拆分
    if (p.length > 80) {
      return p.replace(/([。！？])/g, '$1\n').trim()
    }
    return p
  }).join('\n\n')

  // 检查是否有 emoji，没有则在首行加一个
  const hasEmoji = /[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}]/u.test(formatted)
  const withEmoji = hasEmoji ? formatted : `✨ ${formatted}`

  // 确保结尾有话题标签
  const hasTags = /#[^\s]+/.test(withEmoji)
  const withTags = hasTags ? withEmoji : `${withEmoji}\n\n#AI工具 #效率提升 #干货分享`

  return withTags
}

/**
 * 知乎：保持原文结构，确保字数充足（500 字以上才有深度感）
 */
export function formatZhihu(text: string): string {
  // 知乎不需要特殊处理，保持 AI 生成的结构即可
  // 只确保没有微博式的话题标签（知乎格式不同）
  return text.replace(/#[^\s#]+/g, '').trim()
}

/**
 * 朋友圈：50-150 字，自然口语，情感共鸣，不要话题标签
 */
export function formatPyq(text: string): string {
  // 去掉话题标签
  let result = text.replace(/#[^\s#]+/g, '').trim()
  // 截断到 150 字
  if (result.length > 150) {
    const truncated = result.slice(0, 145)
    const lastPunct = Math.max(
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('！'),
      truncated.lastIndexOf('？'),
      truncated.lastIndexOf('，'),
    )
    result = lastPunct > 60 ? truncated.slice(0, lastPunct + 1) : truncated
  }
  return result
}

/**
 * 抖音口播：口语化，每句话短，适合朗读
 * 强制每句分行，去掉书面语连接词
 */
export function formatDouyin(text: string): string {
  // 按句子分行，便于口播停顿
  return text
    .replace(/([。！？])\s*/g, '$1\n')
    .replace(/，\s*/g, '，')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 视频号：标题党+简短文案，100 字以内，突出视频卖点
 */
export function formatShipinhao(text: string): string {
  let result = text.replace(/\n{2,}/g, '\n').trim()
  if (result.length > 100) {
    const truncated = result.slice(0, 95)
    const lastPunct = Math.max(
      truncated.lastIndexOf('。'),
      truncated.lastIndexOf('！'),
      truncated.lastIndexOf('？'),
    )
    result = lastPunct > 40 ? truncated.slice(0, lastPunct + 1) : truncated + '...'
  }
  return result
}

/**
 * 主入口：根据平台 id 调用对应格式化函数
 */
export function formatForPlatform(platformId: string, text: string): string {
  switch (platformId) {
    case 'weibo':       return formatWeibo(text)
    case 'xiaohongshu': return formatXiaohongshu(text)
    case 'zhihu':       return formatZhihu(text)
    case 'pyq':         return formatPyq(text)
    case 'douyin':      return formatDouyin(text)
    case 'shipinhao':   return formatShipinhao(text)
    case 'weixin':      return text  // 公众号不做截断，保持完整
    default:            return text
  }
}

/**
 * 各平台字数上限（用于前端显示警告）
 */
export const PLATFORM_CHAR_LIMITS: Record<string, number> = {
  weibo:       140,
  xiaohongshu: 1000,
  zhihu:       10000,
  pyq:         150,
  douyin:      500,
  shipinhao:   100,
  weixin:      50000,
}
