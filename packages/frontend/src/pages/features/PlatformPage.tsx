import { useState, useRef } from 'react'
import { Globe, Loader2, Copy, Check, Edit3, ChevronDown, ChevronUp } from 'lucide-react'
import { aiApi } from '../../api'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

// ── 平台配置 ──────────────────────────────────────────────────
const PLATFORMS = [
  { id: 'weixin',      label: '公众号',   icon: '💬', color: '#07C160', desc: '1000-3000字，深度阅读', limit: 50000 },
  { id: 'xiaohongshu', label: '小红书',   icon: '📕', color: '#FF2442', desc: '300-500字，emoji风格',   limit: 1000  },
  { id: 'weibo',       label: '微博',     icon: '🔴', color: '#E6162D', desc: '140字内，热点话题',     limit: 140   },
  { id: 'zhihu',       label: '知乎',     icon: '🔵', color: '#0066FF', desc: '专业深度，有逻辑',      limit: 10000 },
  { id: 'douyin',      label: '抖音口播', icon: '⚫', color: '#161823', desc: '口语化，节奏感强',      limit: 500   },
  { id: 'pyq',         label: '朋友圈',   icon: '🌸', color: '#07C160', desc: '50-150字，情感共鸣',   limit: 150   },
  { id: 'shipinhao',   label: '视频号',   icon: '📹', color: '#07C160', desc: '100字内，标题党',       limit: 100   },
]

// ── 字数状态颜色 ───────────────────────────────────────────────
function getCharColor(len: number, limit: number) {
  const ratio = len / limit
  if (ratio < 0.8) return 'text-slate-500'
  if (ratio < 1.0) return 'text-amber-400'
  return 'text-red-400'
}

// ── 平台结果卡片 ───────────────────────────────────────────────
function PlatformCard({
  platform,
  content,
  onEdit,
}: {
  platform: typeof PLATFORMS[0]
  content: string
  onEdit: (text: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(content)
  const [copied,  setCopied]  = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const charLen = (editing ? draft : content).length
  const overLimit = platform.limit < 50000 && charLen > platform.limit

  function startEdit() {
    setDraft(content)
    setEditing(true)
    setTimeout(() => textareaRef.current?.focus(), 50)
  }

  function saveEdit() {
    onEdit(draft)
    setEditing(false)
  }

  async function copy() {
    await navigator.clipboard.writeText(editing ? draft : content)
    setCopied(true)
    toast.success('已复制')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn(
      'card overflow-hidden transition-all',
      editing ? 'ring-1 ring-brand-500/40' : ''
    )}>
      {/* 卡片头部 */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-dark-500">
        <span className="text-base">{platform.icon}</span>
        <span className="text-sm font-medium text-slate-200">{platform.label}</span>

        {/* 字数显示 */}
        <span className={cn('text-xs tabular-nums ml-1', getCharColor(charLen, platform.limit))}>
          {charLen}
          {platform.limit < 50000 && <span className="text-slate-600">/{platform.limit}</span>}
          {overLimit && <span className="ml-1 text-red-400">超限！</span>}
        </span>

        <div className="flex items-center gap-1 ml-auto">
          {!editing ? (
            <button onClick={startEdit}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-slate-400 hover:text-slate-200 hover:bg-dark-400 transition-all">
              <Edit3 size={11} />编辑
            </button>
          ) : (
            <button onClick={saveEdit}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-emerald-400 hover:bg-emerald-500/10 transition-all">
              <Check size={11} />保存
            </button>
          )}
          <button onClick={copy}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all',
              copied
                ? 'text-emerald-400 bg-emerald-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-dark-400'
            )}>
            {copied ? <><Check size={11} />已复制</> : <><Copy size={11} />复制</>}
          </button>
        </div>
      </div>

      {/* 内容区 */}
      {editing ? (
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          className="w-full p-4 bg-dark-400/30 text-sm text-slate-200 leading-relaxed resize-none focus:outline-none min-h-[120px]"
          rows={6}
        />
      ) : (
        <div className="p-4 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap max-h-52 overflow-y-auto">
          {content}
        </div>
      )}

      {/* 超限提示 */}
      {overLimit && !editing && (
        <div className="px-4 py-2 bg-red-500/10 border-t border-red-500/20 text-xs text-red-400">
          ⚠️ 超出 {platform.label} 字数限制 {platform.limit} 字，建议点击「编辑」缩短
        </div>
      )}
    </div>
  )
}

