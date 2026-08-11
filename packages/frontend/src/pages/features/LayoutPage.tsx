import { useState } from 'react'
import { FileText, Copy, Check, Palette, Smartphone, Monitor, Wand2, Loader2 } from 'lucide-react'
import { aiApi } from '../../api'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

// ── 排版主题配置 ────────────────────────────────────────────────
const THEMES = [
  { id: 'default',  label: '简约黑白', bg: '#ffffff', text: '#1a1a1a', accent: '#000000',   heading: '#000000' },
  { id: 'biz-blue', label: '商务蓝',   bg: '#f8faff', text: '#1e293b', accent: '#1d4ed8',   heading: '#1e40af' },
  { id: 'warm',     label: '暖橙调',   bg: '#fffbf5', text: '#1c1008', accent: '#ea580c',   heading: '#c2410c' },
  { id: 'mint',     label: '清新绿',   bg: '#f0fdf4', text: '#14532d', accent: '#16a34a',   heading: '#15803d' },
  { id: 'purple',   label: '优雅紫',   bg: '#faf5ff', text: '#2e1065', accent: '#7c3aed',   heading: '#6d28d9' },
  { id: 'dark',     label: '暗夜紫',   bg: '#0f0d1a', text: '#e2d9f3', accent: '#a78bfa',   heading: '#c4b5fd' },
]

type ThemeConfig = typeof THEMES[0]

