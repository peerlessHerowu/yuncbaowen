import { useNavigate } from 'react-router-dom'
import { LogOut, User, Menu } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import toast from 'react-hot-toast'

interface TopbarProps {
  onMenuClick?: () => void
}

export default function Topbar({ onMenuClick }: TopbarProps) {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
    toast.success('已退出登录')
  }

  return (
    <header className="h-12 bg-dark-200 border-b border-dark-500 flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        {/* 移动端汉堡菜单按钮 */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-dark-400 transition-colors"
          aria-label="打开菜单"
        >
          <Menu size={18} />
        </button>

        {/* 激活状态提示 */}
        <div className="text-xs text-slate-500">
          {user?.is_activated
            ? <span className="text-brand-400">✓ Pro 版已激活</span>
            : <span>免费版 · <button onClick={() => navigate('/settings')} className="text-amber-400 hover:underline">激活卡密解锁全部功能 →</button></span>
          }
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button className="btn-ghost p-2 rounded-lg" title="个人资料" onClick={() => navigate('/settings')}>
          <User size={15} className="text-slate-400" />
        </button>
        <button onClick={handleLogout} className="btn-ghost p-2 rounded-lg" title="退出登录">
          <LogOut size={15} className="text-slate-400" />
        </button>
      </div>
    </header>
  )
}
