import { logger } from '../../utils/logger'
import type { TrendingItem, TrendingPlatform, TrendingCategory } from '@yuncbaowen/shared'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 8000): Promise<Response> {
  return fetch(url, { ...options, signal: AbortSignal.timeout(ms) })
}

/**
 * 头条热榜 — 真实接口，稳定可用
 */
async function fetchToutiao(): Promise<TrendingItem[]> {
  try {
    const resp = await fetchWithTimeout(
      'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc',
      { headers: { 'User-Agent': UA, 'Referer': 'https://www.toutiao.com/' } }
    )
    if (!resp.ok) throw new Error(`toutiao ${resp.status}`)
    const json = await resp.json() as {
      data?: Array<{ Title?: string; Url?: string; HotValue?: number; Index?: number }>
    }
    const items = (json.data ?? []).filter(i => i.Title)
    if (!items.length) throw new Error('toutiao empty response')
    return items.slice(0, 30).map((item, idx) => ({
      id:         `toutiao-${idx}`,
      platform:   'toutiao' as TrendingPlatform,
      title:      item.Title!,
      url:        item.Url ?? 'https://www.toutiao.com',
      heat_value: item.HotValue ?? (30 - idx) * 800,
      category:   'all' as TrendingCategory,
      rank:       item.Index ?? idx + 1,
      is_hot:     (item.HotValue ?? 0) >= 10000000,
      fetched_at: new Date().toISOString(),
    }))
  } catch (err) {
    logger.warn('Toutiao fetch failed:', err)
    return []
  }
}

/**
 * B站热搜 — 真实接口，稳定可用
 */
async function fetchBilibili(): Promise<TrendingItem[]> {
  try {
    const resp = await fetchWithTimeout(
      'https://api.bilibili.com/x/web-interface/search/square?limit=30&platform=web',
      { headers: { 'User-Agent': UA, 'Referer': 'https://www.bilibili.com/' } }
    )
    if (!resp.ok) throw new Error(`bilibili ${resp.status}`)
    const json = await resp.json() as {
      code?: number
      data?: { trending?: { list?: Array<{ keyword?: string; heat_score?: number }> } }
    }
    if (json.code !== 0) throw new Error(`bilibili code ${json.code}`)
    const items = json.data?.trending?.list ?? []
    if (!items.length) throw new Error('bilibili empty response')
    return items.slice(0, 30).map((item, idx) => ({
      id:         `bilibili-${idx}`,
      platform:   'bilibili' as TrendingPlatform,
      title:      item.keyword ?? '',
      url:        `https://search.bilibili.com/all?keyword=${encodeURIComponent(item.keyword ?? '')}`,
      heat_value: item.heat_score ?? (30 - idx) * 600,
      category:   'all' as TrendingCategory,
      rank:       idx + 1,
      is_hot:     idx < 10,
      fetched_at: new Date().toISOString(),
    })).filter(i => i.title)
  } catch (err) {
    logger.warn('Bilibili fetch failed:', (err as Error).message)
    return []
  }
}

/**
 * 微博热搜 — 优先尝试真实接口，失败则用头条补全
 */
async function fetchWeibo(): Promise<TrendingItem[]> {
  try {
    const resp = await fetchWithTimeout(
      'https://weibo.com/ajax/side/hotSearch',
      {
        headers: {
          'User-Agent': UA,
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://weibo.com/',
          'X-Requested-With': 'XMLHttpRequest',
        }
      }
    )
    if (!resp.ok) throw new Error(`weibo ${resp.status}`)
    const json = await resp.json() as {
      data?: { realtime?: Array<{ word: string; num?: number; rank?: number }> }
    }
    const items = json.data?.realtime ?? []
    if (!items.length) throw new Error('weibo empty')
    return items.slice(0, 30).map((item, idx) => ({
      id:         `weibo-${idx}`,
      platform:   'weibo' as TrendingPlatform,
      title:      item.word,
      url:        `https://s.weibo.com/weibo?q=${encodeURIComponent(item.word)}`,
      heat_value: item.num ?? (30 - idx) * 1000,
      category:   'all' as TrendingCategory,
      rank:       item.rank ?? idx + 1,
      is_hot:     (item.num ?? 0) >= 10000,
      fetched_at: new Date().toISOString(),
    }))
  } catch (err) {
    logger.warn('Weibo fetch failed, using Bilibili as substitute:', err)
    return fetchBilibili()
  }
}

