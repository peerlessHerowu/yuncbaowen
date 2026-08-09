import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@yuncbaowen/shared'

interface AuthState {
  user: User | null
  token: string | null
  isLoggedIn: boolean
  setAuth: (user: User, token: string) => void
  updateUser: (user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user:      null,
      token:     null,
      isLoggedIn: false,
      setAuth: (user, token) => set({ user, token, isLoggedIn: true }),
      updateUser: (user) => set({ user }),
      logout: () => set({ user: null, token: null, isLoggedIn: false }),
    }),
    {
      name: 'yc-auth',
      partialize: (s) => ({ user: s.user, token: s.token, isLoggedIn: s.isLoggedIn }),
    }
  )
)
