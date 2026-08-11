import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, RefreshCw, Flame, ArrowRight, Loader2, Bookmark, BookmarkCheck, Clock, Wifi, WifiOff } from 'lucide-react'
import { trendingApi } from '../../api'
import type { TrendingItem, TrendingCategory } from '@yuncbaowen/shared'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

// ── 平台配置 ──────────────────────────────────────────────────
const PLATFORMS = [
  { id: 'all',      label: '全部',  icon: '🌐' },
  { id: 'toutiao',  label: '头条',  icon: '🔶' },
  { id: 'bilibili', label: 'B站',   icon: '📺' },
  { id: 'weibo',    label: '微博',  icon: '🔴' },
  { id: 'zhihu',    label: '知乎',  icon: '🔵' },
  { id: 'douyin',   label: '抖音',  icon: '⚫' },
]

const CATEGORIES = [
  { id: 'all' as TrendingCategory,           label: '全部' },
  { id: 'tech' as TrendingCategory,          label: '科技' },
  { id: 'finance' as TrendingCategory,       label: '财经' },
  { id: 'entertainment' as TrendingCategory, label: '娱乐' },
  { id: 'health' as TrendingCategory,        label: '健康' },
  { id: 'emotion' as TrendingCategory,       label: '情感' },
  { id: 'society' as TrendingCategory,       label: '社会' },
]

// ── 新鲜度显示 ─────────────────────────────────────────────────
function FreshnessLabel({ cacheAgeSec, stale }: { cacheAgeSec?: number; stale?: boolean }) {
  if (cacheAgeSec === undefined || cacheAgeSec === 0) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-emerald-400">
        <Wifi size={9} />刚刚更新
      </span>
    )
  }
  const minutes = Math.floor(cacheAgeSec / 60)
  if (stale) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-amber-400">
        <WifiOff size={9} />{minutes}分钟前（刷新中...）
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-[10px] text-slate-500">
      <Clock size={9} />{minutes < 1 ? '刚刚' : `${minutes}分钟前`}
    </span>
  )
}

