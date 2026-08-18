import path from 'path'
import fs from 'fs'
import { createHash } from 'crypto'

/**
 * 文章内容抓取器
 * 支持：公众号、知乎、简书、头条、掘金等主流中文内容平台
 * 公众号无需 cookie，伪装手机 UA 直接访问
 */

export interface FetchedArticle {
  url: string
  title: string
  author: string
  content: string        // 纯文本正文（含 ![图片](url) 占位符）
  publishedAt?: string
  wordCount: number
  platform: string
}

// ── 图片缓存（解决微信防盗链 + 头条签名过期）────────────────────
const CACHED_IMGS_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads', 'cached-imgs')

/**
 * 下载图片到本地缓存目录，返回永久本地 URL。
 * - 用内容 MD5 hash 命名，相同图片只存一次。
 * - 失败时静默降级，返回原始 URL（不阻塞主流程）。
 * - 微信图片需要携带 Referer，头条图片亦同。
 */
async function cacheImageUrl(url: string, referer?: string): Promise<string> {
  try {
    if (!fs.existsSync(CACHED_IMGS_DIR)) {
      fs.mkdirSync(CACHED_IMGS_DIR, { recursive: true })
    }

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    }
    if (referer) headers['Referer'] = referer

    const resp = await fetch(url, { headers, signal: AbortSignal.timeout(10000) })
    if (!resp.ok) return url  // 下载失败，降级使用原 URL

    const buffer = Buffer.from(await resp.arrayBuffer())
    const hash = createHash('md5').update(buffer).digest('hex').slice(0, 16)

    // 根据 Content-Type 决定扩展名
    const ct = resp.headers.get('content-type') || ''
    const ext = ct.includes('png') ? 'png' : ct.includes('gif') ? 'gif' : ct.includes('webp') ? 'webp' : 'jpg'
    const filename = `${hash}.${ext}`
    const filepath = path.join(CACHED_IMGS_DIR, filename)

    if (!fs.existsSync(filepath)) {
      fs.writeFileSync(filepath, buffer)
    }
    return `/imgs/${filename}`
  } catch {
    return url  // 任何错误都降级，不影响主流程
  }
}

// ── UA 池（轮换使用，防止被识别为爬虫）─────────────────────────
const MOBILE_UAS = [
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
]

const DESKTOP_UAS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.127 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
]

function pickUA(mobile = true): string {
  const pool = mobile ? MOBILE_UAS : DESKTOP_UAS
  return pool[Math.floor(Math.random() * pool.length)]
}

// ── 工具：HTML 转纯文本（保留图片占位符）────────────────────────
/**
 * HTML 转纯文本，将 <img> 标签转为 ![alt](url) 格式保留图片位置
 * 支持 src 和 data-src（懒加载）属性
 * alt 去重：同一文章中相同 alt 的图片自动编号（如「配图2」「配图3」），
 * 避免头条等平台每张图都用文章标题作 alt，污染相似度计算
 */
