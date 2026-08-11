import { useState, useEffect, useRef } from 'react'
import { BookOpen, Upload, Trash2, Loader2, FileText, Search, X, Link2, AlignLeft, Check } from 'lucide-react'
import { knowledgeApi } from '../../api'
import toast from 'react-hot-toast'
import type { KnowledgeDoc } from '@yuncbaowen/shared'
import { cn } from '../../utils/cn'

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

type AddMode = 'file' | 'url' | 'text'

export default function KnowledgePage() {
  const [docs,         setDocs]         = useState<KnowledgeDoc[]>([])
  const [loading,      setLoading]      = useState(true)
  const [addMode,      setAddMode]      = useState<AddMode>('file')
  const [uploading,    setUploading]    = useState(false)
  const [dragging,     setDragging]     = useState(false)
  const [urlInput,     setUrlInput]     = useState('')
  const [textInput,    setTextInput]    = useState('')
  const [titleInput,   setTitleInput]   = useState('')
  const [query,        setQuery]        = useState('')
  const [searching,    setSearching]    = useState(false)
  const [searchResults,setSearchResults]= useState<Array<{ doc_id: number; filename: string; snippet: string; relevance: number }> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadDocs() }, [])

  async function loadDocs() {
    setLoading(true)
    try { setDocs((await knowledgeApi.list()).data.data.docs) }
    finally { setLoading(false) }
  }

  async function uploadFile(file: File) {
    const allowed = ['.txt', '.md', '.pdf', '.json', '.markdown']
    const ext = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!allowed.includes(ext)) return void toast.error('仅支持 TXT / MD / PDF / JSON 格式')
    if (file.size > 20 * 1024 * 1024) return void toast.error('文件不能超过 20MB')
    setUploading(true)
    try {
      await knowledgeApi.upload(file)
      toast.success(`「${file.name}」上传成功`)
      await loadDocs()
    } catch { toast.error('上传失败') }
    finally { setUploading(false) }
  }

  async function importUrl() {
    if (!urlInput.trim().startsWith('http')) return void toast.error('请输入有效的 URL')
    setUploading(true)
    try {
      const res = await knowledgeApi.importUrl(urlInput.trim())
      toast.success(`已导入：${res.data.data.filename}`)
      setUrlInput('')
      await loadDocs()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '导入失败'
      toast.error(msg)
    } finally { setUploading(false) }
  }

  async function importText() {
    if (!textInput.trim() || textInput.trim().length < 20) return void toast.error('内容至少 20 字')
    setUploading(true)
    try {
      await knowledgeApi.importText(textInput.trim(), titleInput.trim() || undefined)
      toast.success('文本已导入知识库')
      setTextInput(''); setTitleInput('')
      await loadDocs()
    } catch { toast.error('导入失败') }
    finally { setUploading(false) }
  }

  async function deleteDoc(id: number, name: string) {
    if (!confirm(`确认删除「${name}」？`)) return
    await knowledgeApi.delete(id)
    setDocs(d => d.filter(x => x.id !== id))
    toast.success('已删除')
  }

  async function search() {
    if (!query.trim()) return void toast.error('请输入搜索词')
    setSearching(true)
    try {
      const res = await knowledgeApi.search(query.trim())
      setSearchResults(res.data.data.results)
      if (!res.data.data.results.length) toast('未找到相关内容', { icon: '🔍' })
    } catch { } finally { setSearching(false) }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <BookOpen size={20} className="text-blue-400" />
          <h1 className="section-title mb-0">本地知识库</h1>
        </div>
        <p className="section-desc">上传文件、粘贴文本或导入链接，AI 生成文章时自动引用你的专属知识</p>
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* 左：添加文档 */}
        <div className="col-span-2 space-y-4">

          {/* 添加方式 Tab */}
          <div className="card overflow-hidden">
            <div className="flex border-b border-dark-500">
              {([
                { id: 'file' as AddMode, label: '上传文件', icon: Upload },
                { id: 'url'  as AddMode, label: '链接导入', icon: Link2 },
                { id: 'text' as AddMode, label: '粘贴文本', icon: AlignLeft },
              ]).map(tab => (
                <button key={tab.id} onClick={() => setAddMode(tab.id)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-all',
                    addMode === tab.id
                      ? 'bg-dark-400 text-slate-100 border-b-2 border-brand-500'
                      : 'text-slate-400 hover:text-slate-200'
                  )}>
                  <tab.icon size={13} />{tab.label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {/* 上传文件 */}
              {addMode === 'file' && (
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true) }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => fileRef.current?.click()}
                  className={cn(
                    'min-h-[140px] flex flex-col items-center justify-center rounded-xl border-2 border-dashed cursor-pointer transition-all',
                    dragging ? 'border-brand-500 bg-brand-500/5' : 'border-dark-600 hover:border-dark-500 hover:bg-dark-300/30'
                  )}>
                  <input ref={fileRef} type="file" className="hidden"
                    accept=".txt,.md,.markdown,.pdf,.json"
                    onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} />
                  {uploading ? (
                    <><Loader2 size={20} className="animate-spin text-brand-400 mb-2" /><p className="text-sm text-slate-400">处理中...</p></>
                  ) : (
                    <><Upload size={20} className="text-slate-500 mb-2" />
                    <p className="text-sm font-medium text-slate-300">拖拽文件或点击上传</p>
                    <p className="text-xs text-slate-500 mt-1">TXT / MD / PDF / JSON，≤ 20MB</p></>
                  )}
                </div>
              )}

              {/* URL 导入 */}
              {addMode === 'url' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400">支持公众号、知乎、头条等主流平台链接</p>
                  <input
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && importUrl()}
                    placeholder="https://mp.weixin.qq.com/s/..."
                    className="input-base"
                  />
                  <button onClick={importUrl} disabled={uploading || !urlInput.trim()}
                    className="btn-primary w-full justify-center text-sm">
                    {uploading ? <><Loader2 size={13} className="animate-spin" />抓取中...</> : <><Link2 size={13} />导入链接内容</>}
                  </button>
                </div>
              )}

              {/* 粘贴文本 */}
              {addMode === 'text' && (
                <div className="space-y-3">
                  <input
                    value={titleInput}
                    onChange={e => setTitleInput(e.target.value)}
                    placeholder="文档标题（可选）"
                    className="input-base text-sm"
                  />
                  <textarea
                    value={textInput}
                    onChange={e => setTextInput(e.target.value)}
                    placeholder="粘贴文章内容、笔记、资料..."
                    rows={6}
                    className="textarea-base text-sm"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">{textInput.length} 字</span>
                    <button onClick={importText} disabled={uploading || textInput.trim().length < 20}
                      className="btn-primary text-sm py-2 px-4">
                      {uploading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      {uploading ? '导入中...' : '保存到知识库'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 搜索测试 */}
          <div className="card p-4 space-y-3">
            <div className="text-sm font-medium text-slate-300">检索测试</div>
            <div className="flex gap-2">
              <input value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()}
                placeholder="测试知识库检索效果..."
                className="input-base flex-1" />
              <button onClick={search} disabled={searching} className="btn-secondary px-3">
                {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              </button>
            </div>
            {searchResults !== null && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">找到 {searchResults.length} 条</span>
                  <button onClick={() => setSearchResults(null)}><X size={12} className="text-slate-500" /></button>
                </div>
                {searchResults.map((r, i) => (
                  <div key={i} className="bg-dark-300 rounded-lg p-3">
                    <div className="text-xs text-brand-400 mb-1 font-medium truncate">{r.filename}</div>
                    <div className="text-xs text-slate-400 line-clamp-3">{r.snippet}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右：文档列表 */}
        <div className="col-span-3">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-dark-500">
              <span className="text-sm font-medium text-slate-300">我的知识库</span>
              <div className="flex items-center gap-2">
                <span className="badge bg-dark-400 text-slate-400">{docs.length} 个</span>
                <span className="text-xs text-slate-500">
                  {(docs.reduce((a, b) => a + b.file_size, 0) / 1024).toFixed(0)} KB
                </span>
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center"><Loader2 size={20} className="animate-spin text-slate-500 mx-auto" /></div>
            ) : docs.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <BookOpen size={32} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium text-slate-400">知识库还是空的</p>
                <p className="text-xs mt-1 opacity-60">上传文件、导入链接或粘贴文本</p>
              </div>
            ) : (
              <div className="divide-y divide-dark-500 max-h-[600px] overflow-y-auto">
                {docs.map(doc => (
                  <div key={doc.id} className="flex items-start gap-3 px-5 py-4 hover:bg-dark-300/50 transition-colors group">
                    <div className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                      (doc.file_path as string).startsWith('url:') ? 'bg-purple-500/10 border border-purple-500/20' :
                      (doc.file_path as string).startsWith('text:') ? 'bg-teal-500/10 border border-teal-500/20' :
                      'bg-blue-500/10 border border-blue-500/20'
                    )}>
                      {(doc.file_path as string).startsWith('url:') ? <Link2 size={15} className="text-purple-400" /> :
                       (doc.file_path as string).startsWith('text:') ? <AlignLeft size={15} className="text-teal-400" /> :
                       <FileText size={15} className="text-blue-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-200 truncate">{doc.filename}</div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-slate-500">{formatSize(doc.file_size)}</span>
                        <span className="text-slate-700">·</span>
                        <span className="text-xs text-slate-500">{doc.chunk_count} 个片段</span>
                        <span className="text-slate-700">·</span>
                        <span className="text-xs text-slate-500">
                          {new Date(doc.created_at).toLocaleDateString('zh-CN')}
                        </span>
                      </div>
                      {(doc.keywords as string[])?.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {((doc.keywords as string[]) || []).slice(0, 6).map((kw: string, i: number) => (
                            <span key={i} className="badge bg-dark-400 text-slate-500 text-[10px]">{kw}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => deleteDoc(doc.id, doc.filename)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-dark-400 text-slate-500 hover:text-red-400 transition-all mt-0.5">
                      <Trash2 size={13} />
                    </button>
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
