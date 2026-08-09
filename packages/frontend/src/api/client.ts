import axios from 'axios'
import toast from 'react-hot-toast'
import { useAuthStore } from '../store/auth'

export const api = axios.create({
  baseURL: '/api',
  timeout: 120000,
  headers: { 'Content-Type': 'application/json' },
})

// 请求拦截：自动带 token
api.interceptors.request.use(config => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 响应拦截：统一错误处理
api.interceptors.response.use(
  res => res,
  err => {
    const msg = err.response?.data?.error || err.message || '请求失败'
    if (err.response?.status === 401) {
      useAuthStore.getState().logout()
      window.location.href = '/login'
      toast.error('登录已过期，请重新登录')
    } else if (err.response?.status !== 422) {
      // 422 由调用方自己处理
      toast.error(msg)
    }
    return Promise.reject(err)
  }
)
