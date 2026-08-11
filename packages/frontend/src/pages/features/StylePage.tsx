import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Palette, Loader2, Trash2, ChevronRight, X, Check } from 'lucide-react'
import { aiApi, styleApi } from '../../api'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

interface StylePrompt { id?: number; name: string; description: string; source_urls: string[]; prompt_content: string; created_at?: string }

// ── URL Tag 输入组件 ────────────────────────────────────────────
function UrlTagInput({ value, onChange }: {
  value: string[]
  onChange: (urls: string[]) => void
}) {
  const [inputVal, setInputVal] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function addUrl(raw: string) {
    // 支持批量粘贴（多行或空格分割）
    const lines = raw.split(/[\n\s]+/).map(s => s.trim()).filter(s => s.startsWith('http'))
    const unique = lines.filter(u => !value.includes(u))
    if (unique.length) onChange([...value, ...unique].slice(0, 10))
    setInputVal('')
  }

  function removeUrl(idx: number) {
    onChange(value.filter((_, i) => i !== idx))
  }

  function isValidUrl(url: string) {
    return /^https?:\/\/.+/.test(url)
  }

  return (
    <div
      className="min-h-[80px] p-3 bg-dark-400 border border-dark-500 rounded-xl cursor-text focus-within:border-brand-500/50 focus-within:ring-1 focus-within:ring-brand-500/20 transition-all"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {value.map((url, idx) => (
          <div key={idx} className={cn(
            'flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full text-[11px] font-medium max-w-[200px]',
            isValidUrl(url) ? 'bg-brand-500/15 text-brand-300' : 'bg-red-500/15 text-red-400'
          )}>
            <span className="truncate">{url.replace(/^https?:\/\//, '').slice(0, 30)}</span>
            <button onClick={e => { e.stopPropagation(); removeUrl(idx) }}
              className="shrink-0 rounded-full hover:bg-dark-500 p-0.5 transition-colors">
              <X size={10} />
            </button>
          </div>
        ))}
      </div>
      <input
        ref={inputRef}
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (inputVal.trim()) addUrl(inputVal.trim())
          }
          if (e.key === 'Backspace' && !inputVal && value.length) {
            onChange(value.slice(0, -1))
          }
        }}
        onPaste={e => {
          e.preventDefault()
          addUrl(e.clipboardData.getData('text'))
        }}
        placeholder={value.length === 0 ? '粘贴文章链接，支持公众号/知乎/头条，支持批量粘贴...' : '继续添加链接...'}
        className="w-full bg-transparent text-sm text-slate-300 placeholder-slate-600 outline-none min-w-[180px]"
        disabled={value.length >= 10}
      />
      {value.length > 0 && (
        <p className="text-[10px] text-slate-600 mt-1">{value.length}/10 · 按 Enter 或空格添加，支持一次粘贴多个</p>
      )}
    </div>
  )
}