function htmlToTextWithImages(html: string): string {
  const seenAlts = new Map<string, number>()   // alt → 出现次数

  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*>[\s\S]*$/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<style[^>]*>[\s\S]*$/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    // 图片：优先取 data-src（懒加载），其次取 src，转为 Markdown 格式
    .replace(/<img[^>]+>/gi, (imgTag) => {
      const dataSrc = imgTag.match(/data-src=["']([^"']+)["']/)
      const src = imgTag.match(/(?<!\w)src=["']([^"']+)["']/)
      const alt = imgTag.match(/alt=["']([^"']*)["']/)
      const url = dataSrc?.[1] || src?.[1] || ''
      // 过滤掉 base64 占位图 和 空 URL
      if (!url || url.startsWith('data:')) return ''

      let rawAlt = (alt?.[1] || '图片').trim()
      // alt 去重：第一次出现用原始 alt，之后编号
      const count = seenAlts.get(rawAlt) ?? 0
      seenAlts.set(rawAlt, count + 1)
      const altText = count === 0 ? rawAlt : `配图${count + 1}`

      return `\n![${altText}](${url})\n`
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 纯文本转换（不含图片，用于标题/作者提取） */
function htmlToText(html: string): string {
  return htmlToTextWithImages(html).replace(/!\[.*?\]\(.*?\)/g, '').replace(/\n{3,}/g, '\n\n').trim()
}
function cleanTextContent(text: string): string {
  return text
    // 移除 markdown 代码块（AI 改写时不应出现代码块）
    .replace(/```[\s\S]*?```/g, '')
    // 移除明显的 JS 代码片段（var/function/const 开头的连续多行）
    .replace(/(?:^|\n)(?:var |function |const |let |\/\/ )[\s\S]*?(?=\n\n|\n[^\s]|$)/gm, '')
    // 移除 ua.match 等浏览器检测代码
    .replace(/var\s+\w+\s*=\s*(?:ua\.match|m)\([\s\S]*?\);?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── 识别平台 ─────────────────────────────────────────────────────
function detectPlatform(url: string): string {
  if (url.includes('mp.weixin.qq.com')) return 'weixin'
  if (url.includes('zhihu.com')) return 'zhihu'
  if (url.includes('jianshu.com')) return 'jianshu'
  if (url.includes('toutiao.com') || url.includes('jinrittoutiao')) return 'toutiao'
  if (url.includes('juejin.cn')) return 'juejin'
  if (url.includes('36kr.com')) return '36kr'
  if (url.includes('sspai.com')) return 'sspai'
  return 'generic'
}

// ── 各平台解析器 ─────────────────────────────────────────────────

function parseWeixin(html: string, url: string): FetchedArticle {
  // 标题
  const titleMatch = html.match(/<h1[^>]*class=[^>]*rich_media_title[^>]*>([\s\S]*?)<\/h1>/)
  const title = titleMatch
    ? htmlToText(titleMatch[1]).trim()
    : (html.match(/var msg_title = "([^"]+)"/) || [])[1] || '未知标题'

  // 作者
  const authorMatch = html.match(/var nickname = "([^"]+)"/)
  const author = authorMatch ? authorMatch[1] : ''

  // 发布时间
  const ctMatch = html.match(/var ct = "(\d+)"/)
  const publishedAt = ctMatch
    ? new Date(parseInt(ctMatch[1]) * 1000).toISOString().slice(0, 10)
    : undefined

  // 正文：找到 js_content 位置后切片，取后面 80000 字节提取文本
  // 公众号 HTML 结构不固定，用位置切片比正则更可靠
  const jsContentIdx = html.indexOf('id="js_content"')
  let content = ''
  if (jsContentIdx >= 0) {
    // 找到 js_content 对应的 div 结束位置（避免切到页脚脚本）
    const chunk = html.slice(jsContentIdx, jsContentIdx + 80000)
    // 尝试找到正文 div 的结束位置（减少纳入无关内容）
    const endMarkers = ['<script', 'id="js_pc_qr_code"', 'id="js_tags"', 'class="rich_media_tool"']
    let endIdx = chunk.length
    for (const marker of endMarkers) {
      const pos = chunk.indexOf(marker)
      if (pos > 200 && pos < endIdx) endIdx = pos
    }
    content = htmlToTextWithImages(chunk.slice(0, endIdx))
      .replace(/^id="js_content"[^>]*>?\s*/, '')
      .trim()
    content = cleanTextContent(content)
  }

  // 如果正文还是太短，尝试备用方案
  if (content.length < 50) {
    const altMatch = html.match(/class="rich_media_content[^"]*"[^>]*>([\s\S]{100,}?)<\/div>/)
    if (altMatch) content = cleanTextContent(htmlToTextWithImages(altMatch[1]))
  }

  return { url, title, author, content, publishedAt, wordCount: content.length, platform: 'weixin' }
}

function parseZhihu(html: string, url: string): FetchedArticle {
  const titleMatch = html.match(/<h1[^>]*class="[^"]*Post-Title[^"]*"[^>]*>([\s\S]*?)<\/h1>/)
    || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
  const title = titleMatch ? htmlToText(titleMatch[1]).trim() : '未知标题'

  const authorMatch = html.match(/class="[^"]*AuthorInfo-name[^"]*"[^>]*>([\s\S]*?)<\//)
  const author = authorMatch ? htmlToText(authorMatch[1]).trim() : ''

  const contentMatch = html.match(/class="[^"]*RichText[^"]*"[^>]*>([\s\S]*?)<\/div>/)
  const content = contentMatch ? htmlToText(contentMatch[1]) : ''

  return { url, title, author, content, wordCount: content.length, platform: 'zhihu' }
}

function parseJianshu(html: string, url: string): FetchedArticle {
  const titleMatch = html.match(/<h1[^>]*class="[^"]*title[^"]*"[^>]*>([\s\S]*?)<\/h1>/)
  const title = titleMatch ? htmlToText(titleMatch[1]).trim() : '未知标题'

  const authorMatch = html.match(/class="[^"]*author[^"]*"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/)
  const author = authorMatch ? htmlToText(authorMatch[1]).trim() : ''

  const contentMatch = html.match(/class="[^"]*show-content[^"]*"[^>]*>([\s\S]*?)<\/article>/)
    || html.match(/<article[^>]*>([\s\S]*?)<\/article>/)
  const content = contentMatch ? htmlToText(contentMatch[1]) : ''

  return { url, title, author, content, wordCount: content.length, platform: 'jianshu' }
}

function parseGeneric(html: string, url: string): FetchedArticle {
  // 通用解析：提取 <title>、<article> 或最长 <div>
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/)
  const title = titleMatch ? htmlToText(titleMatch[1]).trim().replace(/\s*[-|_]\s*.*$/, '') : '未知标题'

  // 尝试 <article>
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/)
  if (articleMatch) {
    const content = htmlToText(articleMatch[1])
    return { url, title, author: '', content, wordCount: content.length, platform: 'generic' }
  }

  // 回退：找最长的 <div>（通常是正文容器）
  const divs = [...html.matchAll(/<div[^>]*>([\s\S]{500,}?)<\/div>/g)]
  const longest = divs.reduce((best, m) => {
    const len = htmlToText(m[1]).length
    return len > best.len ? { text: m[1], len } : best
  }, { text: '', len: 0 })
  const content = htmlToText(longest.text)

  return { url, title, author: '', content, wordCount: content.length, platform: 'generic' }
}

function parseToutiao(html: string, url: string): FetchedArticle {
  // 标题
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/)
  const title = titleMatch ? htmlToText(titleMatch[1]).trim().replace(/[-_|–].*$/, '').trim() : '未知标题'

  // 作者
  const authorMatch = html.match(/class="[^"]*author[^"]*"[^>]*>([\s\S]*?)<\//)
  const author = authorMatch ? htmlToText(authorMatch[1]).trim() : ''

  // 正文在 <article> 标签内
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/)
  let content = ''
  if (articleMatch) {
    content = htmlToTextWithImages(articleMatch[1])
    content = cleanTextContent(content)
  }

  // 备用：找 content 容器 div
  if (content.length < 50) {
    const divMatch = html.match(/class="[^"]*article-content[^"]*"[^>]*>([\s\S]{200,}?)<\/div>/)
    if (divMatch) content = cleanTextContent(htmlToTextWithImages(divMatch[1]))
  }

  return { url, title, author, content, wordCount: content.length, platform: 'toutiao' }
}

// ── 主函数 ───────────────────────────────────────────────────────

export async function fetchArticle(url: string): Promise<FetchedArticle> {
  const platform = detectPlatform(url)

  // 头条：将 www.toutiao.com/article/ID 重写为 m.toutiao.com/article/ID 以获取 SSR 正文
  let fetchUrl = url
  if (platform === 'toutiao' && url.includes('www.toutiao.com')) {
    fetchUrl = url.replace('www.toutiao.com', 'm.toutiao.com')
  }

  // 公众号用手机 UA，其他用桌面 UA
  const ua = pickUA(platform === 'weixin' || platform === 'toutiao')
  const headers: Record<string, string> = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
  }

  if (platform === 'weixin') {
    headers['Referer'] = 'https://mp.weixin.qq.com/'
  }
  if (platform === 'toutiao') {
    headers['Referer'] = 'https://m.toutiao.com/'
  }

  const resp = await fetch(fetchUrl, {
    headers,
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
  })

  if (!resp.ok) {
    throw new Error(`抓取失败：HTTP ${resp.status}（${fetchUrl}）`)
  }

  const html = await resp.text()

  let article: FetchedArticle
  switch (platform) {
    case 'weixin':   article = parseWeixin(html, url); break
    case 'zhihu':    article = parseZhihu(html, url); break
    case 'jianshu':  article = parseJianshu(html, url); break
    case 'toutiao':  article = parseToutiao(html, url); break
    default:         article = parseGeneric(html, url); break
  }

  // 异步缓存所有图片（解决微信防盗链 + 头条签名过期）
  // 并行下载，失败静默降级，不阻塞主流程
  const imgRe = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g
  const imgMatches = [...article.content.matchAll(imgRe)]
  if (imgMatches.length > 0) {
    const referer = platform === 'weixin' ? 'https://mp.weixin.qq.com/' :
                    platform === 'toutiao' ? 'https://m.toutiao.com/' : undefined
    const replacements = await Promise.all(
      imgMatches.map(async (m) => ({
        original: m[0],
        cached: `![${m[1]}](${await cacheImageUrl(m[2], referer)})`,
      }))
    )
    for (const { original, cached } of replacements) {
      article.content = article.content.replace(original, cached)
    }
  }

  return article
}

/**
 * 批量抓取，串行执行（防止并发被封）
 * 每篇之间随机延迟 500-1500ms
 */
export async function fetchArticles(urls: string[]): Promise<{
  success: FetchedArticle[]
  failed: Array<{ url: string; error: string }>
}> {
  const success: FetchedArticle[] = []
  const failed: Array<{ url: string; error: string }> = []

  for (const url of urls) {
    try {
      const article = await fetchArticle(url)
      if (article.content.length < 50) {
        failed.push({ url, error: '正文内容太短，可能抓取失败' })
      } else {
        success.push(article)
      }
    } catch (e) {
      failed.push({ url, error: e instanceof Error ? e.message : '未知错误' })
    }
    // 串行延迟，防止被限速
    if (urls.indexOf(url) < urls.length - 1) {
      await new Promise(r => setTimeout(r, 500 + Math.random() * 1000))
    }
  }

  return { success, failed }
}
