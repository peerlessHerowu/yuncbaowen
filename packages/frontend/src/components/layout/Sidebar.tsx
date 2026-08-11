import { NavLink } from 'react-router-dom'
import {
  Zap, LayoutDashboard, TrendingUp, Type, Palette,
  PenTool, RefreshCw, Globe, Wand2, ScanText,
  BookOpen, FileText, History, Settings, ChevronRight, X,
} from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { cn } from '../../utils/cn'

const NAV_ITEMS = [
  { group: '工作台', items: [
    { to: '/dashboard', icon: LayoutDashboard, label: '工作台' },
  ]},
  { group: '选题·找爆点', items: [
    { to: '/trending', icon: TrendingUp, label: '热点追踪' },
    { to: '/title',    icon: Type,       label: '爆款标题' },
  ]},
  { group: '创作·出爆文', items: [
    { to: '/style',    icon: Palette,    label: '风格复刻' },
    { to: '/generate', icon: PenTool,    label: '定向生成' },
    { to: '/rewrite',  icon: RefreshCw,  label: '二次仿写' },
    { to: '/platform', icon: Globe,      label: '多平台推文' },
  ]},
  { group: '质检·更真更稳', items: [
    { to: '/deai',     icon: Wand2,     label: '去 AI 味' },
    { to: '/detect',   icon: ScanText,  label: '内容检测' },
    { to: '/knowledge',icon: BookOpen,  label: '知识库' },
  ]},
  { group: '成稿·直接发', items: [
    { to: '/layout',  icon: FileText, label: '文章排版' },
    { to: '/history', icon: History,  label: '创作历史' },
  ]},
  { group: '设置', items: [
    { to: '/settings', icon: Settings, label: '模型设置' },
  ]},
]

interface SidebarProps {
  onClose?: () => void
}

export default function Sidebar({ onClose }: SidebarProps) {
  const user = useAuthStore(s => s.user)

  return (
    <aside className="w-56 bg-dark-200 border-r border-dark-500 flex flex-col h-full shrink-0">
      {/* Logo + 移动端关闭按钮 */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b border-dark-500">
        <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-blue-500 rounded-xl flex items-center justify-center shadow-lg shrink-0">
          <Zap size={16} className="text-white" />
        </div>
        <span className="font-bold text-slate-100 text-sm flex-1">云创爆文</span>
        {/* 移动端关闭按钮 */}
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-dark-400 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* 激活状态提示 */}
      {user && !user.is_activated && (
        <NavLink to="/settings" className="mx-3 mt-3 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center gap-2 text-xs text-amber-400 hover:bg-amber-500/15 transition-colors">
          <span className="flex-1">激活卡密解锁全功能</span>
          <ChevronRight size={12} />
        </NavLink>
      )}

      {/* 导航 */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV_ITEMS.map(group => (
          <div key={group.group}>
            <div className="px-3 mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {group.group}
            </div>
            <div className="space-y-0.5">
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) => cn('sidebar-item', isActive && 'active')}
                >
                  <item.icon size={15} className="sidebar-icon shrink-0 text-slate-500" />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* 用户信息 */}
      <div className="border-t border-dark-500 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-blue-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
            {user?.username?.slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-slate-200 truncate">{user?.username}</div>
            <div className="text-[10px] text-slate-500">
              {user?.is_activated ? (
                <span className="text-brand-400">✓ 已激活</span>
              ) : '免费版'}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
