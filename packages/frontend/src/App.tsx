import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import AppLayout from './layouts/AppLayout'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import TrendingPage from './pages/features/TrendingPage'
import TitlePage from './pages/features/TitlePage'
import StylePage from './pages/features/StylePage'
import GeneratePage from './pages/features/GeneratePage'
import RewritePage from './pages/features/RewritePage'
import PlatformPage from './pages/features/PlatformPage'
import DeAIPage from './pages/features/DeAIPage'
import DetectPage from './pages/features/DetectPage'
import KnowledgePage from './pages/features/KnowledgePage'
import LayoutPage from './pages/features/LayoutPage'
import HistoryPage from './pages/features/HistoryPage'
import SettingsPage from './pages/features/SettingsPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)
  return isLoggedIn ? <>{children}</> : <Navigate to="/login" replace />
}

function RedirectIfAuth({ children }: { children: React.ReactNode }) {
  const isLoggedIn = useAuthStore(s => s.isLoggedIn)
  return isLoggedIn ? <Navigate to="/dashboard" replace /> : <>{children}</>
}

export default function App() {
  return (
    <Routes>
      {/* 公开路由 */}
      <Route path="/login"    element={<RedirectIfAuth><LoginPage /></RedirectIfAuth>} />
      <Route path="/register" element={<RedirectIfAuth><RegisterPage /></RedirectIfAuth>} />

      {/* 需要登录的路由 */}
      <Route path="/" element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard"  element={<DashboardPage />} />
        <Route path="trending"   element={<TrendingPage />} />
        <Route path="title"      element={<TitlePage />} />
        <Route path="style"      element={<StylePage />} />
        <Route path="generate"   element={<GeneratePage />} />
        <Route path="rewrite"    element={<RewritePage />} />
        <Route path="platform"   element={<PlatformPage />} />
        <Route path="deai"       element={<DeAIPage />} />
        <Route path="detect"     element={<DetectPage />} />
        <Route path="knowledge"  element={<KnowledgePage />} />
        <Route path="layout"     element={<LayoutPage />} />
        <Route path="history"    element={<HistoryPage />} />
        <Route path="settings"   element={<SettingsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}
