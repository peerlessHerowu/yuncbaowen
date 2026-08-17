import { useState, useEffect, useCallback } from 'react'
import type React from 'react'
import { useNavigate } from 'react-router-dom'
import { History, Search, Trash2, Loader2, ChevronRight, X, Copy, Check } from 'lucide-react'
import { creationApi } from '../../api'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

/** 将文本中的 ![alt](url) 渲染为 img 标签，其余保持段落格式 */
function renderContentWithImages(text: string): React.ReactNode[] {
  const imgRe = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g
  const nodes: React.ReactNode[] = []
  let last = 0, key = 0, m: RegExpExecArray | null
  while ((m = imgRe.exec(text)) !== null) {
    if (m.index > last) {
      nodes.push(<span key={key++} className="whitespace-pre-wrap break-words">{text.slice(last, m.index)}</span>)
    }
    nodes.push(
      <img key={key++} src={m[2]} alt={m[1] || '图片'}
        className="max-w-full rounded-lg my-2 block"
        loading="lazy"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    )
    last = m.index + m[0].length
  }
  if (last < text.length) {
    nodes.push(<span key={key++} className="whitespace-pre-wrap break-words">{text.slice(last)}</span>)
  }
  return nodes
}

interface Creation {
  id: number; type: string; title: string;
  content: string; ai_score: number | null; created_at: string
  meta?: string
}

const TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  title:    { label: '爆款标题', color: 'bg-purple-500/15 text-purple-300', icon: '💡' },
  article:  { label: '定向生成', color: 'bg-blue-500/15 text-blue-300',   icon: '✍️' },
  rewrite:  { label: '二次仿写', color: 'bg-teal-500/15 text-teal-300',   icon: '🔄' },
  platform: { label: '多平台推文', color: 'bg-indigo-500/15 text-indigo-300', icon: '🌐' },
  deai:     { label: '去AI味', color: 'bg-brand-500/15 text-brand-300',   icon: '🧬' },
  style:    { label: '风格分析', color: 'bg-pink-500/15 text-pink-300',   icon: '🎨' },
}

