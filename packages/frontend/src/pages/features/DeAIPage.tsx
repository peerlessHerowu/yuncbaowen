import { useState } from 'react'
import { Wand2, Loader2, Copy, Check, ChevronRight, AlertCircle, CheckCircle, ArrowRight } from 'lucide-react'
import { aiApi } from '../../api'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'
import type { DeAIResult } from '@yuncbaowen/shared'

// ── 评分环形图 ─────────────────────────────────────────────────
function ScoreRing({ score, size = 'lg' }: { score: number; size?: 'sm' | 'lg' }) {
  const color = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444'
  const label = score >= 80 ? '优秀' : score >= 60 ? '需优化' : 'AI味重'
  const r = size === 'lg' ? 32 : 20
  const stroke = size === 'lg' ? 5 : 3.5
  const circumference = 2 * Math.PI * r
  const progress = circumference * (1 - score / 100)

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: (r + stroke) * 2, height: (r + stroke) * 2 }}>
        <svg width={(r + stroke) * 2} height={(r + stroke) * 2} className="-rotate-90">
          <circle cx={r + stroke} cy={r + stroke} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke} />
          <circle cx={r + stroke} cy={r + stroke} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={progress}
            style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('font-black tabular-nums', size === 'lg' ? 'text-2xl' : 'text-sm')} style={{ color }}>
            {score}
          </span>
        </div>
      </div>
      <span className="text-[10px] text-slate-400">{label}</span>
    </div>
  )
}

// ── 改写进度步骤 ───────────────────────────────────────────────
function ProgressSteps({ stage }: { stage: 'rule' | 'ai' | 'random' | 'done' }) {
  const steps = [
    { key: 'rule',   label: '规则检测', desc: '本地扫描' },
    { key: 'ai',     label: 'AI改写',   desc: 'Claude处理' },
    { key: 'random', label: '随机优化', desc: '防风控处理' },
  ]
  const order = ['rule', 'ai', 'random', 'done']
  const currentIdx = order.indexOf(stage)

  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => {
        const isDone = currentIdx > i
        const isActive = currentIdx === i
        return (
          <div key={s.key} className="flex items-center gap-1">
            <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all',
              isDone  ? 'bg-emerald-500/15 text-emerald-400' :
              isActive ? 'bg-brand-500/20 text-brand-300 animate-pulse' :
              'bg-dark-400 text-slate-500'
            )}>
              {isDone ? <Check size={10} /> : isActive ? <Loader2 size={10} className="animate-spin" /> : <span className="w-2.5 h-2.5 rounded-full bg-current opacity-40" />}
              {s.label}
            </div>
            {i < steps.length - 1 && <ChevronRight size={12} className="text-slate-600" />}
          </div>
        )
      })}
    </div>
  )
}

// ── 文本差异高亮（简单版：按词对比）─────────────────────────
function DiffHighlight({ original, revised }: { original: string; revised: string }) {
  // 简单实现：把改写后新增的短语用绿色背景标出
  // ponytail: 真正的 diff 需要 diff-match-patch 库，这里用简单的句子级别对比
  const origSentences = new Set(original.match(/[^。！？]+[。！？]/g) || [])
  const lines = (revised.match(/[^。！？]+[。！？]|[^。！？]+$/g) || [revised])

  return (
    <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
      {lines.map((line, i) => (
        <span key={i} className={cn(
          origSentences.has(line) ? '' : 'bg-emerald-500/10 text-emerald-200 rounded px-0.5'
        )}>
          {line}
        </span>
      ))}
    </div>
  )
}

