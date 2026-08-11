import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Type, Loader2, Copy, Check, RefreshCw, ChevronRight, Bookmark, BookmarkCheck, Star } from 'lucide-react'
import { aiApi } from '../../api'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

// ── 套路颜色配置 ──────────────────────────────────────────────
const TYPE_CONFIG: Record<string, { color: string; bg: string }> = {
  '悬念式': { color: 'text-purple-300',  bg: 'bg-purple-500/15' },
  '数字式': { color: 'text-blue-300',    bg: 'bg-blue-500/15'   },
  '反差式': { color: 'text-orange-300',  bg: 'bg-orange-500/15' },
  '痛点式': { color: 'text-red-300',     bg: 'bg-red-500/15'    },
  '福利式': { color: 'text-brand-300',   bg: 'bg-brand-500/15'  },
  '共鸣式': { color: 'text-pink-300',    bg: 'bg-pink-500/15'   },
  '案例式': { color: 'text-amber-300',   bg: 'bg-amber-500/15'  },
  '对比式': { color: 'text-teal-300',    bg: 'bg-teal-500/15'   },
  '提问式': { color: 'text-cyan-300',    bg: 'bg-cyan-500/15'   },
  '打赌式': { color: 'text-indigo-300',  bg: 'bg-indigo-500/15' },
  '紧迫式': { color: 'text-rose-300',    bg: 'bg-rose-500/15'   },
  '身份式': { color: 'text-violet-300',  bg: 'bg-violet-500/15' },
  '趋势式': { color: 'text-emerald-300', bg: 'bg-emerald-500/15'},
}

// ── 标题预估点击率（规则引擎）────────────────────────────────
function estimateClickRate(title: string): number {
  let score = 60
  if (/\d+/.test(title)) score += 8            // 有数字
  if (title.length >= 15 && title.length <= 26) score += 6  // 合适长度
  if (/[？?]/.test(title)) score += 5           // 有疑问
  if (/你|我/.test(title)) score += 4           // 人称代词
  if (/竟然|居然|原来|其实/.test(title)) score += 6  // 意外词
  if (/免费|白嫖|不花钱/.test(title)) score += 4  // 利益词
  if (/秘诀|秘密|方法|技巧/.test(title)) score += 3
  if (/月入|涨薪|副业/.test(title)) score += 4
  if (/最好|最快|第一|最强/.test(title)) score -= 8   // 违禁词
  if (title.length > 30) score -= 4             // 太长
  if (title.length < 12) score -= 5             // 太短
  return Math.min(Math.max(score, 20), 98)
}

const STYLE_OPTIONS = [
  { id: '',        label: '通用'  },
  { id: '情感博主', label: '情感' },
  { id: '财经分析', label: '财经' },
  { id: '科技测评', label: '科技' },
  { id: '健康养生', label: '健康' },
  { id: '职场干货', label: '职场' },
]

interface TitleItem { text: string; type: string }