const SEND_TO: Record<string, string> = {
  article:  '/deai', rewrite: '/deai', deai: '/detect', title: '/generate',
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const [items,    setItems]    = useState<Creation[]>([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(1)
  const [loading,  setLoading]  = useState(true)
  const [keyword,  setKeyword]  = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [selected, setSelected] = useState<Creation | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const PAGE_SIZE = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await creationApi.list({ page, page_size: PAGE_SIZE, type: typeFilter, keyword: keyword || undefined })
      setItems(res.data.data.items)
      setTotal(res.data.data.total)
    } finally { setLoading(false) }
  }, [page, typeFilter, keyword])

  useEffect(() => { load() }, [load])

  async function deleteItem(id: number) {
    if (!confirm('确认删除此记录？')) return
    await creationApi.delete(id)
    setItems(i => i.filter(x => x.id !== id))
    setTotal(t => t - 1)
    if (selected?.id === id) setSelected(null)
    toast.success('已删除')
  }

  function sendTo(item: Creation) {
    const path = SEND_TO[item.type]
    if (!path) return void toast('暂不支持跳转到此类型', { icon: 'ℹ️' })
    // 通过 state 把内容传给目标页面
    navigate(path, { state: { content: item.content } })
    toast.success('已跳转，内容已填入')
  }

  async function copyContent(item: Creation) {
    const text = typeof item.content === 'string' && item.content.startsWith('[')
      ? JSON.parse(item.content).map((t: {text: string}, i: number) => `${i+1}. ${t.text}`).join('\n')
      : item.content
    await navigator.clipboard.writeText(text)
    setCopiedId(item.id)
    toast.success('已复制')
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <History size={20} className="text-slate-400" />
          <h1 className="section-title mb-0">创作历史</h1>
        </div>
        <p className="section-desc">所有生成内容自动归档，随时回看、复制、一键继续处理</p>
      </div>

      {/* 筛选栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input value={keyword} onChange={e => setKeyword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (setPage(1), load())}
            placeholder="搜索标题或内容..."
            className="input-base pl-9" />
        </div>
        <div className="flex gap-1.5">
          {['all', ...Object.keys(TYPE_CONFIG)].map(t => (
            <button key={t} onClick={() => { setTypeFilter(t); setPage(1) }}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                typeFilter === t ? 'bg-dark-500 text-slate-100' : 'text-slate-500 hover:text-slate-300 hover:bg-dark-400'
              )}>
              {t === 'all' ? '全部' : (TYPE_CONFIG[t]?.icon + ' ' + TYPE_CONFIG[t]?.label)}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500 ml-auto">共 {total} 条记录</span>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* 列表 */}
        <div className="col-span-2 space-y-1">
          {loading ? (
            <div className="py-16 text-center"><Loader2 size={20} className="animate-spin text-slate-500 mx-auto" /></div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <History size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">暂无创作记录</p>
            </div>
          ) : (
            items.map(item => (
              <div key={item.id}
                onClick={() => setSelected(item)}
                className={cn('card p-3.5 cursor-pointer transition-all hover:border-dark-600 group',
                  selected?.id === item.id && 'border-brand-500/50 bg-dark-300'
                )}>
                <div className="flex items-start gap-2">
                  <span className={cn('badge text-[10px] shrink-0 mt-0.5', TYPE_CONFIG[item.type]?.color || 'bg-dark-400 text-slate-400')}>
                    {TYPE_CONFIG[item.type]?.icon} {TYPE_CONFIG[item.type]?.label || item.type}
                  </span>
                  {item.ai_score !== null && (
                    <span className={cn('badge text-[10px] shrink-0 mt-0.5',
                      item.ai_score >= 80 ? 'bg-brand-500/15 text-brand-400' : 'bg-amber-500/15 text-amber-400'
                    )}>{item.ai_score}分</span>
                  )}
                  <button onClick={e => { e.stopPropagation(); deleteItem(item.id) }}
                    className="ml-auto opacity-0 group-hover:opacity-100 p-0.5 text-slate-600 hover:text-red-400 transition-all">
                    <Trash2 size={12} />
                  </button>
                </div>
                <div className="text-sm font-medium text-slate-200 mt-1.5 truncate">{item.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {new Date(item.created_at).toLocaleString('zh-CN', { month:'short',day:'numeric',hour:'2-digit',minute:'2-digit' })}
                </div>
              </div>
            ))
          )}
          {/* 分页 */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="btn-ghost text-xs">上一页</button>
              <span className="text-xs text-slate-400">{page} / {Math.ceil(total/PAGE_SIZE)}</span>
              <button onClick={() => setPage(p => p+1)} disabled={page >= Math.ceil(total/PAGE_SIZE)} className="btn-ghost text-xs">下一页</button>
            </div>
          )}
        </div>

        {/* 详情 */}
        <div className="col-span-3">
          {selected ? (
            <div className="card overflow-hidden flex flex-col h-full animate-fade-in">
              <div className="flex items-center justify-between px-4 py-3 border-b border-dark-500 shrink-0">
                <div className="flex items-center gap-2">
                  <span className={cn('badge text-xs', TYPE_CONFIG[selected.type]?.color || 'bg-dark-400 text-slate-400')}>
                    {TYPE_CONFIG[selected.type]?.label || selected.type}
                  </span>
                  {(() => { try { return JSON.parse(selected.meta || '{}').isDraft } catch { return false } })() && (
                    <span className="badge text-xs bg-amber-500/15 text-amber-400">草稿</span>
                  )}
                  <span className="text-sm font-medium text-slate-200 truncate max-w-xs">{selected.title}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => copyContent(selected)}
                    className="btn-ghost text-xs py-1.5 px-2.5 flex items-center gap-1">
                    {copiedId === selected.id ? <><Check size={11} />已复制</> : <><Copy size={11} />复制</>}
                  </button>
                  {SEND_TO[selected.type] && (
                    <button onClick={() => sendTo(selected)} className="btn-secondary text-xs py-1.5 px-3">
                      继续处理 <ChevronRight size={12} />
                    </button>
                  )}
                  <button onClick={() => setSelected(null)} className="btn-ghost p-1.5">
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                <div className="article-content text-sm leading-relaxed">
                  {typeof selected.content === 'string' && selected.content.startsWith('[')
                    ? JSON.parse(selected.content).map((t: {text:string}, i: number) => (
                        <div key={i} className="py-2 border-b border-dark-500 last:border-0">
                          {i+1}. {t.text}
                        </div>
                      ))
                    : renderContentWithImages(selected.content)
                  }
                </div>
              </div>
            </div>
          ) : (
            <div className="card h-64 flex items-center justify-center text-center text-slate-500">
              <div>
                <History size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">点击左侧记录查看详情</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