export default function DeAIPage() {
  const [content,    setContent]    = useState('')
  const [maxRounds,  setMaxRounds]  = useState(3)
  const [loading,    setLoading]    = useState(false)
  const [stage,      setStage]      = useState<'rule'|'ai'|'random'|'done'>('rule')
  const [result,     setResult]     = useState<DeAIResult | null>(null)
  const [copied,     setCopied]     = useState(false)
  const [view,       setView]       = useState<'compare'|'final'>('compare')

  async function run() {
    if (!content.trim()) return void toast.error('请输入需要处理的文章')
    if (content.trim().length < 50) return void toast.error('文章至少 50 字')
    setLoading(true); setResult(null); setStage('rule')

    // 模拟阶段进度（实际后端是同步的，这里用延迟模拟视觉反馈）
    const timer1 = setTimeout(() => setStage('ai'), 800)
    const timer2 = setTimeout(() => setStage('random'), 3000)

    try {
      const res = await aiApi.deai({ content: content.trim(), max_rounds: maxRounds })
      clearTimeout(timer1); clearTimeout(timer2)
      setStage('done')
      setResult(res.data.data)
      const score = res.data.data.final_score
      if (score >= 80) {
        toast.success(`✅ 去AI味完成！评分 ${score} 分`)
      } else {
        toast(`⚠️ 评分 ${score} 分，建议手动继续优化`, { icon: '⚠️' })
      }
    } catch (err: unknown) {
      clearTimeout(timer1); clearTimeout(timer2)
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (err instanceof Error ? err.message : '处理失败，请重试')
      toast.error(msg)
    } finally { setLoading(false) }
  }

  async function copy() {
    if (!result) return
    await navigator.clipboard.writeText(result.final_content)
    setCopied(true)
    toast.success('已复制')
    setTimeout(() => setCopied(false), 2000)
  }

  const initScore = result?.rounds[0]?.score ?? 0

  return (
    <div className="space-y-5 animate-fade-in">
      {/* 页面头部 */}
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <Wand2 size={20} className="text-brand-400" />
          <h1 className="section-title mb-0">去 AI 味</h1>
          <span className="badge bg-brand-500/15 text-brand-400">三层流水线</span>
        </div>
        <p className="section-desc">规则引擎检测 → AI 精准改写 → 随机化处理，最多 {maxRounds} 轮循环直到达标</p>
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* 左：输入区 */}
        <div className="col-span-2 space-y-4">
          <div className="card p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">待处理文章</label>
                <span className="text-xs text-slate-500">{content.length} 字</span>
              </div>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={12}
                placeholder="粘贴 AI 生成的文章，或直接粘贴公众号链接自动抓取..."
                className="textarea-base"
              />
              {content.startsWith('http') && (
                <p className="text-xs text-brand-400 mt-1">🔗 检测到链接，将自动抓取正文</p>
              )}
            </div>

            {/* 改写轮次 */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                最大改写轮次
                <span className="text-slate-500 font-normal ml-2 text-xs">（1轮=快速，3轮=更彻底）</span>
              </label>
              <div className="flex gap-2">
                {[1, 2, 3].map(n => (
                  <button
                    key={n}
                    onClick={() => setMaxRounds(n)}
                    className={cn('flex-1 py-2 rounded-xl text-sm font-medium transition-all',
                      maxRounds === n
                        ? 'bg-brand-500/20 text-brand-300 border border-brand-500/30'
                        : 'bg-dark-400 text-slate-400 hover:text-slate-200 border border-transparent'
                    )}
                  >
                    {n} 轮
                  </button>
                ))}
              </div>
            </div>

            {/* 进度步骤（仅加载时显示） */}
            {loading && (
              <div className="py-2">
                <ProgressSteps stage={stage} />
              </div>
            )}

            <button
              onClick={run}
              disabled={loading || !content.trim()}
              className="btn-primary w-full justify-center"
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" />处理中...</>
                : <><Wand2 size={15} />开始去 AI 味</>
              }
            </button>
          </div>
        </div>

        {/* 右：结果区 */}
        <div className="col-span-3 space-y-4">
          {result ? (
            <>
              {/* 评分对比卡片 */}
              <div className="card p-5">
                <div className="flex items-center gap-6">
                  {/* 改写前 */}
                  <div className="text-center">
                    <ScoreRing score={initScore} />
                    <div className="text-xs text-slate-500 mt-1.5">改写前</div>
                  </div>

                  {/* 箭头 */}
                  <div className="flex-1 flex flex-col items-center gap-1">
                    <ArrowRight size={20} className="text-brand-400" />
                    <div className="text-xs text-slate-500">
                      共 {result.rounds.length} 轮 · {result.provider}
                    </div>
                    {/* 轮次进度条 */}
                    <div className="flex gap-1.5 mt-1">
                      {result.rounds.map((r, i) => (
                        <div
                          key={i}
                          className={cn('h-1.5 flex-1 rounded-full transition-all',
                            r.score >= 80 ? 'bg-emerald-500' : r.score >= 60 ? 'bg-amber-500' : 'bg-red-400'
                          )}
                          title={`第${r.round}轮: ${r.score}分`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* 改写后 */}
                  <div className="text-center">
                    <ScoreRing score={result.final_score} />
                    <div className="text-xs text-slate-500 mt-1.5">改写后</div>
                  </div>

                  {/* 状态徽章 */}
                  <div className={cn('flex flex-col items-center gap-1 px-3 py-2 rounded-xl',
                    result.final_score >= 80 ? 'bg-emerald-500/10' : 'bg-amber-500/10'
                  )}>
                    {result.final_score >= 80
                      ? <><CheckCircle size={18} className="text-emerald-400" /><span className="text-xs text-emerald-400 font-medium">达标</span></>
                      : <><AlertCircle size={18} className="text-amber-400" /><span className="text-xs text-amber-400 font-medium">建议优化</span></>
                    }
                  </div>
                </div>
              </div>

              {/* 视图切换 */}
              <div className="flex gap-2">
                <button
                  onClick={() => setView('compare')}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    view === 'compare' ? 'bg-brand-500/20 text-brand-300' : 'bg-dark-400 text-slate-400 hover:text-slate-200'
                  )}
                >
                  对比视图
                </button>
                <button
                  onClick={() => setView('final')}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    view === 'final' ? 'bg-brand-500/20 text-brand-300' : 'bg-dark-400 text-slate-400 hover:text-slate-200'
                  )}
                >
                  最终版本
                </button>
              </div>

              {/* 对比视图 */}
              {view === 'compare' && (
                <div className="grid grid-cols-2 gap-3 animate-fade-in">
                  <div className="card overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-dark-500 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-400">原文</span>
                      <ScoreRing score={initScore} size="sm" />
                    </div>
                    <div className="p-4 text-sm text-slate-400 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto opacity-70">
                      {content}
                    </div>
                  </div>
                  <div className="card overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-dark-500 flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-200">改写后</span>
                      <ScoreRing score={result.final_score} size="sm" />
                    </div>
                    <div className="p-4 max-h-80 overflow-y-auto">
                      <DiffHighlight original={content} revised={result.final_content} />
                    </div>
                  </div>
                </div>
              )}

              {/* 最终版本 */}
              {view === 'final' && (
                <div className="card overflow-hidden animate-fade-in">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-500">
                    <span className="text-sm font-medium text-slate-200">✨ 最终版本</span>
                    <div className="flex gap-2">
                      <button
                        onClick={copy}
                        className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                          copied
                            ? 'bg-emerald-500/15 text-emerald-400'
                            : 'bg-dark-400 text-slate-300 hover:text-slate-100'
                        )}
                      >
                        {copied ? <><Check size={12} />已复制</> : <><Copy size={12} />复制全文</>}
                      </button>
                      <a href="/deai" className="btn-ghost text-xs py-1.5 px-2">🔍 再次检测</a>
                      <a href="/layout" className="btn-ghost text-xs py-1.5 px-2">📱 排版</a>
                    </div>
                  </div>
                  <div className="p-5 article-content leading-relaxed max-h-96 overflow-y-auto text-sm">
                    {result.final_content}
                  </div>
                </div>
              )}

              {/* 未达标时的建议 */}
              {result.final_score < 80 && (
                <div className="card p-4 bg-amber-500/5 border-amber-500/20">
                  <p className="text-xs text-amber-300 font-medium mb-2">⚠️ 评分 {result.final_score}，建议：</p>
                  <ul className="text-xs text-amber-200/70 space-y-1 list-disc list-inside">
                    <li>手动删除文中仍然存在的「首先/其次/综上所述」</li>
                    <li>替换「蓬勃发展、日新月异」等 AI 特征词</li>
                    <li>在内容检测页面查看具体扣分点</li>
                  </ul>
                  <div className="flex gap-2 mt-3">
                    <a href="/detect" className="btn-secondary text-xs py-1.5 px-3">🔍 查看扣分详情</a>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* 空状态 */
            <div className="card h-full min-h-[400px] flex flex-col items-center justify-center text-center gap-4 p-8">
              <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center">
                <Wand2 size={28} className="text-brand-400" />
              </div>
              <div>
                <h3 className="text-slate-300 font-medium mb-1">去 AI 味，让文章更真实</h3>
                <p className="text-sm text-slate-500 max-w-xs">
                  三层流水线处理：规则引擎检测 → AI 精准改写 → 随机化处理，自动循环直到达标
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 w-full max-w-xs mt-2">
                {[
                  { icon: '🔍', label: '规则检测', desc: '本地即时' },
                  { icon: '🤖', label: 'AI改写', desc: 'Claude处理' },
                  { icon: '🎲', label: '随机优化', desc: '防平台风控' },
                ].map(s => (
                  <div key={s.label} className="bg-dark-400/50 rounded-xl p-3 text-center">
                    <div className="text-lg mb-1">{s.icon}</div>
                    <div className="text-xs font-medium text-slate-300">{s.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
