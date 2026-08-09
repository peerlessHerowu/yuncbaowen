import { useState } from 'react'
import { ScanText, Loader2, AlertCircle, CheckCircle } from 'lucide-react'
import { aiApi } from '../../api'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'
import type { DetectResult } from '@yuncbaowen/shared'

interface DimConfig { key: keyof DetectResult['dimensions']; label: string; icon: string; color: string }
const DIMS: DimConfig[] = [
  { key: 'ai_taste',        label: 'AI 痕迹',  icon: '🧬', color: 'purple' },
  { key: 'forbidden_words', label: '违禁词',   icon: '🚫', color: 'red'    },
  { key: 'originality',     label: '原创度',   icon: '✨', color: 'blue'   },
  { key: 'readability',     label: '可读性',   icon: '📖', color: 'green'  },
]
const COLOR_MAP: Record<string, string> = {
  purple: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  red:    'bg-red-500/20 text-red-300 border-red-500/30',
  blue:   'bg-blue-500/20 text-blue-300 border-blue-500/30',
  green:  'bg-brand-500/20 text-brand-300 border-brand-500/30',
}

function ScoreBar({ score, color }: { score: number; color: string }) {
  const barColor = score >= 80 ? 'bg-brand-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-dark-500 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-1000', barColor)} style={{ width: `${score}%` }} />
      </div>
      <span className={cn('text-sm font-bold w-10 text-right tabular-nums',
        score >= 80 ? 'text-brand-400' : score >= 60 ? 'text-amber-400' : 'text-red-400'
      )}>{score}</span>
    </div>
  )
}

export default function DetectPage() {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState<DetectResult | null>(null)
  const [activeKey, setActiveKey] = useState<keyof DetectResult['dimensions'] | null>(null)

  async function detect() {
    if (!content.trim()) return void toast.error('请输入待检测文章')
    if (content.trim().length < 50) return void toast.error('文章至少 50 字')
    setLoading(true); setResult(null)
    try {
      const res = await aiApi.detect({ content: content.trim() })
      setResult(res.data.data)
      setActiveKey('ai_taste')
      toast.success(`检测完成，综合评分 ${res.data.data.overall_score} 分`)
    } catch {} finally { setLoading(false) }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <ScanText size={20} className="text-cyan-400" />
          <h1 className="section-title mb-0">内容检测</h1>
        </div>
        <p className="section-desc">AI味 / 违禁词 / 原创度 / 可读性四维报告，每处扣分点精确定位</p>
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* 左：输入 */}
        <div className="col-span-2 space-y-4">
          <div className="card p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">待检测文章</label>
              <textarea value={content} onChange={e => setContent(e.target.value)} rows={14}
                placeholder="粘贴需要检测的文章内容..."
                className="textarea-base" />
              <div className="text-right text-xs text-slate-500 mt-1">{content.length} 字</div>
            </div>
            <button onClick={detect} disabled={loading || !content.trim()} className="btn-primary w-full justify-center">
              {loading ? <><Loader2 size={15} className="animate-spin" />检测中...</> : <><ScanText size={15} />开始四维检测</>}
            </button>
          </div>
        </div>

        {/* 右：结果 */}
        <div className="col-span-3 space-y-4">
          {result ? (
            <>
              {/* 综合评分 */}
              <div className="card p-5">
                <div className="flex items-center gap-4 mb-4">
                  <div className="text-center">
                    <div className={cn('text-4xl font-black tabular-nums',
                      result.overall_score >= 80 ? 'text-brand-400' : result.overall_score >= 60 ? 'text-amber-400' : 'text-red-400'
                    )}>
                      {result.overall_score}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">综合评分</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-3">
                      {result.passed
                        ? <><CheckCircle size={16} className="text-brand-400" /><span className="text-brand-300 font-semibold">通过检测</span></>
                        : <><AlertCircle size={16} className="text-amber-400" /><span className="text-amber-300 font-semibold">需要优化</span></>
                      }
                      <span className="badge bg-dark-400 text-slate-400 ml-auto">{result.provider}</span>
                    </div>
                    {/* 四维评分 */}
                    <div className="space-y-2">
                      {DIMS.map(d => (
                        <div key={d.key} className="flex items-center gap-3">
                          <button onClick={() => setActiveKey(d.key === activeKey ? null : d.key)}
                            className={cn('badge border text-xs shrink-0 w-20 justify-center', COLOR_MAP[d.color])}>
                            {d.icon} {d.label}
                          </button>
                          <ScoreBar score={result.dimensions[d.key].score} color={d.color} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* 问题详情 */}
              {activeKey && result.dimensions[activeKey].issues.length > 0 && (
                <div className="card overflow-hidden animate-slide-up">
                  <div className="px-4 py-3 border-b border-dark-500 flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-300">
                      {DIMS.find(d => d.key === activeKey)?.icon} {DIMS.find(d => d.key === activeKey)?.label} — 扣分详情
                    </span>
                    <span className="badge bg-dark-400 text-slate-400">{result.dimensions[activeKey].issues.length} 处</span>
                  </div>
                  <div className="divide-y divide-dark-500 max-h-64 overflow-y-auto">
                    {result.dimensions[activeKey].issues.map((issue, i) => (
                      <div key={i} className="px-4 py-3">
                        <div className="text-sm text-red-300 bg-red-500/10 rounded px-2 py-1 mb-1.5 font-medium">
                          「{issue.text}」
                        </div>
                        <div className="text-xs text-slate-400">{issue.reason}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeKey && result.dimensions[activeKey].issues.length === 0 && (
                <div className="card p-5 text-center text-brand-400">
                  <CheckCircle size={24} className="mx-auto mb-2" />
                  <p className="text-sm font-medium">{DIMS.find(d => d.key === activeKey)?.label} 无问题 ✓</p>
                </div>
              )}

              {/* 操作 */}
              {!result.passed && (
                <div className="flex gap-3">
                  <a href="/deai" className="btn-primary flex-1 justify-center">🧬 去AI味优化</a>
                </div>
              )}
            </>
          ) : (
            <div className="card h-80 flex items-center justify-center text-center text-slate-500">
              <div>
                <ScanText size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">输入文章后点击「开始四维检测」</p>
                <p className="text-xs mt-1 opacity-60">每处扣分都可精确定位到句子</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
