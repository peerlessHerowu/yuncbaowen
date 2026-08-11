import { useState } from 'react'
import { ScanText, Loader2, AlertCircle, CheckCircle, Wand2, RefreshCw } from 'lucide-react'
import { aiApi } from '../../api'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'
import type { DetectResult } from '@yuncbaowen/shared'

// ── 评分环形图 ─────────────────────────────────────────────────
function ScoreRing({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? '#10B981' : score >= 60 ? '#F59E0B' : '#EF4444'
  const r = 28, stroke = 5
  const circumference = 2 * Math.PI * r
  const progress = circumference * (1 - score / 100)
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: (r + stroke) * 2, height: (r + stroke) * 2 }}>
        <svg width={(r + stroke) * 2} height={(r + stroke) * 2} className="-rotate-90">
          <circle cx={r + stroke} cy={r + stroke} r={r} fill="none" stroke="#1e293b" strokeWidth={stroke} />
          <circle cx={r + stroke} cy={r + stroke} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={progress}
            style={{ transition: 'stroke-dashoffset 1s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-black text-xl tabular-nums" style={{ color }}>{score}</span>
        </div>
      </div>
      <span className="text-xs text-slate-400 text-center leading-tight">{label}</span>
    </div>
  )
}

// ── 分项评分条 ─────────────────────────────────────────────────
function ScoreBar({ score, label, icon, issues, active, onClick }:
  { score: number; label: string; icon: string; issues: number; active: boolean; onClick: () => void }
) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500'
  const textColor = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400'

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left',
        active ? 'bg-dark-400 ring-1 ring-brand-500/30' : 'hover:bg-dark-400/50'
      )}
    >
      <span className="text-base">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-slate-300">{label}</span>
          <div className="flex items-center gap-2">
            {issues > 0 && (
              <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-full">
                {issues} 处
              </span>
            )}
            <span className={cn('text-sm font-bold tabular-nums', textColor)}>{score}</span>
          </div>
        </div>
        <div className="h-1.5 bg-dark-500 rounded-full overflow-hidden">
          <div className={cn('h-full rounded-full transition-all duration-1000', color)} style={{ width: `${score}%` }} />
        </div>
      </div>
    </button>
  )
}

// ── 文本内高亮问题词 ───────────────────────────────────────────
function HighlightedText({ content, issues }: {
  content: string
  issues: Array<{ text: string; start: number; end: number; reason: string }>
}) {
  if (!issues.length) {
    return <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{content}</p>
  }

  // 按 start 排序，过滤无效位置
  const validIssues = issues
    .filter(iss => iss.start >= 0 && iss.end <= content.length && iss.start < iss.end)
    .sort((a, b) => a.start - b.start)

  const parts: Array<{ text: string; highlight: boolean; reason?: string }> = []
  let cursor = 0

  for (const iss of validIssues) {
    if (iss.start > cursor) parts.push({ text: content.slice(cursor, iss.start), highlight: false })
    parts.push({ text: content.slice(iss.start, iss.end), highlight: true, reason: iss.reason })
    cursor = iss.end
  }
  if (cursor < content.length) parts.push({ text: content.slice(cursor), highlight: false })

  return (
    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
      {parts.map((p, i) =>
        p.highlight
          ? (
            <span key={i} title={p.reason}
              className="bg-red-500/20 text-red-200 rounded px-0.5 underline decoration-dotted decoration-red-400 cursor-help">
              {p.text}
            </span>
          )
          : <span key={i}>{p.text}</span>
      )}
    </p>
  )
}

// ── 维度配置 ───────────────────────────────────────────────────
const DIMS = [
  { key: 'ai_taste'        as const, label: 'AI 痕迹',  icon: '🧬', action: { label: '去AI味', href: '/deai' } },
  { key: 'forbidden_words' as const, label: '违禁词',   icon: '🚫', action: null },
  { key: 'originality'     as const, label: '原创度',   icon: '✨', action: { label: '重新生成', href: '/generate' } },
  { key: 'readability'     as const, label: '可读性',   icon: '📖', action: null },
]