export default function TitlePage() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const initTopic = (location.state as { topic?: string })?.topic || ''

  const [topic,   setTopic]   = useState(initTopic)
  const [style,   setStyle]   = useState('')
  const [count,   setCount]   = useState(12)
  const [loading, setLoading] = useState(false)
  const [titles,  setTitles]  = useState<TitleItem[]>([])
  const [copied,  setCopied]  = useState<number | null>(null)
  const [bookmarks, setBookmarks] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('title_bookmarks') || '[]')) }
    catch { return new Set() }
  })
  const [sortBy, setSortBy] = useState<'default' | 'score'>('default')

  useEffect(() => { if (initTopic) generate() }, [])

  async function generate() {
    if (!topic.trim()) return void toast.error('请输入主题')
    setLoading(true); setTitles([])
    try {
      const res = await aiApi.generateTitles({ topic: topic.trim(), style: style || undefined, count })
      setTitles(res.data.data.titles)
      toast.success(`生成了 ${res.data.data.titles.length} 个标题`)
    } catch { } finally { setLoading(false) }
  }

  async function copyTitle(text: string, idx: number) {
    await navigator.clipboard.writeText(text)
    setCopied(idx); toast.success('已复制')
    setTimeout(() => setCopied(null), 2000)
  }

  async function copyAll() {
    const text = sortedTitles.map((t, i) => `${i + 1}. ${t.text}`).join('\n')
    await navigator.clipboard.writeText(text)
    toast.success(`已复制 ${sortedTitles.length} 个标题`)
  }

  function toggleBookmark(idx: number) {
    setBookmarks(prev => {
      const next = new Set(prev)
      if (next.has(idx)) { next.delete(idx); toast('取消收藏', { icon: '🗑️' }) }
      else { next.add(idx); toast.success('已收藏') }
      localStorage.setItem('title_bookmarks', JSON.stringify([...next]))
      return next
    })
  }

  const sortedTitles = sortBy === 'score'
    ? [...titles].sort((a, b) => estimateClickRate(b.text) - estimateClickRate(a.text))
    : titles

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <Type size={20} className="text-purple-400" />
          <h1 className="section-title mb-0">爆款标题</h1>
        </div>
        <p className="section-desc">13 种套路批量生成，附点击率预估，一键跳转生成全文</p>
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
            {STYLE_OPTIONS.map(s => (
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
            <span className="text-xs text-slate-400">数量：</span>
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

        <button onClick={generate} disabled={loading || !topic.trim()} className="btn-primary w-full justify-center">
          {loading ? <><Loader2 size={15} className="animate-spin" />生成中...</> : <><Type size={15} />批量生成标题</>}
        </button>
      </div>

      {/* 结果区 */}
      {titles.length > 0 && (
        <div className="card overflow-hidden animate-slide-up">
          <div className="flex items-center justify-between px-5 py-3 border-b border-dark-500">
            <span className="text-sm font-medium text-slate-300">共 {titles.length} 个标题</span>
            <div className="flex items-center gap-2">
              {/* 排序 */}
              <button onClick={() => setSortBy(s => s === 'default' ? 'score' : 'default')}
                className={cn('flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-all',
                  sortBy === 'score'
                    ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-dark-400 text-slate-400 hover:text-slate-200'
                )}>
                <Star size={10} />
                {sortBy === 'score' ? '按评分' : '默认排序'}
              </button>
              <button onClick={generate} className="btn-ghost text-xs">
                <RefreshCw size={12} />换一批
              </button>
              <button onClick={copyAll} className="btn-secondary text-xs py-1.5 px-3">
                <Copy size={12} />复制全部
              </button>
            </div>
          </div>

          <div className="divide-y divide-dark-500">
            {sortedTitles.map((t, idx) => {
              const score = estimateClickRate(t.text)
              const typeConf = TYPE_CONFIG[t.type] || { color: 'text-slate-400', bg: 'bg-dark-400' }
              const origIdx = titles.indexOf(t)

              return (
                <div key={idx}
                  className="flex items-start gap-3 px-5 py-3.5 hover:bg-dark-300/50 transition-colors group">
                  <span className="text-xs text-slate-600 mt-1 w-5 shrink-0 tabular-nums">{idx + 1}</span>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-100 leading-relaxed mb-1.5">{t.text}</p>
                    <div className="flex items-center gap-2">
                      {/* 套路标签 */}
                      {t.type && (
                        <span className={cn('badge text-[10px]', typeConf.bg, typeConf.color)}>
                          {t.type}
                        </span>
                      )}
                      {/* 点击率预估 */}
                      <span className={cn(
                        'text-[10px] flex items-center gap-0.5',
                        score >= 80 ? 'text-amber-400' : score >= 70 ? 'text-emerald-400' : 'text-slate-500'
                      )}>
                        <Star size={9} />{score}分
                      </span>
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1 shrink-0">
                    {/* 收藏 */}
                    <button
                      onClick={() => toggleBookmark(origIdx)}
                      className={cn(
                        'p-1.5 rounded-lg transition-all',
                        bookmarks.has(origIdx)
                          ? 'text-amber-400'
                          : 'text-slate-600 opacity-0 group-hover:opacity-100 hover:text-amber-400 hover:bg-dark-400'
                      )}>
                      {bookmarks.has(origIdx) ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
                    </button>
                    {/* 复制 */}
                    <button onClick={() => copyTitle(t.text, idx)}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-slate-600 hover:text-slate-200 hover:bg-dark-400 transition-all">
                      {copied === idx ? <Check size={13} className="text-brand-400" /> : <Copy size={13} />}
                    </button>
                    {/* 生成全文 */}
                    <button
                      onClick={() => navigate('/generate', { state: { topic: t.text } })}
                      className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-slate-600 hover:text-slate-200 hover:bg-dark-400 transition-all"
                      title="用此标题生成全文">
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* 已收藏摘要 */}
          {bookmarks.size > 0 && (
            <div className="px-5 py-3 border-t border-dark-500 bg-dark-400/30">
              <p className="text-xs text-slate-500">
                已收藏 <span className="text-amber-400 font-medium">{bookmarks.size}</span> 个标题
                <button onClick={async () => {
                  const saved = [...bookmarks].map(i => titles[i]?.text).filter(Boolean).join('\n')
                  await navigator.clipboard.writeText(saved)
                  toast.success('已复制收藏的标题')
                }} className="ml-2 text-brand-400 hover:underline">复制收藏</button>
              </p>
            </div>
          )}
        </div>
      )}

      {/* 空状态 */}
      {!loading && titles.length === 0 && (
        <div className="card p-12 flex flex-col items-center justify-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center">
            <Type size={28} className="text-purple-400" />
          </div>
          <div>
            <h3 className="text-slate-300 font-medium mb-1">13 种套路批量生成</h3>
            <p className="text-sm text-slate-500 max-w-xs">
              悬念式、数字式、反差式、痛点式... 每次生成不同套路组合，附点击率预估
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
