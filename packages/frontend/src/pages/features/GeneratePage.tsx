import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { PenTool, Loader2, Copy, Check, BookOpen, Palette, Zap, Square } from 'lucide-react'
import { styleApi, knowledgeApi } from '../../api'
import { readStream } from '../../utils/stream'
import { useAuthStore } from '../../store/auth'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

// ── 文章结构模板 ────────────────────────────────────────────────
const STRUCTURES = [
  { id: 'freeform',         label: '自由',   icon: '✨', desc: 'AI 自主发挥' },
  { id: 'total-split-total',label: '总分总', icon: '📐', desc: '先结论再展开' },
  { id: 'problem-solution', label: '问题解决', icon: '💡', desc: '痛点→解决方案' },
  { id: 'story-lead',       label: '故事引入', icon: '📖', desc: '案例开场' },
  { id: 'listicle',         label: '干货列表', icon: '📋', desc: 'N个方法/技巧' },
  { id: 'contrast',         label: '对比型',  icon: '⚖️', desc: '高手 vs 普通人' },
] as const

type StructureId = typeof STRUCTURES[number]['id']

interface StyleItem { id: number; name: string; description: string }
interface DocItem { id: number; filename: string; chunk_count: number }

export default function GeneratePage() {
  const location  = useLocation()
  const token     = useAuthStore(s => s.token)
  const initTopic = (location.state as { topic?: string })?.topic || ''

  const [topic,       setTopic]       = useState(initTopic)
  const [styleId,     setStyleId]     = useState<number | null>(null)
  const [structure,   setStructure]   = useState<StructureId>('freeform')
  const [useKnowledge,setUseKnowledge]= useState(false)
  const [docIds,      setDocIds]      = useState<number[]>([])
  const [wordCount,   setWordCount]   = useState(1500)
  const [styles,      setStyles]      = useState<StyleItem[]>([])
  const [docs,        setDocs]        = useState<DocItem[]>([])
  const [output,      setOutput]      = useState('')
  const [streaming,   setStreaming]   = useState(false)
  const [wordGenerated, setWordGenerated] = useState(0)
  const [copied,      setCopied]      = useState(false)
  const abortRef  = useRef<AbortController>()
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    styleApi.list().then(r => setStyles(r.data.data.styles || []))
    knowledgeApi.list().then(r => setDocs(r.data.data.docs || []))
  }, [])

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [output])

  async function generate() {
    if (!topic.trim()) return void toast.error('请输入主题')
    setOutput(''); setStreaming(true); setWordGenerated(0); setCopied(false)
    abortRef.current = new AbortController()
    try {
      await readStream('/api/ai/generate', {
        topic: topic.trim(),
        style_prompt_id: styleId || undefined,
        structure,
        use_knowledge: useKnowledge,
        knowledge_doc_ids: docIds.length ? docIds : undefined,
        word_count: wordCount,
      }, chunk => {
        setOutput(prev => {
          const next = prev + chunk
          setWordGenerated(next.length)
          return next
        })
      }, token || undefined)
      toast.success('生成完成，已保存到创作历史')
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error(err instanceof Error ? err.message : '生成失败')
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
    setCopied(true); toast.success('已复制全文')
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <PenTool size={20} className="text-blue-400" />
          <h1 className="section-title mb-0">定向生成</h1>
        </div>
        <p className="section-desc">选定风格和结构模板，一键生成完整公众号爆文</p>
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* 左：配置区 */}
        <div className="col-span-2 space-y-4">
          <div className="card p-5 space-y-4">

            {/* 主题 */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">文章主题 *</label>
              <textarea
                value={topic}
                onChange={e => setTopic(e.target.value)}
                rows={3}
                placeholder="输入想写的主题，如「普通人如何通过副业月入过万」"
                className="textarea-base"
              />
            </div>

            {/* 文章结构（新增） */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">文章结构</label>
              <div className="grid grid-cols-3 gap-1.5">
                {STRUCTURES.map(s => (
                  <button key={s.id} onClick={() => setStructure(s.id)}
                    className={cn(
                      'p-2 rounded-xl text-center border transition-all',
                      structure === s.id
                        ? 'bg-blue-500/15 border-blue-500/30 text-blue-300'
                        : 'bg-dark-400 border-dark-500 text-slate-400 hover:border-dark-400'
                    )}>
                    <div className="text-sm mb-0.5">{s.icon}</div>
                    <div className="text-[10px] font-medium leading-tight">{s.label}</div>
                    <div className="text-[9px] opacity-50 mt-0.5 leading-tight">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* 风格选择 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                <Palette size={14} className="text-pink-400" />写作风格（可选）
              </label>
              <select
                value={styleId ?? ''}
                onChange={e => setStyleId(e.target.value ? Number(e.target.value) : null)}
                className="input-base"
              >
                <option value="">通用写法</option>
                {styles.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {!styles.length && (
                <p className="text-xs text-slate-500 mt-1">
                  先去 <a href="/style" className="text-brand-400 hover:underline">风格复刻</a> 创建写作风格
                </p>
              )}
            </div>

            {/* 知识库 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                <BookOpen size={14} className="text-blue-400" />引用知识库
                <input type="checkbox" checked={useKnowledge}
                  onChange={e => setUseKnowledge(e.target.checked)}
                  className="ml-auto w-4 h-4 accent-brand-500 cursor-pointer" />
              </label>
              {useKnowledge && docs.length > 0 && (
                <div className="space-y-1.5 mt-2 max-h-32 overflow-y-auto">
                  {docs.map(d => (
                    <label key={d.id} className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer hover:text-slate-200 transition-colors">
                      <input type="checkbox"
                        checked={docIds.includes(d.id)}
                        onChange={e => setDocIds(ids => e.target.checked ? [...ids, d.id] : ids.filter(x => x !== d.id))}
                        className="w-3.5 h-3.5 accent-brand-500 shrink-0" />
                      <span className="truncate">{d.filename}</span>
                      <span className="badge bg-dark-400 text-slate-500 shrink-0">{d.chunk_count}块</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* 字数 */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">目标字数</label>
              <div className="flex gap-2">
                {[800, 1500, 2500, 4000].map(n => (
                  <button key={n} onClick={() => setWordCount(n)}
                    className={cn('flex-1 py-1.5 rounded-lg text-xs font-medium transition-all',
                      wordCount === n
                        ? 'bg-blue-500/25 text-blue-300 border border-blue-500/30'
                        : 'bg-dark-400 text-slate-400 hover:text-slate-200 border border-transparent'
                    )}>
                    {n >= 1000 ? `${n / 1000}k` : n}字
                  </button>
                ))}
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2">
              {streaming ? (
                <button onClick={stop}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/15 text-red-400 text-sm hover:bg-red-500/25 transition-all">
                  <Square size={14} />停止生成
                </button>
              ) : (
                <button onClick={generate} disabled={!topic.trim()}
                  className="btn-primary w-full justify-center">
                  <Zap size={15} />开始生成全文
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 右：输出区 */}
        <div className="col-span-3">
          <div className="card overflow-hidden h-full flex flex-col min-h-[500px]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-500 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-300">生成结果</span>
                {streaming && (
                  <span className="flex items-center gap-1 text-[10px] text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">
                    <Loader2 size={9} className="animate-spin" />生成中
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {/* 字数进度 */}
                {streaming && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-24 h-1 bg-dark-500 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${Math.min((wordGenerated / wordCount) * 100, 100)}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-500 tabular-nums">{wordGenerated}/{wordCount}</span>
                  </div>
                )}
                {output && !streaming && (
                  <button onClick={copy}
                    className={cn('flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all',
                      copied ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400 hover:text-slate-200 hover:bg-dark-400'
                    )}>
                    {copied ? <><Check size={11} />已复制</> : <><Copy size={11} />复制全文</>}
                  </button>
                )}
              </div>
            </div>

            <div ref={outputRef} className="flex-1 overflow-y-auto p-5">
              {output ? (
                <div className={cn(
                  'article-content text-sm leading-relaxed',
                  streaming && 'after:content-["|"] after:animate-pulse after:text-brand-400 after:ml-0.5'
                )}>
                  {output}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center gap-4 text-slate-500">
                  <PenTool size={32} className="opacity-20" />
                  <div>
                    <p className="text-sm">填写主题后点击「开始生成全文」</p>
                    <p className="text-xs mt-1 opacity-60">支持流式输出，实时看到生成过程</p>
                  </div>
                </div>
              )}
            </div>

            {output && !streaming && (
              <div className="border-t border-dark-500 px-4 py-3 flex gap-2 shrink-0">
                <a href="/deai" className="btn-secondary text-xs py-1.5 px-3">🧬 去AI味</a>
                <a href="/detect" className="btn-secondary text-xs py-1.5 px-3">🔍 内容检测</a>
                <a href="/platform" className="btn-secondary text-xs py-1.5 px-3">🌐 多平台推文</a>
                <a href="/layout" className="btn-secondary text-xs py-1.5 px-3">📱 排版</a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