export default function DetectPage() {
  const [content,   setContent]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState<DetectResult | null>(null)
  const [activeKey, setActiveKey] = useState<keyof DetectResult['dimensions'] | null>(null)

  async function detect() {
    if (!content.trim()) return void toast.error('请输入待检测文章')
    if (content.trim().length < 30) return void toast.error('文章至少 30 字')
    setLoading(true); setResult(null); setActiveKey(null)
    try {
      const res = await aiApi.detect({ content: content.trim() })
      setResult(res.data.data)
      // 默认展开得分最低的维度
      const dims = res.data.data.dimensions
      type DimKey = keyof DetectResult['dimensions']
      const dimKeys: DimKey[] = ['ai_taste', 'forbidden_words', 'originality', 'readability']
      const lowestKey = dimKeys.sort((a, b) => dims[a].score - dims[b].score)[0]
      setActiveKey(lowestKey)
      toast.success(`检测完成，综合评分 ${res.data.data.overall_score} 分`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (err instanceof Error ? err.message : '检测失败，请重试')
      toast.error(msg)
    } finally { setLoading(false) }
  }

  const activeDim = activeKey ? result?.dimensions[activeKey] : null
  const activeDimConfig = DIMS.find(d => d.key === activeKey)

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <ScanText size={20} className="text-cyan-400" />
          <h1 className="section-title mb-0">内容检测</h1>
        </div>
        <p className="section-desc">AI味 / 违禁词 / 原创度 / 可读性 四维评分，每处扣分精确定位到原文</p>
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* 左：输入 */}
        <div className="col-span-2 space-y-4">
          <div className="card p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">待检测文章</label>
                <span className="text-xs text-slate-500">{content.length} 字</span>
              </div>
              <textarea
                value={content}
                onChange={e => setContent(e.target.value)}
                rows={14}
                placeholder="粘贴文章内容，或粘贴公众号链接自动抓取..."
                className="textarea-base"
              />
              {content.startsWith('http') && (
                <p className="text-xs text-brand-400 mt-1">🔗 检测到链接，将自动抓取正文</p>
              )}
            </div>
            <button
              onClick={detect}
              disabled={loading || !content.trim()}
              className="btn-primary w-full justify-center"
            >
              {loading
                ? <><Loader2 size={15} className="animate-spin" />检测中（约 10-20秒）...</>
                : <><ScanText size={15} />开始四维检测</>
              }
            </button>
          </div>
        </div>

        {/* 右：结果 */}
        <div className="col-span-3 space-y-4">
          {result ? (
            <>
              {/* 评分总览 */}
              <div className="card p-5">
                <div className="flex items-center gap-6 mb-4">
                  {/* 综合大环 */}
                  <div className="text-center">
                    <ScoreRing score={result.overall_score} label="综合评分" />
                  </div>
                  {/* 状态 + provider */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {result.passed
                        ? <><CheckCircle size={16} className="text-emerald-400" /><span className="text-emerald-300 font-semibold text-sm">通过检测</span></>
                        : <><AlertCircle size={16} className="text-amber-400" /><span className="text-amber-300 font-semibold text-sm">需要优化</span></>
                      }
                      <span className="badge bg-dark-400 text-slate-500 ml-auto text-[10px]">{result.provider}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {result.passed
                        ? '文章通过了四个维度的检测，可以放心发布。'
                        : '点击下方各维度，查看具体扣分原因和修改建议。'
                      }
                    </p>
                  </div>
                </div>

                {/* 四维评分条 */}
                <div className="space-y-1">
                  {DIMS.map(d => (
                    <ScoreBar
                      key={d.key}
                      score={result.dimensions[d.key].score}
                      label={d.label}
                      icon={d.icon}
                      issues={result.dimensions[d.key].issues.length}
                      active={activeKey === d.key}
                      onClick={() => setActiveKey(d.key === activeKey ? null : d.key)}
                    />
                  ))}
                </div>
              </div>

              {/* 扣分详情 */}
              {activeKey && activeDim && (
                <div className="card overflow-hidden animate-fade-in">
                  <div className="px-4 py-3 border-b border-dark-500 flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-200">
                      {activeDimConfig?.icon} {activeDimConfig?.label} — 详情
                    </span>
                    {activeDim.issues.length > 0 && (
                      <span className="badge bg-red-500/15 text-red-400">{activeDim.issues.length} 处问题</span>
                    )}
                    {activeDimConfig?.action && (
                      <a href={activeDimConfig.action.href}
                        className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium bg-brand-500/15 text-brand-300 hover:bg-brand-500/25 transition-colors">
                        <Wand2 size={11} />
                        {activeDimConfig.action.label}
                      </a>
                    )}
                  </div>

                  {activeDim.issues.length > 0 ? (
                    <div className="divide-y divide-dark-500 max-h-48 overflow-y-auto">
                      {activeDim.issues.map((issue, i) => (
                        <div key={i} className="px-4 py-3">
                          <div className="text-xs text-red-300 bg-red-500/10 rounded px-2 py-1 mb-1.5 font-mono">
                            「{issue.text}」
                          </div>
                          <div className="text-xs text-slate-400">{issue.reason}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-5 flex items-center gap-3 text-emerald-400">
                      <CheckCircle size={18} />
                      <span className="text-sm font-medium">{activeDimConfig?.label} 无问题</span>
                    </div>
                  )}
                </div>
              )}

              {/* 原文高亮（当 AI味 维度激活时）*/}
              {activeKey === 'ai_taste' && activeDim && activeDim.issues.length > 0 && (
                <div className="card overflow-hidden animate-fade-in">
                  <div className="px-4 py-2.5 border-b border-dark-500">
                    <span className="text-xs font-medium text-slate-300">原文问题定位</span>
                    <span className="text-[10px] text-slate-500 ml-2">红色下划线 = 扣分位置，悬浮查看原因</span>
                  </div>
                  <div className="p-4 max-h-48 overflow-y-auto">
                    <HighlightedText content={content} issues={activeDim.issues} />
                  </div>
                </div>
              )}

              {/* 行动按钮 */}
              {!result.passed && (
                <div className="flex gap-3">
                  <a href="/deai" className="btn-primary flex-1 justify-center text-sm">
                    <Wand2 size={14} />一键去AI味
                  </a>
                  <button
                    onClick={() => { setResult(null); setContent('') }}
                    className="btn-secondary flex items-center gap-1.5 px-4 py-2.5 text-sm"
                  >
                    <RefreshCw size={14} />重新检测
                  </button>
                </div>
              )}
            </>
          ) : (
            /* 空状态 */
            <div className="card min-h-[400px] flex flex-col items-center justify-center text-center gap-4 p-8">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 flex items-center justify-center">
                <ScanText size={28} className="text-cyan-400" />
              </div>
              <div>
                <h3 className="text-slate-300 font-medium mb-1">四维内容检测</h3>
                <p className="text-sm text-slate-500 max-w-xs">
                  AI 痕迹、违禁词、原创度、可读性，每处问题精确定位到原文
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full max-w-xs mt-2">
                {DIMS.map(d => (
                  <div key={d.key} className="bg-dark-400/50 rounded-xl p-3 text-center">
                    <div className="text-lg mb-1">{d.icon}</div>
                    <div className="text-xs font-medium text-slate-300">{d.label}</div>
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
