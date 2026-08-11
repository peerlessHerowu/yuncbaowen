import { useState, useRef } from 'react'
import { RefreshCw, Loader2, Copy, Check, ArrowLeftRight, Square } from 'lucide-react'
import { readStream } from '../../utils/stream'
import { useAuthStore } from '../../store/auth'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

type Intensity = 'light' | 'medium' | 'heavy'
type Intent = 'dedup' | 'platform' | 'casual' | 'fun'

const INTENSITY_OPTIONS: Array<{ id: Intensity; label: string; pct: string; desc: string }> = [
  { id: 'light',  label: '轻度', pct: '保留80%', desc: '换词换句，保持原结构' },
  { id: 'medium', label: '中度', pct: '保留60%', desc: '调整结构和表达' },
  { id: 'heavy',  label: '深度', pct: '仅主题',   desc: '完全重构，换个新稿' },
]

const INTENT_OPTIONS: Array<{ id: Intent; label: string; icon: string; desc: string }> = [
  { id: 'dedup',    label: '降重避重',   icon: '🔄', desc: '让查重率大幅下降，文字焕然一新' },
  { id: 'platform', label: '换平台风格', icon: '📱', desc: '转成小红书风格（分段短+emoji）' },
  { id: 'casual',   label: '口语化',     icon: '💬', desc: '书面语改成自然对话感' },
  { id: 'fun',      label: '增加趣味',   icon: '✨', desc: '加入幽默感和人格魅力' },
]