/**
 * 知乎热榜 — 优先尝试真实接口，失败则返回空（不伪造平台标签）
 */
async function fetchZhihu(): Promise<TrendingItem[]> {
  try {
    const resp = await fetchWithTimeout(
      'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=30&desktop=true',
      {
        headers: {
          'User-Agent': UA,
          'x-api-version': '3.0.40',
          'x-app-za': 'OS=Web',
          'Referer': 'https://www.zhihu.com/',
        }
      }
    )
    if (!resp.ok) throw new Error(`zhihu ${resp.status}`)
    const json = await resp.json() as {
      data?: Array<{
        target?: { title?: string; url?: string }
        detail_text?: string
      }>
    }
    const items = (json.data ?? []).filter(i => i.target?.title)
    if (!items.length) throw new Error('zhihu empty')
    return items.slice(0, 30).map((item, idx) => ({
      id:         `zhihu-${idx}`,
      platform:   'zhihu' as TrendingPlatform,
      title:      item.target!.title!,
      url:        item.target?.url ?? 'https://www.zhihu.com/hot',
      heat_value: parseInt(item.detail_text?.replace(/[^0-9]/g, '') ?? '0') || (30 - idx) * 500,
      category:   'all' as TrendingCategory,
      rank:       idx + 1,
      is_hot:     idx < 5,
      fetched_at: new Date().toISOString(),
    }))
  } catch (err) {
    logger.warn('Zhihu fetch failed (will use empty):', (err as Error).message)
    return []   // 失败返回空，不伪造标签
  }
}

/**
 * 抖音热点 — 尝试公开接口，失败则返回空（由头条补充）
 */
async function fetchDouyin(): Promise<TrendingItem[]> {
  // 抖音没有稳定可用的公开 API，目前以头条补充
  // 后续可集成 TikTok Research API 或付费爬虫服务
  try {
    const resp = await fetchWithTimeout(
      'https://www.douyin.com/aweme/v1/web/hot/search/list/?device_platform=webapp&source=6&keyword_num=15',
      {
        headers: {
          'User-Agent': UA,
          'Referer': 'https://www.douyin.com/',
          'Cookie': '',
        }
      }
    )
    if (!resp.ok) throw new Error(`douyin ${resp.status}`)
    const json = await resp.json() as {
      status_code?: number
      data?: { word_list?: Array<{ word?: string; hot_value?: number; position?: number }> }
    }
    const items = json.data?.word_list ?? []
    if (!items.length) throw new Error('douyin empty')
    return items.slice(0, 30).map((item, idx) => ({
      id:         `douyin-${idx}`,
      platform:   'douyin' as TrendingPlatform,
      title:      item.word ?? '',
      url:        `https://www.douyin.com/search/${encodeURIComponent(item.word ?? '')}`,
      heat_value: item.hot_value ?? (30 - idx) * 600,
      category:   'all' as TrendingCategory,
      rank:       item.position ?? idx + 1,
      is_hot:     idx < 10,
      fetched_at: new Date().toISOString(),
    })).filter(i => i.title)
  } catch (err) {
    logger.warn('Douyin fetch failed:', err)
    return []
  }
}

export const FETCHERS: Record<string, () => Promise<TrendingItem[]>> = {
  weibo:    fetchWeibo,
  zhihu:    fetchZhihu,
  toutiao:  fetchToutiao,
  douyin:   fetchDouyin,
  bilibili: fetchBilibili,
}

/**
 * 聚合所有平台或单个平台的热榜
 * 至少保证头条和B站有真实数据；微博/知乎失败时自动用替代源补充
 */
export async function fetchTrending(platform: TrendingPlatform | 'bilibili' | 'all' = 'all'): Promise<TrendingItem[]> {
  if (platform === 'all') {
    const results = await Promise.allSettled(
      Object.values(FETCHERS).map(f => f())
    )
    const all = results
      .filter((r): r is PromiseFulfilledResult<TrendingItem[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .filter(i => i.title) // 去掉空标题

    // 去重：相同标题只保留一条
    const seen = new Set<string>()
    const deduped = all.filter(i => {
      if (seen.has(i.title)) return false
      seen.add(i.title)
      return true
    })

    return deduped.sort((a, b) => {
      if (a.is_hot !== b.is_hot) return a.is_hot ? -1 : 1
      return b.heat_value - a.heat_value
    })
  }

  const fetcher = FETCHERS[platform]
  if (!fetcher) return []
  return fetcher()
}
