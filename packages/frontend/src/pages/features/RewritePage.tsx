import { useState, useRef } from 'react'
import { RefreshCw, Loader2, Copy, ArrowLeftRight } from 'lucide-react'
import { readStream } from '../../utils/stream'
import { useAuthStore } from '../../store/auth'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

type Intensity = 'light' | 'medium' | 'heavy'
const INTENSITY_OPTIONS: Array<{ id: Intensity; label: string; desc: string }> = [
  { id: 'light',  label: '轻度',  desc: '保留 70% 原意，小幅改写' },
  { id: 'medium', label: '中度',  desc: '保留 50% 原意，明显改写' },
  { id: 'heavy',  label: '深度',  desc: '仅保留主题，全面重写' },
]

export default function RewritePage() {
  const token = useAuthStore(s => s.token)
  const [original,  setOriginal]  = useState('')
  const [output,    setOutput]    = useState('')
  const [intensity, setIntensity] = useState<Intensity>('medium')
  const [streaming, setStreaming] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)

  async function rewrite() {
    if (!original.trim()) return void toast.error('请输入原文')
    if (original.trim().length < 50) return void toast.error('原文至少 50 字')
    setOutput(''); setStreaming(true)
    try {
      await readStream('/api/ai/rewrite', { original: original.trim(), intensity }, chunk => {
        setOutput(p => p + chunk)
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
      }, token || undefined)
      toast.success('仿写完成，已保存到创作历史')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '仿写失败')
    } finally { setStreaming(false) }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    toast.success('已复制')
  }

  const wordCountOrig = original.trim().length
  const wordCountOut  = output.trim().length

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <RefreshCw size={20} className="text-teal-400" />
          <h1 className="section-title mb-0">二次仿写</h1>
        </div>
        <p className="section-desc">把任意原文洗成语义等价、文字焕然一新的新稿，降重更顺、可读性更高</p>
      </div>

      {/* 改写强度 */}
      <div className="flex gap-3">
        {INTENSITY_OPTIONS.map(o => (
          <button key={o.id} onClick={() => setIntensity(o.id)}
            className={cn('flex-1 p-3 rounded-xl text-left border transition-all',
              intensity === o.id
                ? 'bg-teal-500/10 border-teal-500/40 text-teal-300'
                : 'bg-dark-300 border-dark-500 text-slate-400 hover:border-dark-600'
            )}>
            <div className="font-semibold text-sm">{o.label}改写</div>
            <div className="text-xs mt-0.5 opacity-70">{o.desc}</div>
          </button>
        ))}
      </div>

      {/* 双栏对比 */}
      <div className="grid grid-cols-2 gap-4">
        {/* 原文 */}
        <div className="card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-500 shrink-0">
            <span className="text-sm font-medium text-slate-300">原文</span>
            <span className="text-xs text-slate-500">{wordCountOrig} 字</span>
          </div>
          <textarea
            value={original}
            onChange={e => setOriginal(e.target.value)}
            placeholder="粘贴需要仿写的原文..."
            className="flex-1 bg-transparent border-none outline-none resize-none p-4 text-sm text-slate-200 placeholder-slate-600 min-h-80"
          />
          <div className="border-t border-dark-500 px-4 py-2.5 flex justify-end shrink-0">
            <button onClick={rewrite} disabled={streaming || !original.trim()}
              className="btn-primary text-sm py-2 px-4">
              {streaming ? <><Loader2 size={14} className="animate-spin" />仿写中...</> : <><ArrowLeftRight size={14} />开始仿写</>}
            </button>
          </div>
        </div>

        {/* 仿写结果 */}
        <div className="card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-500 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-300">仿写结果</span>
              {streaming && <span className="badge bg-teal-500/15 text-teal-400 text-[10px]">生成中...</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{wordCountOut} 字</span>
              {output && <button onClick={() => copy(output)} className="btn-ghost text-xs p-1"><Copy size={12} /></button>}
            </div>
          </div>
          <div ref={outputRef} className="flex-1 overflow-y-auto p-4 min-h-80">
            {output ? (
              <div className={cn('article-content text-sm', streaming && 'typing-cursor')}>{output}</div>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 text-sm">
                仿写结果将显示在这里
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
