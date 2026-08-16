import { useState, useRef, useEffect } from 'react'
import { RefreshCw, Loader2, Copy, Check, ArrowLeftRight, Square, Shield, Sparkles, Info } from 'lucide-react'
import { readStream, type StreamEvent } from '../../utils/stream'
import { useAuthStore } from '../../store/auth'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

type Intensity = 'light' | 'medium' | 'heavy'
type Intent = 'dedup' | 'platform' | 'casual' | 'fun'
type Stage = 'idle' | 'rewriting' | 'checking' | 'fixing' | 'randomizing' | 'done'

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

const STAGE_LABELS: Record<Stage, string> = {
  idle:        '',
  rewriting:   'AI 改写中',
  checking:    '检测连续词',
  fixing:      '优化修补中',
  randomizing: '润色处理中',
  done:        '完成',
}

export default function RewritePage() {
  const token     = useAuthStore(s => s.token)
  const [original,  setOriginal]  = useState('')
  const [output,    setOutput]    = useState('')
  const [intensity, setIntensity] = useState<Intensity>('medium')
  const [intent,    setIntent]    = useState<Intent | null>('dedup')
  const [keywords,  setKeywords]  = useState('')
  const [streaming, setStreaming] = useState(false)
  const [copied,    setCopied]    = useState(false)
  const [stage,     setStage]     = useState<Stage>('idle')
  const [progress,  setProgress]  = useState(0)
  const [similarity, setSimilarity] = useState<number | null>(null)
  const [fixCount,  setFixCount]  = useState(0)
  const abortRef = useRef<AbortController>()
  const outputRef = useRef<HTMLDivElement>(null)

  // 相似度数字动画
  const [displaySim, setDisplaySim] = useState(0)
  useEffect(() => {
    if (similarity === null) { setDisplaySim(0); return }
    const target = similarity
    const start = performance.now()
    const duration = 400
    function tick(now: number) {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplaySim(+(target * eased).toFixed(1))
      if (p < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [similarity])

  async function rewrite() {
    if (!original.trim()) return void toast.error('请输入原文或粘贴公众号链接')
    if (original.trim().length < 30) return void toast.error('原文至少 30 字')
    setOutput(''); setStreaming(true); setStage('rewriting'); setProgress(0.05)
    setSimilarity(null); setFixCount(0)
    abortRef.current = new AbortController()
    try {
      const finalEvent = await readStream('/api/ai/rewrite', {
        original: original.trim(),
        intensity,
        intent: intent || undefined,
        keywords: keywords.trim() || undefined,
      }, chunk => {
        setOutput(p => p + chunk)
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
      }, token || undefined, (event: StreamEvent) => {
        if (event.stage) setStage(event.stage as Stage)
        if (event.progress !== undefined) setProgress(event.progress)
        if (event.similarity !== undefined) setSimilarity(event.similarity)
        if (event.fixCount !== undefined) setFixCount(event.fixCount as number)
        if (event.done) setStage('done')
      })
      // 如果有最终相似度信息
      if (finalEvent?.similarity !== undefined) {
        setSimilarity(finalEvent.similarity)
      }
      toast.success('仿写完成，已保存到创作历史')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error(err instanceof Error ? err.message : '仿写失败')
      }
      setStage('idle')
    } finally { setStreaming(false) }
  }

  function stop() {
    abortRef.current?.abort()
    setStreaming(false); setStage('idle')
    toast('已停止生成', { icon: '⏹️' })
  }

  function regenerate() {
    setOutput(''); setSimilarity(null); setFixCount(0); setStage('idle')
    rewrite()
  }

  async function copy() {
    await navigator.clipboard.writeText(output)
    setCopied(true); toast.success('已复制')
    setTimeout(() => setCopied(false), 2000)
  }

  // ─── L3 信息重组模式 ───────────────────────────────────
  const [l3Points, setL3Points] = useState<string[]>([])
  const [l3Structure, setL3Structure] = useState('story-lead')
  const [l3Loading, setL3Loading] = useState(false)
  const [l3Step, setL3Step] = useState<'idle' | 'points' | 'writing'>('idle')

  const isL3Mode = intensity === 'heavy' && intent === 'dedup' && !original.trim().startsWith('http')

  async function extractPointsFromOriginal() {
    if (!original.trim()) return void toast.error('请输入原文')
    if (original.trim().length < 30) return void toast.error('原文至少 30 字')
    setL3Loading(true); setL3Points([]); setL3Step('idle')
    try {
      const resp = await fetch('/api/ai/rewrite/extract-points', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ original: original.trim() }),
      })
      if (!resp.ok) {
        const text = await resp.text()
        let msg = '提取失败'
        try { msg = JSON.parse(text).error || msg } catch {}
        throw new Error(msg)
      }
      const json = await resp.json() as { data: { points: string[]; suggestedStructure: string } }
      setL3Points(json.data.points)
      setL3Structure(json.data.suggestedStructure || 'story-lead')
      setL3Step('points')
      toast.success(`提取到 ${json.data.points.length} 个核心要点`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '提取要点失败')
    } finally { setL3Loading(false) }
  }

  function removePoint(index: number) {
    setL3Points(prev => prev.filter((_, i) => i !== index))
  }

  async function writeFromPoints() {
    if (l3Points.length === 0) return
    setOutput(''); setStreaming(true); setStage('rewriting'); setProgress(0.1)
    setL3Step('writing')
    try {
      await readStream('/api/ai/rewrite/from-points', {
        points: l3Points,
        structure: l3Structure,
        word_count: Math.max(800, Math.min(original.trim().length, 3000)),
        keywords: keywords.trim() || undefined,
      }, chunk => {
        setOutput(p => p + chunk)
        if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
      }, token || undefined, (event: StreamEvent) => {
        if (event.done) setStage('done')
      })
      toast.success('深度改写完成')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error(err instanceof Error ? err.message : '生成失败')
      }
    } finally { setStreaming(false); setStage('done') }
  }

  const isDedup = intent === 'dedup'
  const simColor = similarity === null ? '' :
    similarity < 5 ? 'text-emerald-400' :
    similarity < 10 ? 'text-amber-400' : 'text-red-400'
  const simBg = similarity === null ? '' :
    similarity < 5 ? 'bg-emerald-500/10 border-emerald-500/20' :
    similarity < 10 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-red-500/10 border-red-500/20'

  return (
    <div className="space-y-5 animate-fade-in">
      {/* 页面标题 */}
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <RefreshCw size={20} className="text-teal-400" />
          <h1 className="section-title mb-0">二次仿写</h1>
        </div>
        <p className="section-desc">语义等价、文字焕然一新，支持降重、换平台风格、口语化等多种改写意图</p>
      </div>

      {/* 改写意图选择 */}
      <div className="card p-4">
        <p className="text-xs text-slate-400 mb-3">改写目标（可选，不选则通用改写）</p>
        <div className="grid grid-cols-4 gap-2">
          {INTENT_OPTIONS.map(o => (
            <button key={o.id} onClick={() => setIntent(intent === o.id ? null : o.id)}
              className={cn(
                'relative p-3 rounded-xl text-left border transition-all',
                intent === o.id
                  ? 'bg-teal-500/10 border-teal-500/30 text-teal-300 before:absolute before:left-0 before:top-3 before:bottom-3 before:w-0.5 before:bg-brand-500 before:rounded-full'
                  : 'bg-dark-300 border-dark-500 text-slate-400 hover:border-dark-400'
              )}>
              <div className="text-base mb-1">{o.icon}</div>
              <div className="text-xs font-medium">{o.label}</div>
              <div className="text-[10px] opacity-60 mt-0.5 line-clamp-2">{o.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 降重提示条 */}
      {isDedup && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-teal-500/[0.06] border border-teal-500/20 text-teal-300 text-xs animate-slide-up">
          <Shield size={14} className="shrink-0 opacity-70" />
          <span>建议选择「中度」或「深度」强度以获得最佳降重效果。深度模式将完全重构文章骨架，相似度更低。</span>
        </div>
      )}

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
        {/* 原文面板 */}
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

          {/* 保留关键词 */}
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
            ) : isL3Mode ? (
              <button onClick={extractPointsFromOriginal} disabled={!original.trim() || l3Loading}
                className="btn-primary text-sm py-2 px-4">
                {l3Loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {l3Loading ? '提取中...' : '提取要点 → 深度改写'}
              </button>
            ) : (
              <button onClick={rewrite} disabled={!original.trim()}
                className="btn-primary text-sm py-2 px-4">
                <ArrowLeftRight size={14} />开始仿写
              </button>
            )}
          </div>
        </div>

        {/* 结果面板 */}
        <div className="card overflow-hidden flex flex-col">
          {/* 标题栏 + 进度指示 */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-500 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-300">仿写结果</span>
              {streaming && stage !== 'done' && (
                <span className="flex items-center gap-1.5 text-[10px] text-teal-400 bg-teal-500/10 px-2.5 py-0.5 rounded-full">
                  {stage === 'rewriting' && <Loader2 size={9} className="animate-spin" />}
                  {stage === 'checking' && <Shield size={9} />}
                  {stage === 'fixing' && <Sparkles size={9} />}
                  {STAGE_LABELS[stage]}
                  {stage === 'fixing' && fixCount > 0 && ` (${fixCount}处)`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{output.trim().length} 字</span>
              {output && !streaming && (
                <button onClick={copy}
                  className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all',
                    copied ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 hover:text-slate-200 hover:bg-dark-400'
                  )}>
                  {copied ? <><Check size={11} />已复制</> : <><Copy size={11} />复制</>}
                </button>
              )}
            </div>
          </div>

          {/* 进度条（仅改写中显示） */}
          {streaming && stage !== 'done' && (
            <div className="h-[3px] bg-dark-500">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out bg-gradient-to-r from-brand-600 to-teal-400"
                style={{ width: `${Math.min(progress * 100, 98)}%` }}
              />
            </div>
          )}

          {/* 降重状态栏（完成后显示相似度） */}
          {stage === 'done' && isDedup && similarity !== null && (
            <div className={cn('mx-3 mt-3 px-4 py-3 rounded-xl border animate-pop-in', simBg)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-baseline gap-0.5">
                    <span className={cn('text-2xl font-bold tabular-nums', simColor)}>
                      {displaySim}
                    </span>
                    <span className={cn('text-sm opacity-60', simColor)}>%</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-300 font-medium">
                      {similarity < 5 ? '✓ 原创' : similarity < 10 ? '⚠ 轻度相似' : '✗ 相似度偏高'}
                    </span>
                    <span className="text-[10px] text-slate-500">预估相似度</span>
                  </div>
                </div>
                {fixCount > 0 && (
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Sparkles size={10} />已修补 {fixCount} 处连续词
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-600 mt-1.5 flex items-center gap-1">
                <Info size={9} />仅为预估值，实际以查重平台检测结果为准
              </p>
            </div>
          )}

          {/* 输出内容区 */}
          <div ref={outputRef} className="flex-1 overflow-y-auto p-4 min-h-72">
            {/* L3 要点列表（Step 1 完成后显示） */}
            {l3Step === 'points' && !output && (
              <div className="space-y-4 animate-fade-in">
                <div className="flex items-center gap-2 text-sm text-slate-300 font-medium">
                  <Sparkles size={15} className="text-teal-400" />
                  <span>核心要点提取完成</span>
                  <span className="text-[10px] text-slate-500 bg-dark-400 px-2 py-0.5 rounded-full">
                    {l3Points.length} 个
                  </span>
                </div>
                <p className="text-xs text-slate-500">可删除不需要的要点，确认后将基于这些要点生成全新文章</p>
                <div className="space-y-2">
                  {l3Points.map((point, i) => (
                    <div key={i} className="flex items-start gap-2 group">
                      <span className="shrink-0 w-5 h-5 rounded-md bg-teal-500/10 text-teal-400 text-[10px] flex items-center justify-center font-medium mt-0.5">
                        {i + 1}
                      </span>
                      <span className="flex-1 text-sm text-slate-300 leading-relaxed">{point}</span>
                      <button onClick={() => removePoint(i)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all text-xs p-1">
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div className="pt-2 flex gap-2">
                  <button onClick={writeFromPoints} disabled={l3Points.length === 0}
                    className="btn-primary text-sm py-2 px-4">
                    <ArrowLeftRight size={14} />基于要点重写文章
                  </button>
                  <button onClick={() => { setL3Step('idle'); setL3Points([]) }}
                    className="btn-ghost text-xs">取消</button>
                </div>
              </div>
            )}

            {output ? (
              <div className={cn(
                'article-content text-sm leading-relaxed whitespace-pre-wrap break-words',
                streaming && stage === 'rewriting' && 'typing-cursor'
              )}>
                {output}
              </div>
            ) : l3Step !== 'points' && (
              <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-8">
                <div className="relative w-16 h-16">
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-teal-500/10 to-brand-500/5 rotate-6" />
                  <div className="absolute inset-0 rounded-2xl bg-dark-300 flex items-center justify-center">
                    <ArrowLeftRight size={24} className="text-slate-600" />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-slate-400 font-medium">仿写结果将在这里呈现</p>
                  <p className="text-xs text-slate-600">
                    {isL3Mode ? '提取要点 → 确认 → 生成全新文章' : '粘贴原文 → 选择参数 → 点击开始'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* 底部操作栏 */}
          {output && !streaming && (
            <div className="border-t border-dark-500 px-4 py-2.5 flex items-center gap-2 shrink-0">
              <button onClick={regenerate}
                className="btn-ghost text-xs py-1.5 px-2.5">
                <RefreshCw size={12} />重新生成
              </button>
              <div className="w-px h-4 bg-dark-500" />
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
