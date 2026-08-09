import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth } from '../middleware/auth'
import { fetchTrending } from '../services/trending/fetcher'
import type { TrendingCategory } from '@yuncbaowen/shared'

export const trendingRouter = Router()
trendingRouter.use(requireAuth)

const CACHE_TTL = 5 * 60 * 1000 // 5分钟
export const memCache = new Map<string, { data: unknown; ts: number }>()

trendingRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const platform = (req.query.platform as string) || 'all'
    const category = (req.query.category as TrendingCategory) || 'all'
    // refresh=1 强制跳过缓存
    const forceRefresh = req.query.refresh === '1'
    const cacheKey = `trending:${platform}:${category}`

    if (!forceRefresh) {
      const cached = memCache.get(cacheKey)
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return void res.json({ success: true, data: { ...cached.data, cached: true } })
      }
    }

    const items = await fetchTrending(platform)
    const filtered = category === 'all' ? items : items.filter(i => i.category === category)
    const sorted   = filtered.sort((a, b) => {
      if (a.is_hot !== b.is_hot) return a.is_hot ? -1 : 1
      return b.heat_value - a.heat_value
    })

    const responseData = {
      items: sorted,
      platform,
      category,
      cached: false,
      fetched_at: new Date().toISOString(),
    }
    memCache.set(cacheKey, { data: responseData, ts: Date.now() })
    res.json({ success: true, data: responseData })
  } catch (err) { next(err) }
})

// 清除缓存（内部用，生产可加鉴权）
trendingRouter.post('/cache/clear', (_req: Request, res: Response) => {
  memCache.clear()
  res.json({ success: true, message: '热点缓存已清除' })
})
