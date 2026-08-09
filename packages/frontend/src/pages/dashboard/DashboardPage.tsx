import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  TrendingUp, Type, Palette, PenTool, RefreshCw,
  Globe, Wand2, ScanText,
  Zap, ChevronRight, Loader2,
} from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { creationApi, authApi } from '../../api'
import toast from 'react-hot-toast'

interface Stats {
  total_creations: number
  total_styles: number
  total_docs: number
  recent_creations: Array<{ id: number; type: string; title: string; created_at: string }>
}

const FEATURE_CARDS = [
  { to: '/trending', icon: TrendingUp, label: '热点追踪',   desc: '全网热榜，破万置顶',   color: 'from-orange-500/20 to-amber-500/20', iconColor: 'text-orange-400' },
  { to: '/title',    icon: Type,       label: '爆款标题',   desc: '10+ 套路批量生成',     color: 'from-purple-500/20 to-violet-500/20', iconColor: 'text-purple-400' },
  { to: '/style',    icon: Palette,    label: '风格复刻',   desc: 'AI 深度拆解写作指纹', color: 'from-pink-500/20 to-rose-500/20',    iconColor: 'text-pink-400' },
  { to: '/generate', icon: PenTool,    label: '定向生成',   desc: '选风格+主题一键成文', color: 'from-blue-500/20 to-cyan-500/20',    iconColor: 'text-blue-400' },
  { to: '/rewrite',  icon: RefreshCw,  label: '二次仿写',   desc: '降重改写保语义',      color: 'from-teal-500/20 to-green-500/20',   iconColor: 'text-teal-400' },
  { to: '/platform', icon: Globe,      label: '多平台推文', desc: '7 平台一键适配',      color: 'from-indigo-500/20 to-blue-500/20',  iconColor: 'text-indigo-400' },
  { to: '/deai',     icon: Wand2,      label: '去 AI 味',  desc: '检测闭环自动改写',    color: 'from-brand-500/20 to-emerald-500/20', iconColor: 'text-brand-400' },
  { to: '/detect',   icon: ScanText,   label: '内容检测',   desc: '四维报告定位扣分',    color: 'from-cyan-500/20 to-sky-500/20',     iconColor: 'text-cyan-400' },
]

const TYPE_LABELS: Record<string, string> = {
  title: '爆款标题', article: '定向生成', rewrite: '二次仿写',
  platform: '多平台推文', deai: '去AI味', style: '风格分析',
}

export default function DashboardPage() {
  const navigate  = useNavigate()
  const { user, updateUser } = useAuthStore()
  const [stats,    setStats]    = useState<Stats | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [cardKey,  setCardKey]  = useState('')
  const [activating, setActivating] = useState(false)

  useEffect(() => {
    creationApi.stats().then(r => setStats(r.data.data)).finally(() => setLoading(false))
  }, [])

  async function handleActivate() {
    if (!cardKey.trim()) return
    setActivating(true)
    try {
      const res = await authApi.activate({ card_key: cardKey.trim() })
      updateUser(res.data.data.user)
      toast.success('🎉 激活成功！全部功能已解锁')
      setCardKey('')
    } catch (err: unknown) {
      const msg = (err as {response?:{data?:{error?:string}}})?.response?.data?.error || '激活失败'
      toast.error(msg)
    } finally { setActivating(false) }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* 欢迎区 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">
            你好，{user?.username} 👋
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {user?.is_activated
              ? '全部 AI 功能已解锁，开始创作吧！'
              : '账号未激活，激活卡密后可使用全部 AI 功能'}
          </p>
        </div>
        <button onClick={() => navigate('/trending')}
          className="btn-primary gap-2">
          <Zap size={15} />从热点开始创作
        </button>
      </div>

      {/* 激活卡密 */}
      {!user?.is_activated && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">🔑</span>
            <span className="font-semibold text-amber-300">激活卡密</span>
          </div>
          <div className="flex gap-3">
            <input
              type="text" value={cardKey}
              onChange={e => setCardKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleActivate()}
              placeholder="输入激活码..."
              className="input-base flex-1 font-mono tracking-wider"
            />
            <button onClick={handleActivate} disabled={activating || !cardKey.trim()}
              className="btn-primary whitespace-nowrap">
              {activating ? <Loader2 size={14} className="animate-spin" /> : null}
              {activating ? '激活中...' : '激 活'}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            没有卡密？<a href="#" className="text-amber-400 hover:underline">联系客服获取</a>
          </p>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4">
        {loading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="stat-card animate-pulse">
              <div className="h-8 w-20 bg-dark-500 rounded" />
              <div className="h-4 w-24 bg-dark-500 rounded" />
            </div>
          ))
        ) : (
          <>
            <div className="stat-card cursor-pointer hover:border-brand-500/50 transition-colors" onClick={() => navigate('/history')}>
              <div className="stat-value text-brand-400">{stats?.total_creations ?? 0}</div>
              <div className="stat-label">创作文章</div>
            </div>
            <div className="stat-card cursor-pointer hover:border-purple-500/50 transition-colors" onClick={() => navigate('/style')}>
              <div className="stat-value text-purple-400">{stats?.total_styles ?? 0}</div>
              <div className="stat-label">风格提示词</div>
            </div>
            <div className="stat-card cursor-pointer hover:border-blue-500/50 transition-colors" onClick={() => navigate('/knowledge')}>
              <div className="stat-value text-blue-400">{stats?.total_docs ?? 0}</div>
              <div className="stat-label">知识库文档</div>
            </div>
          </>
        )}
      </div>

      {/* 功能入口 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-200">全部功能</h2>
          <span className="text-xs text-slate-500">13+ 创作功能模块</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {FEATURE_CARDS.map(f => (
            <button key={f.to} onClick={() => navigate(f.to)}
              className={`card p-4 text-left hover:border-dark-600 transition-all duration-200 bg-gradient-to-br ${f.color} border-dark-500 hover:scale-[1.02] active:scale-[0.99] group`}>
              <f.icon size={20} className={`${f.iconColor} mb-3 group-hover:scale-110 transition-transform`} />
              <div className="font-semibold text-sm text-slate-100 mb-0.5">{f.label}</div>
              <div className="text-xs text-slate-400">{f.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* 最近创作 */}
      {stats?.recent_creations?.length ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-200">最近创作</h2>
            <button onClick={() => navigate('/history')} className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1">
              查看全部 <ChevronRight size={12} />
            </button>
          </div>
          <div className="card divide-y divide-dark-500">
            {stats.recent_creations.map(c => (
              <div key={c.id} className="flex items-center justify-between px-4 py-3 hover:bg-dark-300/50 transition-colors cursor-pointer"
                onClick={() => navigate('/history')}>
                <div className="flex items-center gap-3">
                  <span className="badge bg-dark-400 text-slate-400">{TYPE_LABELS[c.type] || c.type}</span>
                  <span className="text-sm text-slate-200 truncate max-w-xs">{c.title}</span>
                </div>
                <span className="text-xs text-slate-500 shrink-0">
                  {new Date(c.created_at).toLocaleDateString('zh-CN')}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* 快速上手 */}
      <div className="card p-5 bg-gradient-to-r from-brand-500/5 to-blue-500/5 border-brand-500/20">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={16} className="text-brand-400" />
          <span className="font-semibold text-slate-200">5步爆文工作流</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          {['🔥 找热点', '💡 起标题', '✍️ 写全文', '🧬 去AI味', '📱 排版发'].map((s, i) => (
            <span key={i} className="flex items-center gap-2">
              {i > 0 && <ChevronRight size={12} className="text-slate-600" />}
              <span>{s}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
