import { useState } from 'react'
import { FileText, Copy, Palette } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

const THEMES = [
  { id: 'dark-default', label: '深夜黑', bg: '#0a0a0f', text: '#f1f5f9', accent: '#7c3aed' },
  { id: 'pure-white',   label: '极简白', bg: '#ffffff', text: '#1a1a1a', accent: '#16a34a' },
  { id: 'warm-orange',  label: '暖橙调', bg: '#fffbf5', text: '#1c1008', accent: '#ea580c' },
  { id: 'mint-green',   label: '薄荷绿', bg: '#f0fdf4', text: '#14532d', accent: '#16a34a' },
  { id: 'deep-blue',    label: '深海蓝', bg: '#0f172a', text: '#e2e8f0', accent: '#3b82f6' },
  { id: 'rose-pink',    label: '玫瑰粉', bg: '#fff1f2', text: '#4c0519', accent: '#e11d48' },
]

function renderMarkdown(md: string): string {
  return md
    .replace(/^# (.+)$/gm, '<h1 style="font-size:1.6em;font-weight:900;margin:1.2em 0 .6em">$1</h1>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:1.3em;font-weight:800;margin:1em 0 .5em">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:1.1em;font-weight:700;margin:.8em 0 .4em">$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(0,0,0,.1);padding:.1em .3em;border-radius:3px;font-family:monospace">$1</code>')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid;padding-left:.8em;margin:.5em 0;opacity:.8">$1</blockquote>')
    .replace(/^[-*] (.+)$/gm, '<li style="margin:.3em 0;padding-left:.5em">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li style="margin:.3em 0;list-style-type:decimal;padding-left:.5em">$2</li>')
    .replace(/\n\n/g, '</p><p style="margin:.8em 0">')
    .replace(/\n/g, '<br>')
}

export default function LayoutPage() {
  const [md,       setMd]       = useState('')
  const [theme,    setTheme]    = useState(THEMES[0])
  const [fontSize, setFontSize] = useState(16)
  const [tab,      setTab]      = useState<'edit' | 'preview'>('edit')

  const rendered = renderMarkdown(md)

  async function copyHtml() {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
body{font-family:'PingFang SC','Microsoft YaHei',sans-serif;line-height:1.8;padding:2em;max-width:700px;margin:0 auto;
background:${theme.bg};color:${theme.text};font-size:${fontSize}px}
h1,h2,h3{color:${theme.accent}}a{color:${theme.accent}}
</style></head><body><p>${rendered}</p></body></html>`
    await navigator.clipboard.writeText(html)
    toast.success('已复制 HTML，可直接粘贴到公众号编辑器')
  }

  async function copyCover() {
    // 生成封面文字卡片
    const title = md.split('\n').find(l => l.startsWith('# '))?.slice(2) || '文章标题'
    const coverHtml = `<div style="width:900px;height:383px;background:linear-gradient(135deg,${theme.accent},${theme.bg});
      display:flex;align-items:center;justify-content:center;padding:40px;box-sizing:border-box">
      <div style="text-align:center">
        <div style="font-size:32px;font-weight:900;color:#fff;line-height:1.3;max-width:600px">${title}</div>
        <div style="margin-top:16px;font-size:14px;color:rgba(255,255,255,.7)">云创爆文出品</div>
      </div></div>`
    await navigator.clipboard.writeText(coverHtml)
    toast.success('封面 HTML 已复制，尺寸 900×383')
  }

  return (
    <div className="space-y-4 animate-fade-in h-full flex flex-col">
      <div className="section-header mb-0">
        <div className="flex items-center gap-3 mb-1">
          <FileText size={20} className="text-violet-400" />
          <h1 className="section-title mb-0">文章排版</h1>
        </div>
        <p className="section-desc">Markdown 实时渲染，多套配色，一键复制到公众号</p>
      </div>

      {/* 工具栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Tab */}
        <div className="flex bg-dark-300 rounded-lg p-0.5">
          {(['edit','preview'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                tab === t ? 'bg-dark-500 text-slate-100' : 'text-slate-400 hover:text-slate-200'
              )}>
              {t === 'edit' ? '✏️ 编辑' : '👁️ 预览'}
            </button>
          ))}
        </div>

        {/* 主题 */}
        <div className="flex items-center gap-1.5">
          <Palette size={14} className="text-slate-500" />
          {THEMES.map(t => (
            <button key={t.id} onClick={() => setTheme(t)} title={t.label}
              className={cn('w-5 h-5 rounded-full border-2 transition-all',
                theme.id === t.id ? 'border-slate-300 scale-125' : 'border-transparent hover:border-slate-500'
              )}
              style={{ background: t.bg, outlineColor: t.accent }} />
          ))}
          <span className="text-xs text-slate-500 ml-1">{theme.label}</span>
        </div>

        {/* 字号 */}
        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-slate-400">字号</span>
          {[14, 16, 18].map(n => (
            <button key={n} onClick={() => setFontSize(n)}
              className={cn('w-7 h-6 rounded text-xs font-medium transition-all',
                fontSize === n ? 'bg-dark-500 text-slate-100' : 'text-slate-500 hover:text-slate-300'
              )}>{n}</button>
          ))}
        </div>

        {/* 操作 */}
        <button onClick={copyCover} className="btn-secondary text-xs py-1.5 px-3">
          🖼️ 复制封面
        </button>
        <button onClick={copyHtml} className="btn-primary text-xs py-1.5 px-3">
          <Copy size={12} />复制到公众号
        </button>
      </div>

      {/* 内容区 */}
      <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
        {/* 编辑区 */}
        <div className={cn('card overflow-hidden flex flex-col', tab === 'preview' && 'hidden md:flex')}>
          <div className="px-4 py-2 border-b border-dark-500 text-xs text-slate-500">
            Markdown 源码 · {md.length} 字
          </div>
          <textarea
            value={md}
            onChange={e => setMd(e.target.value)}
            placeholder="# 文章标题&#10;&#10;## 第一节&#10;&#10;正文内容..."
            className="flex-1 bg-transparent border-none outline-none resize-none p-4 text-sm text-slate-200 placeholder-slate-600 font-mono leading-relaxed"
          />
        </div>

        {/* 预览区 */}
        <div className={cn('card overflow-hidden flex flex-col', tab === 'edit' && 'hidden md:flex')}>
          <div className="px-4 py-2 border-b border-dark-500 text-xs text-slate-500">
            预览效果 · 主题：{theme.label}
          </div>
          <div className="flex-1 overflow-y-auto p-6"
            style={{ background: theme.bg, color: theme.text, fontSize: `${fontSize}px`, lineHeight: '1.9' }}>
            {md ? (
              <div dangerouslySetInnerHTML={{ __html: `<p style="margin:.8em 0">${rendered}</p>` }} />
            ) : (
              <div style={{ color: 'rgba(150,150,150,.5)', textAlign: 'center', paddingTop: '60px' }}>
                在左侧输入 Markdown 即可实时预览
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