// ── 热度进度条 ─────────────────────────────────────────────────
function HeatBar({ value, max }: { value: number; max: number }) {
  const ratio = Math.min(value / max, 1)
  const pct = Math.round(ratio * 100)
  const color = ratio > 0.7 ? 'bg-red-500' : ratio > 0.4 ? 'bg-orange-500' : 'bg-amber-500'
  return (
    <div className="w-16 h-1 bg-dark-500 rounded-full overflow-hidden">
      <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── 主页面 ─────────────────────────────────────────────────────
export default function TrendingPage() {
  const navigate = useNavigate()
  const [platform,  setPlatform]  = useState('all')
  const [category,  setCategory]  = useState<TrendingCategory>('all')
  const [items,     setItems]     = useState<TrendingItem[]>([])
  const [loading,   setLoading]   = useState(true)
  const [meta,      setMeta]      = useState<{ cached?: boolean; stale?: boolean; cache_age_sec?: number }>({})
  const [bookmarks, setBookmarks] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('trending_bookmarks') || '[]')) }
    catch { return new Set() }
  })
  // 前端缓存：切换 tab 不重复请求
  const cache = useRef<Map<string, { items: TrendingItem[]; meta: typeof meta }>>(new Map())

  const load = useCallback(async (force = false) => {
    const key = `${platform}:${category}`
    if (!force && cache.current.has(key)) {
      const hit = cache.current.get(key)!
      setItems(hit.items)
      setMeta(hit.meta)
      return
    }
    setLoading(true)
    try {
      const res = await trendingApi.list(platform, category)
      const d = res.data.data
      setItems(d.items)
      setMeta({ cached: d.cached, stale: (d as { stale?: boolean }).stale, cache_age_sec: (d as { cache_age_sec?: number }).cache_age_sec })
      cache.current.set(key, { items: d.items, meta: { cached: d.cached, stale: (d as { stale?: boolean }).stale, cache_age_sec: (d as { cache_age_sec?: number }).cache_age_sec } })
    } catch { toast.error('获取热榜失败') }
    finally { setLoading(false) }
  }, [platform, category])

  useEffect(() => { load() }, [load])

  function toggleBookmark(item: TrendingItem) {
    setBookmarks(prev => {
      const next = new Set(prev)
      if (next.has(item.id)) { next.delete(item.id); toast('已取消收藏', { icon: '🗑️' }) }
      else { next.add(item.id); toast.success('已收藏') }
      localStorage.setItem('trending_bookmarks', JSON.stringify([...next]))
      return next
    })
  }

  function openTitle(item: TrendingItem) {
    navigate('/title', { state: { topic: item.title } })
  }
  function openGenerate(item: TrendingItem) {
    navigate('/generate', { state: { topic: item.title } })
  }

  // 计算热度最大值（用于进度条）
  const maxHeat = Math.max(...items.map(i => i.heat_value), 1)

  return (
    <div className="space-y-5 animate-fade-in">
      {/* 页面头部 */}
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <TrendingUp size={20} className="text-orange-400" />
          <h1 className="section-title mb-0">热点追踪</h1>
          <FreshnessLabel cacheAgeSec={meta.cache_age_sec} stale={meta.stale} />
        </div>
        <p className="section-desc">聚合全网热榜，按热度排序，一键生成相关标题或文章</p>
      </div>

      {/* 平台切换 */}
      <div className="flex items-center gap-2 flex-wrap">
        {PLATFORMS.map(p => (
          <button
            key={p.id}
            onClick={() => setPlatform(p.id)}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all',
              platform === p.id
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-dark-300 text-slate-400 hover:text-slate-100 hover:bg-dark-400'
            )}
          >
            <span>{p.icon}</span>{p.label}
          </button>
        ))}
        <button
          onClick={() => { cache.current.clear(); load(true) }}
          disabled={loading}
          className="ml-auto btn-ghost flex items-center gap-1.5 text-sm"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          刷新
        </button>
      </div>

      {/* 分类筛选 */}
      <div className="flex gap-1.5 flex-wrap">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-medium transition-all',
              category === c.id
                ? 'bg-dark-500 text-slate-100 border border-dark-400'
                : 'text-slate-500 hover:text-slate-300 hover:bg-dark-400'
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      {loading ? (
        <div className="card p-8 flex flex-col items-center justify-center gap-3 text-slate-500">
          <Loader2 size={24} className="animate-spin" />
          <span className="text-sm">加载热榜中...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="card p-12 flex flex-col items-center justify-center gap-3 text-slate-500">
          <TrendingUp size={32} className="opacity-30" />
          <p className="text-sm">暂无热点数据，点击刷新重试</p>
          <button onClick={() => load(true)} className="btn-secondary text-sm">
            <RefreshCw size={13} />重新加载
          </button>
        </div>
      ) : (
        <div className="card divide-y divide-dark-500/60">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-3.5 hover:bg-dark-300/40 transition-colors group"
            >
              {/* 排名 */}
              <span className={cn(
                'w-6 text-center text-sm font-bold shrink-0 tabular-nums',
                idx === 0 ? 'text-red-400' :
                idx === 1 ? 'text-orange-400' :
                idx === 2 ? 'text-amber-400' : 'text-slate-600'
              )}>
                {idx + 1}
              </span>

              {/* 平台标签 */}
              <span className="text-[11px] text-slate-500 shrink-0 w-10">
                {PLATFORMS.find(p => p.id === item.platform)?.icon} {item.platform}
              </span>

              {/* 标题 + 热度条 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-slate-200 hover:text-brand-400 truncate transition-colors leading-snug"
                  >
                    {item.title}
                  </a>
                  {item.is_hot && (
                    <span className="badge bg-red-500/15 text-red-400 border border-red-500/20 shrink-0 text-[9px]">
                      <Flame size={9} />热
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <HeatBar value={item.heat_value} max={maxHeat} />
                  <span className="text-[10px] text-slate-600 tabular-nums">
                    {item.heat_value >= 10000
                      ? `${(item.heat_value / 10000).toFixed(1)}w`
                      : item.heat_value.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* 收藏按钮 */}
              <button
                onClick={() => toggleBookmark(item)}
                className={cn(
                  'shrink-0 p-1.5 rounded-lg transition-all opacity-0 group-hover:opacity-100',
                  bookmarks.has(item.id)
                    ? 'text-amber-400 opacity-100'
                    : 'text-slate-500 hover:text-amber-400 hover:bg-dark-400'
                )}
                title={bookmarks.has(item.id) ? '取消收藏' : '收藏'}
              >
                {bookmarks.has(item.id)
                  ? <BookmarkCheck size={14} />
                  : <Bookmark size={14} />
                }
              </button>

              {/* 操作按钮（hover 显示） */}
              <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button
                  onClick={() => openTitle(item)}
                  className="px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-300 text-xs hover:bg-purple-500/25 transition-colors"
                >
                  💡 标题
                </button>
                <button
                  onClick={() => openGenerate(item)}
                  className="px-2.5 py-1 rounded-lg bg-brand-500/15 text-brand-300 text-xs hover:bg-brand-500/25 transition-colors flex items-center gap-1"
                >
                  ✍️ 写文章 <ArrowRight size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
