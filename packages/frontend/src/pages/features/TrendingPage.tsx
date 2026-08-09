import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { TrendingUp, RefreshCw, Flame, ArrowRight, Loader2 } from 'lucide-react'
import { trendingApi } from '../../api'
import type { TrendingItem, TrendingCategory } from '@yuncbaowen/shared'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

const PLATFORMS: Array<{ id: string; label: string; icon: string }> = [
  { id: 'all',      label: '全部',  icon: '🌐' },
  { id: 'toutiao',  label: '头条',  icon: '🔶' },
  { id: 'bilibili', label: 'B站',   icon: '📺' },
  { id: 'weibo',    label: '微博',  icon: '🔴' },
  { id: 'zhihu',    label: '知乎',  icon: '🔵' },
  { id: 'douyin',   label: '抖音',  icon: '⚫' },
]

const CATEGORIES: Array<{ id: TrendingCategory; label: string }> = [
  { id: 'all',           label: '全部' },
  { id: 'tech',          label: '科技' },
  { id: 'finance',       label: '财经' },
  { id: 'entertainment', label: '娱乐' },
  { id: 'health',        label: '健康' },
  { id: 'emotion',       label: '情感' },
  { id: 'society',       label: '社会' },
]

export default function TrendingPage() {
  const navigate = useNavigate()
  const [platform, setPlatform] = useState<string>('all')
  const [category, setCategory] = useState<TrendingCategory>('all')
  const [items, setItems]       = useState<TrendingItem[]>([])
  const [loading, setLoading]   = useState(true)
  const [cached,  setCached]    = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await trendingApi.list(platform, category)
      setItems(res.data.data.items)
      setCached(res.data.data.cached)
    } catch { toast.error('获取热榜失败') }
    finally { setLoading(false) }
  }, [platform, category])

  useEffect(() => { load() }, [load])

  function openTitle(item: TrendingItem) {
    navigate('/title', { state: { topic: item.title } })
  }
  function openGenerate(item: TrendingItem) {
    navigate('/generate', { state: { topic: item.title } })
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <TrendingUp size={20} className="text-orange-400" />
          <h1 className="section-title mb-0">热点追踪</h1>
          {cached && <span className="badge bg-dark-400 text-slate-400 text-[10px]">缓存中</span>}
        </div>
        <p className="section-desc">聚合全网热榜，按热度排序，破万爆点自动置顶</p>
      </div>

      {/* 平台切换 */}
      <div className="flex items-center gap-2 flex-wrap">
        {PLATFORMS.map(p => (
          <button key={p.id} onClick={() => setPlatform(p.id)}
            className={cn('flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all',
              platform === p.id
                ? 'bg-brand-600 text-white'
                : 'bg-dark-300 text-slate-400 hover:text-slate-100 hover:bg-dark-400'
            )}>
            <span>{p.icon}</span>{p.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="btn-ghost flex items-center gap-1.5 text-sm">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            刷新
          </button>
        </div>
      </div>

      {/* 分类筛选 */}
      <div className="flex gap-1.5 flex-wrap">
        {CATEGORIES.map(c => (
          <button key={c.id} onClick={() => setCategory(c.id)}
            className={cn('px-3 py-1 rounded-full text-xs font-medium transition-all',
              category === c.id
                ? 'bg-dark-500 text-slate-100 border border-dark-600'
                : 'text-slate-500 hover:text-slate-300 hover:bg-dark-400'
            )}>
            {c.label}
          </button>
        ))}
      </div>

      {/* 热榜列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-slate-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-slate-500">暂无热点数据</div>
      ) : (
        <div className="card divide-y divide-dark-500">
          {items.map((item, idx) => (
            <div key={item.id}
              className="flex items-center gap-4 px-4 py-3.5 hover:bg-dark-300/50 transition-colors group">
              {/* 排名 */}
              <span className={cn('w-7 text-center text-sm font-bold shrink-0',
                idx < 3 ? ['text-red-400', 'text-orange-400', 'text-amber-400'][idx] : 'text-slate-600'
              )}>
                {idx + 1}
              </span>

              {/* 平台标签 */}
              <span className="badge bg-dark-400 text-slate-400 text-[10px] shrink-0">
                {PLATFORMS.find(p => p.id === item.platform)?.icon} {item.platform}
              </span>

              {/* 标题 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-slate-200 hover:text-brand-400 truncate transition-colors">
                    {item.title}
                  </a>
                  {item.is_hot && (
                    <span className="badge bg-red-500/15 text-red-400 border border-red-500/20 shrink-0">
                      <Flame size={10} /> 破万
                    </span>
                  )}
                </div>
              </div>

              {/* 热度 */}
              <span className="text-xs text-slate-500 shrink-0 w-16 text-right">
                {item.heat_value >= 10000
                  ? `${(item.heat_value / 10000).toFixed(1)}w`
                  : item.heat_value.toLocaleString()}
              </span>

              {/* 操作（hover 显示） */}
              <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => openTitle(item)}
                  className="px-2.5 py-1 rounded bg-purple-500/20 text-purple-300 text-xs hover:bg-purple-500/30 transition-colors">
                  💡 标题
                </button>
                <button onClick={() => openGenerate(item)}
                  className="px-2.5 py-1 rounded bg-brand-500/20 text-brand-300 text-xs hover:bg-brand-500/30 transition-colors flex items-center gap-1">
                  ✍️ 写全文 <ArrowRight size={10} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
