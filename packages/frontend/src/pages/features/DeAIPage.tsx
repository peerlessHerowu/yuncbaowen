import { useState } from 'react'
import { Wand2, Loader2, Copy, ChevronDown, ChevronUp, CheckCircle, XCircle } from 'lucide-react'
import { aiApi } from '../../api'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'
import type { DeAIResult } from '@yuncbaowen/shared'

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? 'text-brand-400' : score >= 60 ? 'text-amber-400' : 'text-red-400'
  return (
    <div className={cn('text-4xl font-black tabular-nums', color)}>
      {score}<span className="text-lg font-medium">分</span>
    </div>
  )
}

export default function DeAIPage() {
  const [content,  setContent]  = useState('')
  const [maxRounds,setMaxRounds]= useState(3)
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState<DeAIResult | null>(null)
  const [expanded, setExpanded] = useState<number[]>([])

  async function run() {
    if (!content.trim()) return void toast.error('请输入需要处理的文章')
    if (content.trim().length < 100) return void toast.error('文章至少 100 字')
    setLoading(true); setResult(null)
    try {
      const res = await aiApi.deai({ content: content.trim(), max_rounds: maxRounds })
      setResult(res.data.data)
      if (res.data.data.final_score >= 80) {
        toast.success(`✅ 去AI味完成！最终评分 ${res.data.data.final_score} 分`)
      } else {
        toast(`⚠️ 最终评分 ${res.data.data.final_score} 分，可手动继续优化`, { icon: '⚠️' })
      }
    } catch {} finally { setLoading(false) }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text)
    toast.success('已复制')
  }

  function toggleExpand(idx: number) {
    setExpanded(e => e.includes(idx) ? e.filter(x => x !== idx) : [...e, idx])
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <Wand2 size={20} className="text-brand-400" />
          <h1 className="section-title mb-0">去 AI 味</h1>
        </div>
        <p className="section-desc">内置 AI 痕迹评分，改写后自动重检，未达标自动再改（最多 {maxRounds} 轮）</p>
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* 左：输入 */}
        <div className="col-span-2 space-y-4">
          <div className="card p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">待处理文章</label>
              <textarea value={content} onChange={e => setContent(e.target.value)} rows={12}
                placeholder="粘贴 AI 生成的文章，系统将自动检测并改写..."
                className="textarea-base" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">最大改写轮次</label>
              <div className="flex gap-2">
                {[1,2,3].map(n => (
                  <button key={n} onClick={() => setMaxRounds(n)}
                    className={cn('flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                      maxRounds === n ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30' : 'bg-dark-400 text-slate-400 hover:text-slate-200'
                    )}>
                    {n} 轮
                  </button>
                ))}
              </div>
            </div>
            <button onClick={run} disabled={loading || !content.trim()}
              className="btn-primary w-full justify-center">
              {loading ? <><Loader2 size={15} className="animate-spin" />处理中（可能需要 1-3 分钟）...</> : <><Wand2 size={15} />开始去 AI 味</>}
            </button>
          </div>
        </div>

        {/* 右：结果 */}
        <div className="col-span-3 space-y-4">
          {result ? (
            <>
              {/* 最终评分 */}
              <div className="card p-5 flex items-center gap-6">
                <div className="text-center">
                  <ScoreRing score={result.final_score} />
                  <div className="text-xs text-slate-400 mt-1">最终评分</div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {result.final_score >= 80
                      ? <><CheckCircle size={16} className="text-brand-400" /><span className="text-brand-400 font-semibold">去AI味成功</span></>
                      : <><XCircle size={16} className="text-amber-400" /><span className="text-amber-400 font-semibold">建议手动优化</span></>
                    }
                    <span className="badge bg-dark-400 text-slate-400 ml-auto">共 {result.rounds.length} 轮改写</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {result.rounds.map((r, i) => (
                      <div key={i} className="flex-1 bg-dark-300 rounded-lg p-2 text-center">
                        <div className="text-xs text-slate-500">第 {r.round} 轮</div>
                        <div className={cn('text-base font-bold', r.passed ? 'text-brand-400' : 'text-amber-400')}>
                          {r.score}
                        </div>
                        <div className="text-[10px] text-slate-600">{r.passed ? '达标' : '未达标'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* 各轮内容对比 */}
              <div className="space-y-2">
                {result.rounds.map((r, idx) => (
                  <div key={idx} className="card overflow-hidden">
                    <button onClick={() => toggleExpand(idx)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-dark-300/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-300">第 {r.round} 轮改写</span>
                        <span className={cn('badge', r.score >= 80 ? 'bg-brand-500/15 text-brand-400' : 'bg-amber-500/15 text-amber-400')}>
                          {r.score} 分
                        </span>
                        {r.passed && <span className="badge bg-brand-500/10 text-brand-400 text-[10px]">✓ 达标</span>}
                      </div>
                      {expanded.includes(idx) ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                    </button>
                    {expanded.includes(idx) && (
                      <div className="px-4 pb-4 border-t border-dark-500">
                        <div className="article-content text-sm mt-3 max-h-48 overflow-y-auto">{r.content}</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* 最终结果 */}
              <div className="card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-dark-500">
                  <span className="text-sm font-semibold text-slate-200">✨ 最终版本</span>
                  <div className="flex gap-2">
                    <button onClick={() => copy(result.final_content)} className="btn-ghost text-xs"><Copy size={12} />复制</button>
                    <a href="/layout" className="btn-secondary text-xs py-1.5 px-3">📱 排版</a>
                  </div>
                </div>
                <div className="p-5 article-content max-h-64 overflow-y-auto">{result.final_content}</div>
              </div>
            </>
          ) : (
            <div className="card h-64 flex items-center justify-center text-center text-slate-500">
              <div>
                <Wand2 size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">输入文章后点击「开始去 AI 味」</p>
                <p className="text-xs mt-1 opacity-60">系统将自动循环检测+改写，最多 {maxRounds} 轮</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
