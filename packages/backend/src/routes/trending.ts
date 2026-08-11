import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth } from '../middleware/auth'
import { fetchTrending } from '../services/trending/fetcher'
import type { TrendingCategory } from '@yuncbaowen/shared'

export const trendingRouter = Router()
trendingRouter.use(requireAuth)

const CACHE_TTL   = 5 * 60 * 1000   // 5分钟：新鲜
const STALE_TTL   = 30 * 60 * 1000  // 30分钟：过期但可用（stale）
const FORCE_TTL   = 2 * 60 * 60 * 1000 // 2小时：强制刷新

interface CacheEntry {
  data: unknown
  ts: number
  isRefreshing?: boolean
}
export const memCache = new Map<string, CacheEntry>()

// 后台静默刷新（不阻塞请求）
async function refreshInBackground(cacheKey: string, platform: string, category: string) {
  const entry = memCache.get(cacheKey)
  if (entry?.isRefreshing) return  // 已在刷新中，跳过
  if (entry) entry.isRefreshing = true
  try {
    const items = await fetchTrending(platform as Parameters<typeof fetchTrending>[0])
    const filtered = category === 'all' ? items : items.filter(i => i.category === category)
    const sorted = filtered.sort((a, b) => {
      if (a.is_hot !== b.is_hot) return a.is_hot ? -1 : 1
      return b.heat_value - a.heat_value
    })
    const responseData = { items: sorted, platform, category, cached: false, fetched_at: new Date().toISOString() }
    memCache.set(cacheKey, { data: responseData, ts: Date.now() })
  } catch { /* 后台刷新失败，保留旧缓存 */ }
}

trendingRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const platform = (req.query.platform as string) || 'all'
    const category = (req.query.category as TrendingCategory) || 'all'
    const forceRefresh = req.query.refresh === '1'
    const cacheKey = `trending:${platform}:${category}`

    const cached = memCache.get(cacheKey)
    const age = cached ? Date.now() - cached.ts : Infinity

    if (!forceRefresh && cached) {
      if (age < CACHE_TTL) {
        // 新鲜缓存：直接返回
        return void res.json({ success: true, data: { ...cached.data as object, cached: true, cache_age_sec: Math.floor(age / 1000) } })
      }
      if (age < STALE_TTL) {
        // 过期但可用：返回 stale 数据，同时后台静默刷新
        refreshInBackground(cacheKey, platform, category).catch(() => {})
        return void res.json({ success: true, data: { ...cached.data as object, cached: true, stale: true, cache_age_sec: Math.floor(age / 1000) } })
      }
      if (age < FORCE_TTL) {
        // 超旧但别无选择：返回旧数据，强制后台刷新
        refreshInBackground(cacheKey, platform, category).catch(() => {})
        return void res.json({ success: true, data: { ...cached.data as object, cached: true, stale: true, cache_age_sec: Math.floor(age / 1000) } })
      }
    }

    // 无缓存 or forceRefresh or 超过 2 小时：同步获取
    const items = await fetchTrending(platform as Parameters<typeof fetchTrending>[0])
    const filtered = category === 'all' ? items : items.filter(i => i.category === category)
    const sorted = filtered.sort((a, b) => {
      if (a.is_hot !== b.is_hot) return a.is_hot ? -1 : 1
      return b.heat_value - a.heat_value
    })

    const responseData = { items: sorted, platform, category, cached: false, fetched_at: new Date().toISOString(), cache_age_sec: 0 }
    memCache.set(cacheKey, { data: responseData, ts: Date.now() })
    res.json({ success: true, data: responseData })
  } catch (err) { next(err) }
})

// 清除缓存（仅管理员或 enterprise 用户可用）
trendingRouter.post('/cache/clear', requireAuth, (req: Request, res: Response) => {
  if (req.user!.plan !== 'enterprise') {
    return void res.status(403).json({ success: false, error: '无权限，仅 enterprise 用户可清除缓存' })
  }
  memCache.clear()
  res.json({ success: true, message: '热点缓存已清除' })
})
