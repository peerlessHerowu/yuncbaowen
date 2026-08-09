import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Zap, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { authApi } from '../../api'
import toast from 'react-hot-toast'

export default function LoginPage() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore(s => s.setAuth)
  const [form, setForm] = useState({ username: '', password: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate() {
    const e: Record<string, string> = {}
    if (!form.username) e.username = '请输入用户名'
    if (!form.password) e.password = '请输入密码'
    setErrors(e)
    return !Object.keys(e).length
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const res = await authApi.login({ username: form.username, password: form.password })
      setAuth(res.data.data.user, res.data.data.token)
      toast.success(`欢迎回来，${res.data.data.user.username}！`)
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '登录失败'
      setErrors({ submit: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-dark-100 flex items-center justify-center p-4">
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/25">
              <Zap size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold text-slate-100">云创爆文</span>
          </Link>
          <h1 className="text-2xl font-bold text-slate-100">欢迎回来</h1>
          <p className="text-sm text-slate-400 mt-1">登录以继续你的爆款创作</p>
        </div>

        {/* 表单卡片 */}
        <div className="bg-dark-200 border border-dark-500 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 用户名 */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">用户名 / 邮箱</label>
              <input
                type="text"
                value={form.username}
                onChange={e => { setForm(f => ({...f, username: e.target.value})); setErrors(er => ({...er, username: ''})) }}
                placeholder="输入用户名或邮箱"
                className={`input-base ${errors.username ? 'border-red-500' : ''}`}
                autoFocus
              />
              {errors.username && <p className="text-xs text-red-400 mt-1">{errors.username}</p>}
            </div>

            {/* 密码 */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">密码</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => { setForm(f => ({...f, password: e.target.value})); setErrors(er => ({...er, password: ''})) }}
                  placeholder="输入密码"
                  className={`input-base pr-10 ${errors.password ? 'border-red-500' : ''}`}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
            </div>

            {/* 提交错误 */}
            {errors.submit && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
                {errors.submit}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="btn-primary w-full justify-center py-3 text-base">
              {loading ? <><Loader2 size={16} className="animate-spin" />登录中...</> : '登录'}
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-400">
            还没有账号？{' '}
            <Link to="/register" className="text-brand-400 hover:text-brand-300 font-medium">
              免费注册
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
