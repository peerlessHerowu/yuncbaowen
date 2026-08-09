export type Plan = 'free' | 'pro' | 'enterprise'

export interface User {
  id: number
  username: string
  email: string
  avatar_url: string | null
  is_activated: boolean
  plan: Plan
  created_at: string
}

export interface ModelConfig {
  default_provider: string
  fallback_order: string[]
  providers: {
    [key: string]: {
      enabled: boolean
      api_key?: string  // 前端不传明文，后端加密存储
      base_url?: string
      model?: string
    }
  }
}

export const PROVIDERS = ['deepseek', 'openai', 'claude', 'qwen', 'kimi', 'zhipu', 'gemini', 'kiro'] as const
export type Provider = typeof PROVIDERS[number]

export interface ProviderInfo {
  id: Provider
  name: string
  icon: string
  models: string[]
  base_url: string
  docs_url: string
}
