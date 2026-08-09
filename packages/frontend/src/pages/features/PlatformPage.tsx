import { useState } from 'react'
import { Globe, Loader2, Copy, Check } from 'lucide-react'
import { aiApi } from '../../api'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

const PLATFORMS = [
  { id: 'weixin',       label: '公众号',   icon: '💬', desc: '1000-3000字，深度阅读' },
  { id: 'xiaohongshu',  label: '小红书',   icon: '📕', desc: '300-500字，emoji风格' },
  { id: 'weibo',        label: '微博',     icon: '🔴', desc: '140字内，热点话题' },
  { id: 'zhihu',        label: '知乎',     icon: '🔵', desc: '专业深度，有逻辑' },
  { id: 'douyin',       label: '抖音口播', icon: '⚫', desc: '口语化，节奏感强' },
  { id: 'pyq',          label: '朋友圈',   icon: '🌸', desc: '50-150字，情感共鸣' },
  { id: 'shipinhao',    label: '视频号',   icon: '📹', desc: '标题党+简短文案' },
]

export default function PlatformPage() {
  const [source,     setSource]   = useState('')
  const [selected,   setSelected] = useState<string[]>(['weixin','xiaohongshu','weibo','zhihu'])
  const [results,    setResults]  = useState<Record<string, string>>({})
  const [loading,    setLoading]  = useState(false)
  const [copied,     setCopied]   = useState<string | null>(null)

  function togglePlatform(id: string) {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  }

  async function generate() {
    if (!source.trim()) return void toast.error('请输入原始内容')
    if (!selected.length) return void toast.error('请选择至少一个平台')
    setLoading(true); setResults({})
    try {
      const res = await aiApi.generatePlatforms({ content: source.trim(), platforms: selected as never[] })
      setResults(res.data.data.results)
      toast.success(`已生成 ${Object.keys(res.data.data.results).length} 个平台版本`)
    } catch {} finally { setLoading(false) }
  }

  async function copyText(id: string) {
    await navigator.clipboard.writeText(results[id])
    setCopied(id); toast.success('已复制')
    setTimeout(() => setCopied(null), 2000)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1">
          <Globe size={20} className="text-indigo-400" />
          <h1 className="section-title mb-0">多平台推文</h1>
        </div>
        <p className="section-desc">一份内容，一键改写为 7 个平台专属文案，各自适配调性与格式</p>
      </div>

      {/* 原始内容 */}
      <div className="card p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">原始内容 / 公众号正文</label>
          <textarea value={source} onChange={e => setSource(e.target.value)} rows={6}
            placeholder="粘贴你的公众号文章或核心内容..."
            className="textarea-base" />
        </div>

        {/* 平台选择 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium text-slate-300">选择目标平台</span>
            <span className="badge bg-dark-400 text-slate-500">{selected.length}/{PLATFORMS.length}</span>
            <button onClick={() => setSelected(PLATFORMS.map(p => p.id))} className="btn-ghost text-xs ml-auto">全选</button>
            <button onClick={() => setSelected([])} className="btn-ghost text-xs">清空</button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {PLATFORMS.map(p => (
              <button key={p.id} onClick={() => togglePlatform(p.id)}
                className={cn('p-3 rounded-xl border text-left transition-all',
                  selected.includes(p.id)
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
                    : 'bg-dark-300 border-dark-500 text-slate-400 hover:border-dark-600'
                )}>
                <div className="text-base mb-1">{p.icon}</div>
                <div className="font-medium text-xs">{p.label}</div>
                <div className="text-[10px] opacity-60 mt-0.5">{p.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <button onClick={generate} disabled={loading || !source.trim() || !selected.length}
          className="btn-primary w-full justify-center">
          {loading ? <><Loader2 size={15} className="animate-spin" />生成中...</> : <><Globe size={15} />一键生成所有平台文案</>}
        </button>
      </div>

      {/* 结果 */}
      {Object.keys(results).length > 0 && (
        <div className="grid grid-cols-2 gap-4 animate-slide-up">
          {PLATFORMS.filter(p => results[p.id]).map(p => (
            <div key={p.id} className="card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-dark-500">
                <div className="flex items-center gap-2">
                  <span>{p.icon}</span>
                  <span className="text-sm font-medium text-slate-200">{p.label}</span>
                  <span className="text-xs text-slate-500">{results[p.id].length} 字</span>
                </div>
                <button onClick={() => copyText(p.id)} className="btn-ghost text-xs p-1.5">
                  {copied === p.id ? <Check size={13} className="text-brand-400" /> : <Copy size={13} />}
                </button>
              </div>
              <div className="p-4 text-sm text-slate-300 leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                {results[p.id]}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