// ── 主页面 ─────────────────────────────────────────────────────
export default function PlatformPage() {
  const [source,   setSource]   = useState('')
  const [selected, setSelected] = useState<string[]>(['weixin', 'xiaohongshu', 'weibo', 'zhihu'])
  const [results,  setResults]  = useState<Record<string, string>>({})
  const [loading,  setLoading]  = useState(false)
  const [showInput, setShowInput] = useState(true)

  function togglePlatform(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  async function generate() {
    if (!source.trim()) return void toast.error('请输入原始内容或粘贴公众号链接')
    if (!selected.length) return void toast.error('请选择至少一个平台')
    setLoading(true)
    setResults({})
    try {
      const res = await aiApi.generatePlatforms({ content: source.trim(), platforms: selected as never[] })
      const newResults = res.data.data.results
      setResults(newResults)
      const count = Object.keys(newResults).length
      toast.success(`已生成 ${count} 个平台版本`)
      if (count > 0) setShowInput(false)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (err instanceof Error ? err.message : '生成失败，请重试')
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  function updateResult(id: string, text: string) {
    setResults(r => ({ ...r, [id]: text }))
  }

  const hasResults = Object.keys(results).length > 0

  return (
    <div className="space-y-5 animate-fade-in">
      {/* 页面头部 */}
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <Globe size={20} className="text-indigo-400" />
          <h1 className="section-title mb-0">多平台推文</h1>
        </div>
        <p className="section-desc">一份内容改写为 7 个平台专属文案，各自适配字数、格式与调性</p>
      </div>

      {/* 输入区（可折叠） */}
      <div className="card overflow-hidden">
        <button
          onClick={() => setShowInput(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-dark-400/30 transition-colors"
        >
          <span className="text-sm font-medium text-slate-300">
            {source.startsWith('http') ? `🔗 链接：${source.slice(0, 40)}...` : source ? `📝 ${source.slice(0, 40)}...` : '📝 输入原始内容'}
          </span>
          {showInput ? <ChevronUp size={15} className="text-slate-500" /> : <ChevronDown size={15} className="text-slate-500" />}
        </button>

        {showInput && (
          <div className="px-5 pb-5 space-y-4 border-t border-dark-500">
            <div className="pt-4">
              <textarea
                value={source}
                onChange={e => setSource(e.target.value)}
                rows={5}
                placeholder="粘贴公众号链接自动抓取，或直接粘贴文章正文..."
                className="textarea-base"
              />
              {source.startsWith('http') && (
                <p className="text-xs text-brand-400 mt-1.5">🔗 检测到链接，点击生成后将自动抓取正文</p>
              )}
            </div>

            {/* 平台选择 */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-medium text-slate-300">目标平台</span>
                <span className="badge bg-dark-400 text-slate-500 text-[10px]">{selected.length}/{PLATFORMS.length}</span>
                <button onClick={() => setSelected(PLATFORMS.map(p => p.id))} className="btn-ghost text-xs ml-auto">全选</button>
                <button onClick={() => setSelected([])} className="btn-ghost text-xs">清空</button>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {PLATFORMS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={cn(
                      'p-3 rounded-xl border text-left transition-all',
                      selected.includes(p.id)
                        ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                        : 'bg-dark-300 border-dark-500 text-slate-400 hover:border-dark-400'
                    )}
                  >
                    <div className="text-base mb-1">{p.icon}</div>
                    <div className="font-medium text-xs">{p.label}</div>
                    <div className="text-[10px] opacity-60 mt-0.5">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={generate}
              disabled={loading || !source.trim() || !selected.length}
              className="btn-primary w-full justify-center"
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" />生成中（30-60秒）...</>
                : <><Globe size={15} />一键生成所有平台文案</>
              }
            </button>
          </div>
        )}
      </div>

      {/* 结果区 */}
      {hasResults ? (
        <div className="space-y-3 animate-slide-up">
          {/* 操作栏 */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">
              已生成 <span className="text-slate-200 font-medium">{Object.keys(results).length}</span> 个平台版本
            </span>
            <button
              onClick={() => { setResults({}); setShowInput(true) }}
              className="btn-ghost text-xs"
            >
              重新生成
            </button>
          </div>

          {/* 卡片网格 */}
          <div className="grid grid-cols-2 gap-4">
            {PLATFORMS.filter(p => results[p.id]).map(p => (
              <PlatformCard
                key={p.id}
                platform={p}
                content={results[p.id]}
                onEdit={text => updateResult(p.id, text)}
              />
            ))}
          </div>
        </div>
      ) : !loading && (
        /* 空状态 */
        <div className="card p-12 flex flex-col items-center justify-center text-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center">
            <Globe size={28} className="text-indigo-400" />
          </div>
          <div>
            <h3 className="text-slate-300 font-medium mb-1">一键适配 7 个平台</h3>
            <p className="text-sm text-slate-500 max-w-xs">
              输入文章后一键生成，每个平台自动适配字数、格式和调性，支持点击编辑
            </p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-1">
            {PLATFORMS.map(p => (
              <span key={p.id} className="text-xs text-slate-500 bg-dark-400 px-2 py-1 rounded-full">
                {p.icon} {p.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
