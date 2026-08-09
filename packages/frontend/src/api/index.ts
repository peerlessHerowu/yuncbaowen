import { api } from './client'
import type {
  RegisterDto, LoginDto, AuthResponse, ActivateDto,
  TitleRequest, StyleAnalyzeRequest,
  PlatformRequest, DeAIRequest, DetectRequest,
  TrendingPlatform, TrendingCategory,
} from '@yuncbaowen/shared'

// ── Auth ────────────────────────────────────────────────────────
export const authApi = {
  register: (data: RegisterDto) =>
    api.post<{ success: boolean; data: AuthResponse }>('/auth/register', data),
  login: (data: LoginDto) =>
    api.post<{ success: boolean; data: AuthResponse }>('/auth/login', data),
  getMe: () =>
    api.get<{ success: boolean; data: { user: AuthResponse['user'] } }>('/auth/me'),
  activate: (data: ActivateDto) =>
    api.post<{ success: boolean; data: { user: AuthResponse['user'] }; message: string }>('/auth/activate', data),
}

// ── AI ──────────────────────────────────────────────────────────
export const aiApi = {
  generateTitles: (data: TitleRequest) =>
    api.post('/ai/title', data),
  analyzeStyle: (data: StyleAnalyzeRequest) =>
    api.post('/ai/style-analyze', data),
  generatePlatforms: (data: PlatformRequest) =>
    api.post('/ai/platform', data),
  deai: (data: DeAIRequest) =>
    api.post('/ai/deai', data),
  detect: (data: DetectRequest) =>
    api.post('/ai/detect', data),
}

// ── Trending ────────────────────────────────────────────────────
export const trendingApi = {
  list: (platform: TrendingPlatform | 'all' = 'all', category: TrendingCategory = 'all') =>
    api.get('/trending', { params: { platform, category } }),
}

// ── Knowledge ───────────────────────────────────────────────────
export const knowledgeApi = {
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/knowledge/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } })
  },
  list:   () => api.get('/knowledge/list'),
  delete: (id: number) => api.delete(`/knowledge/${id}`),
  search: (query: string, doc_ids?: number[]) => api.post('/knowledge/search', { query, doc_ids }),
}

// ── Style ───────────────────────────────────────────────────────
export const styleApi = {
  list:   () => api.get('/style'),
  create: (data: { name: string; description?: string; source_urls: string[]; prompt_content: string }) =>
    api.post('/style', data),
  delete: (id: number) => api.delete(`/style/${id}`),
  getById:(id: number) => api.get(`/style/${id}`),
}

// ── Creations ───────────────────────────────────────────────────
export const creationApi = {
  list: (params: { page?: number; page_size?: number; type?: string; keyword?: string }) =>
    api.get('/creations', { params }),
  getById: (id: number) => api.get(`/creations/${id}`),
  update:  (id: number, data: { title?: string; content?: string }) =>
    api.patch(`/creations/${id}`, data),
  delete:  (id: number) => api.delete(`/creations/${id}`),
  stats:   () => api.get('/creations/stats/overview'),
}

// ── Settings ────────────────────────────────────────────────────
export const settingsApi = {
  getModels: () => api.get('/settings/models'),
  saveModels: (data: unknown) => api.put('/settings/models', data),
  testProvider: (provider_id: string, api_key: string) =>
    api.post('/settings/test', { provider_id, api_key }),
}
