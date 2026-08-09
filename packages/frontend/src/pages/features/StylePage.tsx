import { useState, useEffect } from 'react'
import { Palette, Plus, Loader2, Trash2, ChevronRight, Link2 } from 'lucide-react'
import { aiApi, styleApi } from '../../api'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

interface StylePrompt { id?: number; name: string; description: string; source_urls: string[]; prompt_content: string }

export default function StylePage() {
  const [urls, setUrls]         = useState(['', '', ''])
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult]     = useState<StylePrompt | null>(null)
  const [styles, setStyles]     = useState<StylePrompt[]>([])
  const [saving, setSaving]     = useState(false)
  const [loadingList, setLoadingList] = useState(true)

  useEffect(() => {
    styleApi.list().then(r => setStyles(r.data.data.styles)).finally(() => setLoadingList(false))
  }, [])

  async function analyze() {
    const validUrls = urls.filter(u => u.trim())
    if (!validUrls.length) return void toast.error('至少输入 1 个文章链接')
    setAnalyzing(true); setResult(null)
    try {
      const res = await aiApi.analyzeStyle({ urls: validUrls })
      setResult(res.data.data)
    } catch {} finally { setAnalyzing(false) }
  }

  async function saveStyle() {
    if (!result) return
    setSaving(true)
    try {
      await styleApi.create({ ...result, source_urls: urls.filter(u => u.trim()) })
      const res = await styleApi.list()
      setStyles(res.data.data.styles)
      toast.success('风格已保存到风格库')
      setResult(null); setUrls(['', '', ''])
    } catch {} finally { setSaving(false) }
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
        <p className="section-desc">粘贴 1-5 篇标杆文章链接，AI 深度拆解写作指纹，生成专属提示词</p>
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* 左：输入区 */}
        <div className="col-span-3 space-y-4">
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-300">文章链接（1-5 篇）</span>
              {urls.length < 5 && (
                <button onClick={() => setUrls(u => [...u, ''])} className="btn-ghost text-xs">
                  <Plus size={12} />添加链接
                </button>
              )}
            </div>
            {urls.map((u, i) => (
              <div key={i} className="flex gap-2">
                <div className="flex items-center gap-2 flex-1">
                  <Link2 size={14} className="text-slate-500 shrink-0" />
                  <input
                    value={u}
                    onChange={e => setUrls(arr => arr.map((v, j) => j === i ? e.target.value : v))}
                    placeholder={`文章链接 ${i + 1}（公众号/头条/知乎等）`}
                    className="input-base"
                  />
                </div>
                {urls.length > 1 && (
                  <button onClick={() => setUrls(arr => arr.filter((_, j) => j !== i))}
                    className="text-slate-600 hover:text-red-400 transition-colors p-2">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
            <button onClick={analyze} disabled={analyzing}
              className="btn-primary w-full justify-center">
              {analyzing ? <><Loader2 size={15} className="animate-spin" />分析中...</> : <><Palette size={15} />开始风格分析</>}
            </button>
          </div>

          {/* 分析结果 */}
          {result && (
            <div className="card p-5 space-y-4 border-brand-500/30 animate-slide-up">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-brand-400">✨ 分析完成</span>
              </div>
              <div>
                <span className="text-xs text-slate-500">风格名称</span>
                <input value={result.name}
                  onChange={e => setResult(r => r ? {...r, name: e.target.value} : r)}
                  className="input-base mt-1.5" />
              </div>
              <div>
                <span className="text-xs text-slate-500">一句话描述</span>
                <input value={result.description}
                  onChange={e => setResult(r => r ? {...r, description: e.target.value} : r)}
                  className="input-base mt-1.5" />
              </div>
              <div>
                <span className="text-xs text-slate-500">写作提示词（可直接用于 AI 写作）</span>
                <textarea value={result.prompt_content}
                  onChange={e => setResult(r => r ? {...r, prompt_content: e.target.value} : r)}
                  rows={6} className="textarea-base mt-1.5" />
              </div>
              <div className="flex gap-3">
                <button onClick={saveStyle} disabled={saving}
                  className="btn-primary flex-1 justify-center">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  {saving ? '保存中...' : '保存到风格库'}
                </button>
                <button onClick={() => window.open('/generate', '_self')}
                  className="btn-secondary flex items-center gap-2">
                  用此风格生成 <ChevronRight size={14} />
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
              <div className="p-8 text-center"><Loader2 size={20} className="animate-spin text-slate-500 mx-auto" /></div>
            ) : styles.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">还没有保存的风格</div>
            ) : (
              <div className="divide-y divide-dark-500 max-h-96 overflow-y-auto">
                {styles.map((s: StylePrompt & { id?: number; created_at?: string }) => (
                  <div key={s.id} className="p-4 hover:bg-dark-300/50 transition-colors group">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-200 truncate">{s.name}</div>
                        <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{s.description}</div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => navigate(`/generate?style_id=${s.id}`)}
                          className="p-1 rounded hover:bg-dark-400 text-slate-500 hover:text-brand-400 transition-colors"
                          title="用此风格生成">
                          <ChevronRight size={13} />
                        </button>
                        <button onClick={() => s.id && deleteStyle(s.id)}
                          className="p-1 rounded hover:bg-dark-400 text-slate-500 hover:text-red-400 transition-colors">
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

function navigate(path: string) { window.location.href = path }
