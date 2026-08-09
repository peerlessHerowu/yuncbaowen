import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Zap, Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { authApi } from '../../api'
import toast from 'react-hot-toast'

export default function RegisterPage() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore(s => s.setAuth)
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '', card_key: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function validate() {
    const e: Record<string, string> = {}
    if (!form.username || form.username.length < 2) e.username = '用户名至少 2 位'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = '邮箱格式不正确'
    if (form.password.length < 8) e.password = '密码至少 8 位'
    if (form.password !== form.confirm) e.confirm = '两次密码不一致'
    setErrors(e)
    return !Object.keys(e).length
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    try {
      const res = await authApi.register({
        username: form.username,
        email: form.email,
        password: form.password,
        card_key: form.card_key || undefined,
      })
      setAuth(res.data.data.user, res.data.data.token)
      toast.success('注册成功！欢迎加入云创爆文')
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || '注册失败'
      setErrors({ submit: msg })
    } finally {
      setLoading(false)
    }
  }

  const pwStrength = form.password.length === 0 ? 0
    : form.password.length < 8 ? 1
    : form.password.length < 12 ? 2 : 3
  const pwColors = ['', 'bg-red-500', 'bg-amber-500', 'bg-brand-500']
  const pwLabels = ['', '弱', '中', '强']

  return (
    <div className="min-h-screen bg-dark-100 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/25">
              <Zap size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold text-slate-100">云创爆文</span>
          </Link>
          <h1 className="text-2xl font-bold text-slate-100">创建账号</h1>
          <p className="text-sm text-slate-400 mt-1">注册后激活卡密即可解锁全部功能</p>
        </div>

        <div className="bg-dark-200 border border-dark-500 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 用户名 */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">用户名</label>
              <input
                type="text" value={form.username} autoFocus
                onChange={e => { setForm(f => ({...f, username: e.target.value})); setErrors(er => ({...er, username: ''})) }}
                placeholder="2-32 位，支持中英文"
                className={`input-base ${errors.username ? 'border-red-500' : ''}`}
              />
              {errors.username && <p className="text-xs text-red-400 mt-1">{errors.username}</p>}
            </div>

            {/* 邮箱 */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">邮箱</label>
              <input
                type="email" value={form.email}
                onChange={e => { setForm(f => ({...f, email: e.target.value})); setErrors(er => ({...er, email: ''})) }}
                placeholder="your@email.com"
                className={`input-base ${errors.email ? 'border-red-500' : ''}`}
              />
              {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
            </div>

            {/* 密码 */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">密码</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} value={form.password}
                  onChange={e => { setForm(f => ({...f, password: e.target.value})); setErrors(er => ({...er, password: ''})) }}
                  placeholder="至少 8 位"
                  className={`input-base pr-10 ${errors.password ? 'border-red-500' : ''}`}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {form.password && (
                <div className="flex items-center gap-2 mt-1.5">
                  <div className="flex gap-1 flex-1">
                    {[1,2,3].map(i => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= pwStrength ? pwColors[pwStrength] : 'bg-dark-600'}`} />
                    ))}
                  </div>
                  <span className="text-xs text-slate-400">{pwLabels[pwStrength]}</span>
                </div>
              )}
              {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
            </div>

            {/* 确认密码 */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">确认密码</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} value={form.confirm}
                  onChange={e => { setForm(f => ({...f, confirm: e.target.value})); setErrors(er => ({...er, confirm: ''})) }}
                  placeholder="再次输入密码"
                  className={`input-base pr-10 ${errors.confirm ? 'border-red-500' : ''}`}
                />
                {form.confirm && form.confirm === form.password && (
                  <CheckCircle2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-500" />
                )}
              </div>
              {errors.confirm && <p className="text-xs text-red-400 mt-1">{errors.confirm}</p>}
            </div>

            {/* 卡密（可选） */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                卡密 <span className="text-slate-500 font-normal">（选填，注册时填写立即激活）</span>
              </label>
              <input
                type="text" value={form.card_key}
                onChange={e => setForm(f => ({...f, card_key: e.target.value}))}
                placeholder="输入激活卡密"
                className="input-base font-mono tracking-wider"
              />
            </div>

            {errors.submit && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
                {errors.submit}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="btn-primary w-full justify-center py-3 text-base mt-2">
              {loading ? <><Loader2 size={16} className="animate-spin" />注册中...</> : '🚀 免费注册'}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-slate-400">
            已有账号？{' '}
            <Link to="/login" className="text-brand-400 hover:text-brand-300 font-medium">
              立即登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
