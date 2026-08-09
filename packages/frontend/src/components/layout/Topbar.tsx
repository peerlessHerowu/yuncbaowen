import { useNavigate } from 'react-router-dom'
import { LogOut, User, Bell } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import toast from 'react-hot-toast'

export default function Topbar() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
    toast.success('已退出登录')
  }

  return (
    <header className="h-12 bg-dark-200 border-b border-dark-500 flex items-center justify-between px-5 shrink-0">
      <div className="text-xs text-slate-500">
        {user?.is_activated
          ? <span className="text-brand-400">✓ Pro 版已激活</span>
          : <span>免费版 · <button onClick={() => navigate('/settings')} className="text-amber-400 hover:underline">激活卡密解锁全部功能 →</button></span>
        }
      </div>
      <div className="flex items-center gap-1">
        <button className="btn-ghost p-2 rounded-lg" title="通知">
          <Bell size={15} className="text-slate-400" />
        </button>
        <button className="btn-ghost p-2 rounded-lg" title="个人资料">
          <User size={15} className="text-slate-400" />
        </button>
        <button onClick={handleLogout} className="btn-ghost p-2 rounded-lg" title="退出登录">
          <LogOut size={15} className="text-slate-400" />
        </button>
      </div>
    </header>
  )
}
