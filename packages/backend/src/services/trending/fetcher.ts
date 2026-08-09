import { logger } from '../../utils/logger'
import type { TrendingItem, TrendingPlatform, TrendingCategory } from '@yuncbaowen/shared'

/**
 * 热点追踪 - 通过公开 API 聚合各平台热榜
 * 使用 weibo/zhihu/douyin 的公开热榜接口
 */

async function fetchWithTimeout(url: string, options: RequestInit = {}, ms = 8000): Promise<Response> {
  return fetch(url, { ...options, signal: AbortSignal.timeout(ms) })
}

/** 微博热搜 - 使用公开热搜榜接口 */
async function fetchWeibo(): Promise<TrendingItem[]> {
  try {
    const resp = await fetchWithTimeout(
      'https://weibo.com/ajax/side/hotSearch',
      { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' } }
    )
    if (!resp.ok) throw new Error(`weibo ${resp.status}`)
    const json = await resp.json() as {
      data?: { realtime?: Array<{ word: string; num?: number; label_name?: string; rank?: number }> }
    }
    const items = json.data?.realtime ?? []
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
    logger.warn('Weibo fetch failed:', err)
    return getMockTrending('weibo')
  }
}

/** 知乎热榜 */
async function fetchZhihu(): Promise<TrendingItem[]> {
  try {
    const resp = await fetchWithTimeout(
      'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=30',
      { headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Cookie': '',
      }}
    )
    if (!resp.ok) throw new Error(`zhihu ${resp.status}`)
    const json = await resp.json() as {
      data?: Array<{ target?: { title?: string; url?: string }; detail_text?: string }>
    }
    return (json.data ?? []).slice(0, 30).map((item, idx) => ({
      id:         `zhihu-${idx}`,
      platform:   'zhihu' as TrendingPlatform,
      title:      item.target?.title ?? '',
      url:        item.target?.url ?? `https://www.zhihu.com/hot`,
      heat_value: parseInt(item.detail_text?.replace(/[^0-9]/g, '') ?? '0') || (30 - idx) * 500,
      category:   'all' as TrendingCategory,
      rank:       idx + 1,
      is_hot:     idx < 5,
      fetched_at: new Date().toISOString(),
    })).filter(i => i.title)
  } catch (err) {
    logger.warn('Zhihu fetch failed:', err)
    return getMockTrending('zhihu')
  }
}

/** 头条热榜 */
async function fetchToutiao(): Promise<TrendingItem[]> {
  try {
    const resp = await fetchWithTimeout(
      'https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    if (!resp.ok) throw new Error(`toutiao ${resp.status}`)
    const json = await resp.json() as {
      data?: Array<{ Title?: string; Url?: string; HotValue?: number; Index?: number }>
    }
    return (json.data ?? []).slice(0, 30).map((item, idx) => ({
      id:         `toutiao-${idx}`,
      platform:   'toutiao' as TrendingPlatform,
      title:      item.Title ?? '',
      url:        item.Url ?? 'https://www.toutiao.com',
      heat_value: item.HotValue ?? (30 - idx) * 800,
      category:   'all' as TrendingCategory,
      rank:       item.Index ?? idx + 1,
      is_hot:     (item.HotValue ?? 0) >= 100000,
      fetched_at: new Date().toISOString(),
    })).filter(i => i.title)
  } catch (err) {
    logger.warn('Toutiao fetch failed:', err)
    return getMockTrending('toutiao')
  }
}

/** 抖音热榜（使用第三方聚合接口） */
async function fetchDouyin(): Promise<TrendingItem[]> {
  try {
    const resp = await fetchWithTimeout(
      'https://api.vvhan.com/api/hotlist?type=douyinHot',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    )
    if (!resp.ok) throw new Error(`douyin ${resp.status}`)
    const json = await resp.json() as { success?: boolean; data?: Array<{ title?: string; url?: string; hot?: string }> }
    if (!json.success) throw new Error('douyin api failed')
    return (json.data ?? []).slice(0, 30).map((item, idx) => ({
      id:         `douyin-${idx}`,
      platform:   'douyin' as TrendingPlatform,
      title:      item.title ?? '',
      url:        item.url ?? 'https://www.douyin.com',
      heat_value: parseInt(item.hot?.replace(/[^0-9]/g, '') ?? '0') || (30 - idx) * 600,
      category:   'all' as TrendingCategory,
      rank:       idx + 1,
      is_hot:     idx < 10,
      fetched_at: new Date().toISOString(),
    })).filter(i => i.title)
  } catch (err) {
    logger.warn('Douyin fetch failed:', err)
    return getMockTrending('douyin')
  }
}

/** 当真实 API 不可用时返回 Mock 数据 */
function getMockTrending(platform: TrendingPlatform): TrendingItem[] {
  const mockTopics = [
    '人工智能改变工作方式', '副业变现新思路', '年轻人如何理财', '健康生活新趋势',
    '职场沟通技巧', '创业故事分享', '情感关系处理', '科技前沿动态',
    '美食探店打卡', '旅行攻略分享', '读书心得体会', '电影口碑评测',
  ]
  return mockTopics.map((title, idx) => ({
    id:         `${platform}-mock-${idx}`,
    platform,
    title:      `【${platform}】${title}`,
    url:        `https://www.${platform}.com/search/${encodeURIComponent(title)}`,
    heat_value: Math.floor(Math.random() * 50000) + 5000,
    category:   'all' as TrendingCategory,
    rank:       idx + 1,
    is_hot:     idx < 5,
    fetched_at: new Date().toISOString(),
  }))
}

export const FETCHERS: Record<TrendingPlatform, () => Promise<TrendingItem[]>> = {
  weibo:   fetchWeibo,
  zhihu:   fetchZhihu,
  toutiao: fetchToutiao,
  douyin:  fetchDouyin,
}

/** 聚合所有平台或单个平台的热榜 */
export async function fetchTrending(platform: TrendingPlatform | 'all' = 'all'): Promise<TrendingItem[]> {
  if (platform === 'all') {
    const results = await Promise.allSettled(
      Object.values(FETCHERS).map(f => f())
    )
    return results
      .filter((r): r is PromiseFulfilledResult<TrendingItem[]> => r.status === 'fulfilled')
      .flatMap(r => r.value)
      .sort((a, b) => b.heat_value - a.heat_value)
  }
  const fetcher = FETCHERS[platform]
  if (!fetcher) return []
  return fetcher()
}
