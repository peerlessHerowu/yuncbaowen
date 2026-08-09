import { useState, useEffect, useRef } from 'react'
import { BookOpen, Upload, Trash2, Loader2, FileText, Search, X } from 'lucide-react'
import { knowledgeApi } from '../../api'
import toast from 'react-hot-toast'
import type { KnowledgeDoc } from '@yuncbaowen/shared'

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

export default function KnowledgePage() {
  const [docs,      setDocs]      = useState<KnowledgeDoc[]>([])
  const [loading,   setLoading]   = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging,  setDragging]  = useState(false)
  const [query,     setQuery]     = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<Array<{ doc_id: number; filename: string; snippet: string; relevance: number }> | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadDocs() }, [])

  async function loadDocs() {
    setLoading(true)
    try {
      const res = await knowledgeApi.list()
      setDocs(res.data.data.docs)
    } finally { setLoading(false) }
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
    } catch {} finally { setUploading(false) }
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
    } catch {} finally { setSearching(false) }
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
        <p className="section-desc">上传资料，AI 写作时可引用你的专属知识，有据可查不跑题</p>
      </div>

      <div className="grid grid-cols-5 gap-5">
        {/* 左：上传 */}
        <div className="col-span-2 space-y-4">
          {/* 上传区 */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={`card p-8 text-center cursor-pointer transition-all border-2 border-dashed ${
              dragging ? 'border-brand-500 bg-brand-500/5' : 'border-dark-600 hover:border-dark-500 hover:bg-dark-300/30'
            }`}>
            <input ref={fileRef} type="file" className="hidden"
              accept=".txt,.md,.markdown,.pdf,.json"
              onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} />
            {uploading ? (
              <><Loader2 size={24} className="animate-spin text-brand-400 mx-auto mb-3" /><p className="text-sm text-slate-400">上传中...</p></>
            ) : (
              <>
                <Upload size={24} className="text-slate-500 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-300">拖拽文件到此处，或点击上传</p>
                <p className="text-xs text-slate-500 mt-1">支持 TXT / MD / PDF / JSON，最大 20MB</p>
              </>
            )}
          </div>

          {/* 搜索 */}
          <div className="card p-4 space-y-3">
            <div className="text-sm font-medium text-slate-300">知识库检索测试</div>
            <div className="flex gap-2">
              <input value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()}
                placeholder="输入搜索词测试检索效果..."
                className="input-base flex-1" />
              <button onClick={search} disabled={searching} className="btn-secondary shrink-0">
                {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              </button>
            </div>
            {searchResults !== null && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">找到 {searchResults.length} 条相关内容</span>
                  <button onClick={() => setSearchResults(null)} className="text-slate-500 hover:text-slate-300">
                    <X size={12} />
                  </button>
                </div>
                {searchResults.map((r, i) => (
                  <div key={i} className="bg-dark-300 rounded-lg p-3">
                    <div className="text-xs text-brand-400 mb-1 font-medium">{r.filename}</div>
                    <div className="text-xs text-slate-400 line-clamp-3">{r.snippet}</div>
                    <div className="text-[10px] text-slate-600 mt-1">相关度: {r.relevance.toFixed(3)}</div>
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
              <span className="text-sm font-medium text-slate-300">我的文档</span>
              <div className="flex items-center gap-2">
                <span className="badge bg-dark-400 text-slate-400">{docs.length} 个文件</span>
                <span className="text-xs text-slate-500">
                  共 {(docs.reduce((a, b) => a + b.file_size, 0) / 1024).toFixed(0)} KB
                </span>
              </div>
            </div>

            {loading ? (
              <div className="p-10 text-center"><Loader2 size={20} className="animate-spin text-slate-500 mx-auto" /></div>
            ) : docs.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">还没有上传任何文档</p>
                <p className="text-xs mt-1 opacity-60">上传 TXT/MD/PDF 格式的资料</p>
              </div>
            ) : (
              <div className="divide-y divide-dark-500">
                {docs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-4 px-5 py-4 hover:bg-dark-300/50 transition-colors group">
                    <div className="w-9 h-9 bg-blue-500/10 border border-blue-500/20 rounded-lg flex items-center justify-center shrink-0">
                      <FileText size={16} className="text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-200 truncate">{doc.filename}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500">{formatSize(doc.file_size)}</span>
                        <span className="text-slate-600">·</span>
                        <span className="text-xs text-slate-500">{doc.chunk_count} 个片段</span>
                        <span className="text-slate-600">·</span>
                        <span className="text-xs text-slate-500">
                          {new Date(doc.created_at).toLocaleDateString('zh-CN')}
                        </span>
                      </div>
                      {(doc.keywords as string[])?.length > 0 && (
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {((doc.keywords as string[]) || []).slice(0, 5).map((kw: string, i: number) => (
                            <span key={i} className="badge bg-dark-400 text-slate-500 text-[10px]">{kw}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={() => deleteDoc(doc.id, doc.filename)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-dark-400 text-slate-500 hover:text-red-400 transition-all">
                      <Trash2 size={14} />
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
