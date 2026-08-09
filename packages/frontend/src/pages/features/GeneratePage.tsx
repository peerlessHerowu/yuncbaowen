import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { PenTool, Loader2, Copy, BookOpen, Palette, Zap } from 'lucide-react'
import { styleApi, knowledgeApi } from '../../api'
import { readStream } from '../../utils/stream'
import { useAuthStore } from '../../store/auth'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

interface StyleItem { id: number; name: string; description: string }
interface DocItem    { id: number; filename: string; chunk_count: number }

export default function GeneratePage() {
  const location  = useLocation()
  const token     = useAuthStore(s => s.token)
  const initTopic = (location.state as { topic?: string })?.topic || ''

  const [topic,       setTopic]      = useState(initTopic)
  const [styleId,     setStyleId]    = useState<number | null>(null)
  const [useKnowledge, setUseKnowledge] = useState(false)
  const [docIds,      setDocIds]     = useState<number[]>([])
  const [wordCount,   setWordCount]  = useState(1500)
  const [styles,      setStyles]     = useState<StyleItem[]>([])
  const [docs,        setDocs]       = useState<DocItem[]>([])
  const [output,      setOutput]     = useState('')
  const [streaming,   setStreaming]  = useState(false)
  const [provider,    setProvider]   = useState('')
  const outputRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    styleApi.list().then(r => setStyles(r.data.data.styles))
    knowledgeApi.list().then(r => setDocs(r.data.data.docs))
  }, [])

  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight
  }, [output])

  async function generate() {
    if (!topic.trim()) return void toast.error('请输入主题')
    setOutput(''); setStreaming(true); setProvider('')
    try {
      await readStream('/api/ai/generate', {
        topic: topic.trim(),
        style_prompt_id: styleId || undefined,
        use_knowledge: useKnowledge,
        knowledge_doc_ids: docIds.length ? docIds : undefined,
        word_count: wordCount,
      }, chunk => {
        setOutput(prev => prev + chunk)
      }, token || undefined)
      toast.success('生成完成，已自动保存到创作历史')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '生成失败')
    } finally { setStreaming(false) }
  }

  async function copyOutput() {
    await navigator.clipboard.writeText(output)
    toast.success('已复制全文')
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <PenTool size={20} className="text-blue-400" />
          <h1 className="section-title mb-0">定向生成</h1>
        </div>
        <p className="section-desc">选定风格 + 输入主题，一键生成完整公众号爆文</p>
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* 左：配置区 */}
        <div className="col-span-2 space-y-4">
          <div className="card p-5 space-y-4">
            {/* 主题 */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">文章主题 *</label>
              <textarea value={topic} onChange={e => setTopic(e.target.value)}
                rows={3} placeholder="输入想写的主题，如「普通人如何通过副业月入过万」"
                className="textarea-base" />
            </div>

            {/* 风格选择 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                <Palette size={14} className="text-pink-400" />风格选择（可选）
              </label>
              <select value={styleId ?? ''} onChange={e => setStyleId(e.target.value ? Number(e.target.value) : null)}
                className="input-base">
                <option value="">不使用风格（通用写法）</option>
                {styles.map(s => <option key={s.id} value={s.id}>{s.name} — {s.description}</option>)}
              </select>
              {!styles.length && (
                <p className="text-xs text-slate-500 mt-1">
                  先去<a href="/style" className="text-brand-400 hover:underline">风格复刻</a>创建写作风格
                </p>
              )}
            </div>

            {/* 知识库 */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-300 mb-2">
                <BookOpen size={14} className="text-blue-400" />引用知识库
                <input type="checkbox" checked={useKnowledge} onChange={e => setUseKnowledge(e.target.checked)}
                  className="ml-auto w-4 h-4 accent-brand-500 cursor-pointer" />
              </label>
              {useKnowledge && docs.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  {docs.map(d => (
                    <label key={d.id} className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer hover:text-slate-200 transition-colors">
                      <input type="checkbox"
                        checked={docIds.includes(d.id)}
                        onChange={e => setDocIds(ids => e.target.checked ? [...ids, d.id] : ids.filter(x => x !== d.id))}
                        className="w-3.5 h-3.5 accent-brand-500" />
                      <span className="truncate">{d.filename}</span>
                      <span className="badge bg-dark-400 text-slate-500 shrink-0">{d.chunk_count} 块</span>
                    </label>
                  ))}
                </div>
              )}
              {useKnowledge && !docs.length && (
                <p className="text-xs text-slate-500">
                  先去<a href="/knowledge" className="text-brand-400 hover:underline">知识库</a>上传文档
                </p>
              )}
            </div>

            {/* 字数 */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">目标字数</label>
              <div className="flex gap-2">
                {[800, 1500, 2500, 4000].map(n => (
                  <button key={n} onClick={() => setWordCount(n)}
                    className={cn('flex-1 py-1.5 rounded text-xs font-medium transition-all',
                      wordCount === n ? 'bg-blue-500/25 text-blue-300 border border-blue-500/30' : 'bg-dark-400 text-slate-400 hover:text-slate-200'
                    )}>
                    {n >= 1000 ? `${n/1000}k` : n}字
                  </button>
                ))}
              </div>
            </div>

            <button onClick={generate} disabled={streaming || !topic.trim()} className="btn-primary w-full justify-center">
              {streaming ? <><Loader2 size={15} className="animate-spin" />生成中...</> : <><Zap size={15} />开始生成全文</>}
            </button>
          </div>
        </div>

        {/* 右：输出区 */}
        <div className="col-span-3">
          <div className="card overflow-hidden h-full flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-500 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-300">生成结果</span>
                {provider && <span className="badge bg-dark-400 text-slate-400 text-[10px]">{provider}</span>}
                {streaming && <span className="badge bg-brand-500/15 text-brand-400 text-[10px]">生成中...</span>}
              </div>
              {output && (
                <button onClick={copyOutput} className="btn-ghost text-xs">
                  <Copy size={12} />复制全文
                </button>
              )}
            </div>
            <div ref={outputRef} className="flex-1 overflow-y-auto p-5 min-h-96">
              {output ? (
                <div className={cn('article-content', streaming && 'typing-cursor')}>
                  {output}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-center text-slate-500">
                  <div>
                    <PenTool size={32} className="mx-auto mb-3 opacity-30" />
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
                <a href="/layout" className="btn-secondary text-xs py-1.5 px-3">📱 排版</a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
