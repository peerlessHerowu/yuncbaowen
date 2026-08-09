import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Type, Loader2, Copy, Check, RefreshCw, ChevronRight } from 'lucide-react'
import { aiApi } from '../../api'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

const STYLES = [
  { id: '',        label: '通用'   },
  { id: '情感博主', label: '情感'   },
  { id: '财经分析', label: '财经'   },
  { id: '科技测评', label: '科技'   },
  { id: '健康养生', label: '健康'   },
  { id: '职场干货', label: '职场'   },
]

interface TitleItem { text: string; type: string }

export default function TitlePage() {
  const location = useLocation()
  const initTopic = (location.state as { topic?: string })?.topic || ''

  const [topic,   setTopic]   = useState(initTopic)
  const [style,   setStyle]   = useState('')
  const [count,   setCount]   = useState(12)
  const [loading, setLoading] = useState(false)
  const [titles,  setTitles]  = useState<TitleItem[]>([])
  const [copied,  setCopied]  = useState<number | null>(null)

  // 如果有初始 topic 则自动生成
  useEffect(() => {
    if (initTopic) generate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function generate() {
    if (!topic.trim()) return void toast.error('请输入主题')
    setLoading(true)
    setTitles([])
    try {
      const res = await aiApi.generateTitles({ topic: topic.trim(), style: style || undefined, count })
      setTitles(res.data.data.titles)
      toast.success(`生成了 ${res.data.data.titles.length} 个标题`)
    } catch { /* 错误已由 axios 拦截器处理 */ }
    finally { setLoading(false) }
  }

  async function copyTitle(text: string, idx: number) {
    await navigator.clipboard.writeText(text)
    setCopied(idx)
    toast.success('已复制')
    setTimeout(() => setCopied(null), 2000)
  }

  async function copyAll() {
    await navigator.clipboard.writeText(titles.map((t, i) => `${i + 1}. ${t.text}`).join('\n'))
    toast.success(`已复制全部 ${titles.length} 个标题`)
  }

  const TYPE_COLORS: Record<string, string> = {
    '悬念式': 'bg-purple-500/15 text-purple-300',
    '数字式': 'bg-blue-500/15 text-blue-300',
    '反差式': 'bg-orange-500/15 text-orange-300',
    '痛点式': 'bg-red-500/15 text-red-300',
    '福利式': 'bg-brand-500/15 text-brand-300',
    '共鸣式': 'bg-pink-500/15 text-pink-300',
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <Type size={20} className="text-purple-400" />
          <h1 className="section-title mb-0">爆款标题</h1>
        </div>
        <p className="section-desc">输入主题，批量生成 10-15 个不同套路的爆款标题</p>
      </div>

      {/* 输入区 */}
      <div className="card p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">主题 / 关键词</label>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), generate())}
            rows={2}
            placeholder="例如：普通人如何月入过万、AI工具提升效率、职场沟通技巧..."
            className="textarea-base"
          />
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {/* 风格 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-400">风格：</span>
            {STYLES.map(s => (
              <button key={s.id} onClick={() => setStyle(s.id)}
                className={cn('px-2.5 py-1 rounded-full text-xs font-medium transition-all',
                  style === s.id
                    ? 'bg-purple-500/25 text-purple-300 border border-purple-500/30'
                    : 'bg-dark-400 text-slate-400 hover:text-slate-200'
                )}>
                {s.label}
              </button>
            ))}
          </div>

          {/* 数量 */}
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-slate-400">生成数量：</span>
            {[8, 12, 15].map(n => (
              <button key={n} onClick={() => setCount(n)}
                className={cn('w-8 h-7 rounded text-xs font-medium transition-all',
                  count === n
                    ? 'bg-purple-500/25 text-purple-300 border border-purple-500/30'
                    : 'bg-dark-400 text-slate-400 hover:text-slate-200'
                )}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={generate} disabled={loading || !topic.trim()}
            className="btn-primary flex-1 justify-center">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Type size={15} />}
            {loading ? '生成中...' : '批量生成标题'}
          </button>
        </div>
      </div>

      {/* 结果区 */}
      {titles.length > 0 && (
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-dark-500">
            <span className="text-sm font-medium text-slate-300">
              共 {titles.length} 个标题
            </span>
            <div className="flex gap-2">
              <button onClick={generate} className="btn-ghost text-xs">
                <RefreshCw size={12} />换一批
              </button>
              <button onClick={copyAll} className="btn-secondary text-xs py-1.5 px-3">
                <Copy size={12} />复制全部
              </button>
            </div>
          </div>
          <div className="divide-y divide-dark-500">
            {titles.map((t, idx) => (
              <div key={idx}
                className="flex items-start gap-3 px-5 py-4 hover:bg-dark-300/50 transition-colors group">
                <span className="text-xs text-slate-600 mt-0.5 w-5 shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-100 leading-relaxed">{t.text}</p>
                  {t.type && (
                    <span className={cn('mt-1.5 badge text-[10px]', TYPE_COLORS[t.type] || 'bg-dark-400 text-slate-400')}>
                      {t.type}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => copyTitle(t.text, idx)}
                    className="p-1.5 rounded hover:bg-dark-400 text-slate-500 hover:text-slate-200 transition-colors">
                    {copied === idx ? <Check size={14} className="text-brand-400" /> : <Copy size={14} />}
                  </button>
                  <button
                    onClick={() => window.open(`/generate?topic=${encodeURIComponent(t.text)}`, '_self')}
                    className="p-1.5 rounded hover:bg-dark-400 text-slate-500 hover:text-slate-200 transition-colors"
                    title="用此标题生成全文">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