// ── Markdown 渲染（带主题颜色注入）────────────────────────────
function renderMarkdown(md: string, theme: ThemeConfig, _fontSize: number): string {
  const lineH = '1.9'
  const paraMargin = '0.9em'

  return md
    .replace(/^# (.+)$/gm, `<h1 style="font-size:1.65em;font-weight:900;color:${theme.heading};margin:1.2em 0 0.5em;line-height:1.3;border-bottom:2px solid ${theme.accent}30;padding-bottom:0.3em">$1</h1>`)
    .replace(/^## (.+)$/gm, `<h2 style="font-size:1.25em;font-weight:800;color:${theme.heading};margin:1.1em 0 0.4em;line-height:1.4;padding-left:0.6em;border-left:3px solid ${theme.accent}">$1</h2>`)
    .replace(/^### (.+)$/gm, `<h3 style="font-size:1.05em;font-weight:700;color:${theme.heading};margin:0.8em 0 0.3em;line-height:1.4">$1</h3>`)
    .replace(/\*\*(.+?)\*\*/g, `<strong style="color:${theme.accent};font-weight:700">$1</strong>`)
    .replace(/\*(.+?)\*/g, '<em style="font-style:italic">$1</em>')
    .replace(/`(.+?)`/g, `<code style="background:${theme.accent}15;color:${theme.accent};padding:0.1em 0.35em;border-radius:3px;font-family:monospace;font-size:0.9em">$1</code>`)
    .replace(/^> (.+)$/gm, `<blockquote style="border-left:3px solid ${theme.accent};padding:0.6em 0.8em 0.6em 1em;margin:0.8em 0;background:${theme.accent}08;border-radius:0 6px 6px 0;color:${theme.text}cc;font-style:italic">$1</blockquote>`)
    .replace(/^[-*] (.+)$/gm, `<li style="margin:0.3em 0;padding-left:0.3em;line-height:${lineH}">$1</li>`)
    .replace(/(<li.*<\/li>\n?)+/g, `<ul style="padding-left:1.4em;margin:${paraMargin} 0;list-style-type:disc">$&</ul>`)
    .replace(/^(\d+)\. (.+)$/gm, `<li style="margin:0.3em 0;padding-left:0.3em;line-height:${lineH}">$2</li>`)
    .replace(/\n\n/g, `</p><p style="margin:${paraMargin} 0;line-height:${lineH}">`)
    .replace(/\n/g, '<br>')
}

// ── 富文本复制（真正能粘贴到公众号的方式）────────────────────
function copyRichText(html: string) {
  const wrapper = document.createElement('div')
  wrapper.style.cssText = 'position:absolute;left:-9999px;pointer-events:none'
  wrapper.innerHTML = html
  document.body.appendChild(wrapper)

  const range = document.createRange()
  range.selectNodeContents(wrapper)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)

  try {
    document.execCommand('copy')
    return true
  } catch {
    return false
  } finally {
    selection?.removeAllRanges()
    document.body.removeChild(wrapper)
  }
}

export default function LayoutPage() {
  const [md,        setMd]        = useState('')
  const [theme,     setTheme]     = useState(THEMES[0])
  const [fontSize,  setFontSize]  = useState(16)
  const [preview,   setPreview]   = useState<'split' | 'phone' | 'full'>('split')
  const [formatting,setFormatting]= useState(false)
  const [copiedBtn, setCopiedBtn] = useState<string | null>(null)

  const rendered = renderMarkdown(md, theme, fontSize)

  const fullHtml = `<section style="font-family:'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;line-height:1.9;font-size:${fontSize}px;color:${theme.text};max-width:677px;margin:0 auto"><p style="margin:0.9em 0;line-height:1.9">${rendered}</p></section>`

  async function handleAiFormat() {
    if (!md.trim()) return void toast.error('请先输入文章内容')
    setFormatting(true)
    try {
      const res = await aiApi.format(md.trim())
      if (res.data.success) {
        setMd(res.data.data.formatted)
        toast.success('AI 排版完成')
      }
    } catch { toast.error('AI 排版失败，请重试') }
    finally { setFormatting(false) }
  }

  async function handleCopyWechat() {
    const ok = copyRichText(fullHtml)
    if (ok) {
      setCopiedBtn('wechat')
      toast.success('已复制富文本，直接粘贴到公众号编辑器即可')
      setTimeout(() => setCopiedBtn(null), 2500)
    } else {
      // 降级：复制 HTML 源码
      await navigator.clipboard.writeText(fullHtml)
      toast.success('已复制 HTML 源码（部分浏览器不支持直接富文本复制）')
    }
  }

  async function handleCopyMd() {
    await navigator.clipboard.writeText(md)
    setCopiedBtn('md')
    toast.success('已复制 Markdown 源码')
    setTimeout(() => setCopiedBtn(null), 2000)
  }

  return (
    <div className="space-y-4 animate-fade-in h-full flex flex-col">
      {/* 页面头部 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <FileText size={20} className="text-violet-400" />
            <h1 className="section-title mb-0">文章排版</h1>
          </div>
          <p className="section-desc">Markdown 实时渲染，6 套配色主题，一键复制到公众号</p>
        </div>
      </div>

      {/* 工具栏 */}
      <div className="flex items-center gap-3 flex-wrap">

        {/* AI 排版按钮 */}
        <button onClick={handleAiFormat} disabled={formatting || !md.trim()}
          className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
          {formatting ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
          {formatting ? 'AI 排版中...' : 'AI 智能排版'}
        </button>

        {/* 主题选择 */}
        <div className="flex items-center gap-1.5">
          <Palette size={13} className="text-slate-500" />
          {THEMES.map(t => (
            <button key={t.id} onClick={() => setTheme(t)} title={t.label}
              className={cn(
                'w-5 h-5 rounded-full border-2 transition-all hover:scale-110',
                theme.id === t.id ? 'border-brand-400 scale-125' : 'border-dark-600 hover:border-slate-400'
              )}
              style={{ background: t.bg === '#0f0d1a' ? '#1a1535' : t.bg, boxShadow: theme.id === t.id ? `0 0 0 1px ${t.accent}` : 'none' }} />
          ))}
          <span className="text-[10px] text-slate-500 ml-0.5">{theme.label}</span>
        </div>

        {/* 字号 */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-slate-500">字号</span>
          {[14, 16, 18].map(n => (
            <button key={n} onClick={() => setFontSize(n)}
              className={cn('w-7 h-6 rounded text-xs font-medium transition-all',
                fontSize === n ? 'bg-dark-500 text-slate-100' : 'text-slate-500 hover:text-slate-300'
              )}>{n}</button>
          ))}
        </div>

        {/* 预览模式 */}
        <div className="flex bg-dark-300 rounded-lg p-0.5 ml-auto">
          <button onClick={() => setPreview('split')}
            className={cn('px-2.5 py-1 rounded-md text-xs transition-all flex items-center gap-1',
              preview === 'split' ? 'bg-dark-500 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            )}>
            <Monitor size={11} />分屏
          </button>
          <button onClick={() => setPreview('phone')}
            className={cn('px-2.5 py-1 rounded-md text-xs transition-all flex items-center gap-1',
              preview === 'phone' ? 'bg-dark-500 text-slate-100' : 'text-slate-400 hover:text-slate-200'
            )}>
            <Smartphone size={11} />手机
          </button>
        </div>

        {/* 操作按钮 */}
        <button onClick={handleCopyMd}
          className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
          {copiedBtn === 'md' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
          复制 MD
        </button>
        <button onClick={handleCopyWechat}
          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
          {copiedBtn === 'wechat' ? <Check size={12} /> : <Copy size={12} />}
          复制到公众号
        </button>
      </div>

      {/* 内容区 */}
      <div className={cn('flex-1 min-h-0', preview === 'split' ? 'grid grid-cols-2 gap-4' : 'flex gap-5 items-start')}>

        {/* 编辑区 */}
        <div className={cn('card overflow-hidden flex flex-col', preview === 'phone' ? 'flex-1' : '')}>
          <div className="px-4 py-2 border-b border-dark-500 flex items-center justify-between">
            <span className="text-xs text-slate-500">Markdown 编辑</span>
            <span className="text-xs text-slate-600">{md.length} 字</span>
          </div>
          <textarea
            value={md}
            onChange={e => setMd(e.target.value)}
            placeholder={'# 文章标题\n\n## 第一节\n\n正文内容，**重要内容**加粗...\n\n> 引用语句\n\n- 列表项1\n- 列表项2'}
            className="flex-1 bg-transparent border-none outline-none resize-none p-4 text-sm text-slate-200 placeholder-slate-700 font-mono leading-relaxed min-h-[400px]"
          />
          {!md && (
            <div className="px-4 pb-3 text-xs text-slate-600">
              提示：从「创作历史」或其他功能复制内容到这里
            </div>
          )}
        </div>

        {/* 预览区 */}
        {preview === 'split' ? (
          /* 分屏预览 */
          <div className="card overflow-hidden flex flex-col">
            <div className="px-4 py-2 border-b border-dark-500 text-xs text-slate-500">
              预览 · {theme.label} · {fontSize}px
            </div>
            <div className="flex-1 overflow-y-auto p-6 min-h-[400px]"
              style={{ background: theme.bg, color: theme.text, fontSize: `${fontSize}px` }}>
              {md ? (
                <div dangerouslySetInnerHTML={{ __html: `<p style="margin:0.9em 0;line-height:1.9">${rendered}</p>` }} />
              ) : (
                <div style={{ color: 'rgba(150,150,150,.4)', textAlign: 'center', paddingTop: '80px', fontSize: '14px' }}>
                  在左侧输入 Markdown 即可预览排版效果
                </div>
              )}
            </div>
          </div>
        ) : (
          /* 手机预览 */
          <div className="flex flex-col items-center shrink-0">
            <p className="text-xs text-slate-500 mb-3">手机预览效果</p>
            {/* 手机外壳 */}
            <div className="relative" style={{ width: 320 }}>
              {/* 手机边框 */}
              <div className="rounded-[2.5rem] border-[8px] border-slate-700 bg-slate-800 shadow-2xl overflow-hidden"
                style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.05), inset 0 0 0 1px rgba(255,255,255,0.05)' }}>
                {/* 刘海 */}
                <div className="bg-slate-800 py-2 flex justify-center">
                  <div className="w-20 h-5 bg-slate-900 rounded-full" />
                </div>
                {/* 屏幕内容 */}
                <div className="overflow-y-auto"
                  style={{
                    height: 560,
                    background: theme.bg,
                    color: theme.text,
                    fontSize: 14,
                    padding: '16px',
                    lineHeight: 1.8,
                  }}>
                  {md ? (
                    <div dangerouslySetInnerHTML={{ __html: `<p style="margin:0.7em 0;line-height:1.8">${renderMarkdown(md, theme, 14)}</p>` }} />
                  ) : (
                    <div style={{ color: 'rgba(150,150,150,.4)', textAlign: 'center', paddingTop: '60px', fontSize: '13px' }}>
                      左侧输入文章内容
                    </div>
                  )}
                </div>
                {/* 底部横条 */}
                <div className="bg-slate-800 py-2 flex justify-center">
                  <div className="w-24 h-1 bg-slate-600 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