export default function RewritePage() {
  const token     = useAuthStore(s => s.token)
  const [original,  setOriginal]  = useState('')
  const [output,    setOutput]    = useState('')
  const [intensity, setIntensity] = useState<Intensity>('medium')
  const [intent,    setIntent]    = useState<Intent | null>(null)
  const [keywords,  setKeywords]  = useState('')
  const [streaming, setStreaming] = useState(false)
  const [copied,    setCopied]    = useState(false)
  const abortRef = useRef<AbortController>()
  const outputRef = useRef<HTMLDivElement>(null)

  async function rewrite() {
    if (!original.trim()) return void toast.error('请输入原文或粘贴公众号链接')
    if (original.trim().length < 30) return void toast.error('原文至少 30 字')
    setOutput(''); setStreaming(true)
    abortRef.current = new AbortController()
    try {
      await readStream('/api/ai/rewrite', {
        original: original.trim(),
        intensity,
        intent: intent || undefined,
        keywords: keywords.trim() || undefined,
      }, chunk => {
        setOutput(p => p + chunk)
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
      }, token || undefined)
      toast.success('仿写完成，已保存到创作历史')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error(err instanceof Error ? err.message : '仿写失败')
      }
    } finally { setStreaming(false) }
  }

  function stop() {
    abortRef.current?.abort()
    setStreaming(false)
    toast('已停止生成', { icon: '⏹️' })
  }

  async function copy() {
    await navigator.clipboard.writeText(output)
    setCopied(true); toast.success('已复制')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <RefreshCw size={20} className="text-teal-400" />
          <h1 className="section-title mb-0">二次仿写</h1>
        </div>
        <p className="section-desc">语义等价、文字焕然一新，支持降重、换平台风格、口语化等多种改写意图</p>
      </div>

      {/* 改写意图（新增） */}
      <div className="card p-4">
        <p className="text-xs text-slate-400 mb-3">改写目标（可选，不选则通用改写）</p>
        <div className="grid grid-cols-4 gap-2">
          {INTENT_OPTIONS.map(o => (
            <button key={o.id} onClick={() => setIntent(intent === o.id ? null : o.id)}
              className={cn(
                'p-3 rounded-xl text-left border transition-all',
                intent === o.id
                  ? 'bg-teal-500/10 border-teal-500/30 text-teal-300'
                  : 'bg-dark-300 border-dark-500 text-slate-400 hover:border-dark-400'
              )}>
              <div className="text-base mb-1">{o.icon}</div>
              <div className="text-xs font-medium">{o.label}</div>
              <div className="text-[10px] opacity-60 mt-0.5 line-clamp-2">{o.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 改写强度 */}
      <div className="flex gap-3">
        {INTENSITY_OPTIONS.map(o => (
          <button key={o.id} onClick={() => setIntensity(o.id)}
            className={cn('flex-1 p-3 rounded-xl text-left border transition-all',
              intensity === o.id
                ? 'bg-teal-500/10 border-teal-500/40 text-teal-300'
                : 'bg-dark-300 border-dark-500 text-slate-400 hover:border-dark-400'
            )}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="font-semibold text-sm">{o.label}改写</span>
              <span className="text-[10px] opacity-60">{o.pct}</span>
            </div>
            <div className="text-xs opacity-70">{o.desc}</div>
          </button>
        ))}
      </div>

      {/* 双栏编辑区 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 原文 */}
        <div className="card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-500 shrink-0">
            <span className="text-sm font-medium text-slate-300">原文</span>
            <span className="text-xs text-slate-500">{original.trim().length} 字</span>
          </div>
          <textarea
            value={original}
            onChange={e => setOriginal(e.target.value)}
            placeholder="粘贴需要仿写的原文，或直接粘贴公众号链接自动抓取..."
            className="flex-1 bg-transparent border-none outline-none resize-none p-4 text-sm text-slate-200 placeholder-slate-600 min-h-72"
          />
          {original.startsWith('http') && (
            <div className="px-4 py-2 border-t border-dark-500 text-xs text-brand-400">
              🔗 检测到链接，将自动抓取正文
            </div>
          )}

          {/* 保留关键词（折叠）*/}
          <div className="border-t border-dark-500 px-4 py-2.5">
            <input
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="必须保留的关键词（可选，用逗号分隔）"
              className="w-full bg-transparent text-xs text-slate-400 placeholder-slate-600 outline-none"
            />
          </div>

          <div className="border-t border-dark-500 px-4 py-2.5 flex justify-end shrink-0 gap-2">
            {streaming ? (
              <button onClick={stop}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/15 text-red-400 text-sm hover:bg-red-500/25 transition-all">
                <Square size={13} />停止
              </button>
            ) : (
              <button onClick={rewrite} disabled={!original.trim()}
                className="btn-primary text-sm py-2 px-4">
                <ArrowLeftRight size={14} />开始仿写
              </button>
            )}
          </div>
        </div>

        {/* 仿写结果 */}
        <div className="card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-500 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-300">仿写结果</span>
              {streaming && (
                <span className="flex items-center gap-1 text-[10px] text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full">
                  <Loader2 size={9} className="animate-spin" />生成中
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{output.trim().length} 字</span>
              {output && (
                <button onClick={copy}
                  className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all',
                    copied ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 hover:text-slate-200 hover:bg-dark-400'
                  )}>
                  {copied ? <><Check size={11} />已复制</> : <><Copy size={11} />复制</>}
                </button>
              )}
            </div>
          </div>

          <div ref={outputRef} className="flex-1 overflow-y-auto p-4 min-h-72">
            {output ? (
              <div className={cn('article-content text-sm leading-relaxed', streaming && 'after:content-["|"] after:animate-pulse after:text-brand-400')}>
                {output}
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center gap-3 flex-col text-slate-600">
                <ArrowLeftRight size={28} className="opacity-30" />
                <p className="text-sm">仿写结果将显示在这里</p>
              </div>
            )}
          </div>

          {output && !streaming && (
            <div className="border-t border-dark-500 px-4 py-2.5 flex gap-2 shrink-0">
              <a href="/deai" className="btn-secondary text-xs py-1.5 px-3">🧬 去AI味</a>
              <a href="/detect" className="btn-secondary text-xs py-1.5 px-3">🔍 检测</a>
              <a href="/layout" className="btn-secondary text-xs py-1.5 px-3">📱 排版</a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