export default function StylePage() {
  const navigate   = useNavigate()
  const [urls,       setUrls]       = useState<string[]>([])
  const [analyzing,  setAnalyzing]  = useState(false)
  const [result,     setResult]     = useState<StylePrompt | null>(null)
  const [styles,     setStyles]     = useState<StylePrompt[]>([])
  const [saving,     setSaving]     = useState(false)
  const [loadingList,setLoadingList]= useState(true)

  useEffect(() => {
    styleApi.list().then(r => setStyles(r.data.data.styles || [])).finally(() => setLoadingList(false))
  }, [])

  async function analyze() {
    const validUrls = urls.filter(u => u.trim() && u.startsWith('http'))
    if (!validUrls.length) return void toast.error('请添加至少 1 个文章链接')
    setAnalyzing(true); setResult(null)
    try {
      const res = await aiApi.analyzeStyle({ urls: validUrls })
      setResult({ ...res.data.data, source_urls: validUrls })
      toast.success('风格分析完成')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        || (err instanceof Error ? err.message : '分析失败')
      toast.error(msg)
    } finally { setAnalyzing(false) }
  }

  async function saveStyle() {
    if (!result) return
    setSaving(true)
    try {
      await styleApi.create({ ...result, source_urls: urls.filter(u => u.startsWith('http')) })
      const res = await styleApi.list()
      setStyles(res.data.data.styles || [])
      toast.success('风格已保存到风格库')
      setResult(null); setUrls([])
    } catch { toast.error('保存失败') }
    finally { setSaving(false) }
  }

  async function deleteStyle(id: number) {
    if (!confirm('确认删除此风格？')) return
    await styleApi.delete(id)
    setStyles(s => s.filter(x => (x as StylePrompt & { id: number }).id !== id))
    toast.success('已删除')
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <Palette size={20} className="text-pink-400" />
          <h1 className="section-title mb-0">风格复刻</h1>
        </div>
        <p className="section-desc">粘贴 1-10 篇文章链接，AI 深度拆解写作指纹，生成专属写作风格提示词</p>
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* 左：输入 + 结果 */}
        <div className="col-span-3 space-y-4">
          <div className="card p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-slate-300">文章链接</label>
                <span className="text-xs text-slate-500">{urls.filter(u => u.startsWith('http')).length} 个有效链接</span>
              </div>
              <UrlTagInput value={urls} onChange={setUrls} />
            </div>

            <button
              onClick={analyze}
              disabled={analyzing || urls.filter(u => u.startsWith('http')).length === 0}
              className="btn-primary w-full justify-center"
            >
              {analyzing
                ? <><Loader2 size={15} className="animate-spin" />抓取内容并分析中（约 30-60 秒）...</>
                : <><Palette size={15} />开始风格分析</>
              }
            </button>
          </div>

          {/* 分析结果 */}
          {result && (
            <div className="card p-5 space-y-4 ring-1 ring-brand-500/20 animate-slide-up">
              <div className="flex items-center gap-2">
                <Check size={16} className="text-brand-400" />
                <span className="text-sm font-semibold text-brand-400">分析完成</span>
              </div>
              <div>
                <label className="text-xs text-slate-500">风格名称</label>
                <input
                  value={result.name}
                  onChange={e => setResult(r => r ? { ...r, name: e.target.value } : r)}
                  className="input-base mt-1.5"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">一句话描述</label>
                <input
                  value={result.description}
                  onChange={e => setResult(r => r ? { ...r, description: e.target.value } : r)}
                  className="input-base mt-1.5"
                />
              </div>
              <div>
                <label className="text-xs text-slate-500">写作提示词（可直接用于生成文章）</label>
                <textarea
                  value={result.prompt_content}
                  onChange={e => setResult(r => r ? { ...r, prompt_content: e.target.value } : r)}
                  rows={6}
                  className="textarea-base mt-1.5"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={saveStyle} disabled={saving}
                  className="btn-primary flex-1 justify-center">
                  {saving ? <><Loader2 size={14} className="animate-spin" />保存中...</> : '保存到风格库'}
                </button>
                <button onClick={() => navigate('/generate')}
                  className="btn-secondary flex items-center gap-2">
                  立刻用此风格生成 <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 右：风格库 */}
        <div className="col-span-2">
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-dark-500 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-300">我的风格库</span>
              <span className="badge bg-dark-400 text-slate-400">{styles.length}</span>
            </div>

            {loadingList ? (
              <div className="p-8 text-center">
                <Loader2 size={20} className="animate-spin text-slate-500 mx-auto" />
              </div>
            ) : styles.length === 0 ? (
              <div className="p-8 text-center">
                <Palette size={24} className="mx-auto mb-2 text-slate-600" />
                <p className="text-sm text-slate-500">还没有保存的风格</p>
                <p className="text-xs text-slate-600 mt-1">分析文章后保存，在生成文章时选择</p>
              </div>
            ) : (
              <div className="divide-y divide-dark-500 max-h-[500px] overflow-y-auto">
                {styles.map((s: StylePrompt & { id?: number }) => (
                  <div key={s.id} className="p-4 hover:bg-dark-300/50 transition-colors group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-200 truncate">{s.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{s.description}</div>
                        {s.source_urls?.length > 0 && (
                          <div className="text-[10px] text-slate-600 mt-1">
                            基于 {s.source_urls.length} 篇文章
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={() => navigate('/generate', { state: { style_id: s.id } })}
                          className="p-1.5 rounded-lg hover:bg-dark-400 text-slate-500 hover:text-brand-400 transition-colors"
                          title="用此风格生成文章"
                        >
                          <ChevronRight size={13} />
                        </button>
                        <button
                          onClick={() => s.id && deleteStyle(s.id)}
                          className="p-1.5 rounded-lg hover:bg-dark-400 text-slate-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
