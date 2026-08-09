import { decryptApiKey } from '../../utils/crypto'
import { queryOne } from '../../db/connection'
import type { Provider } from '@yuncbaowen/shared'

export interface ProviderConfig {
  id: Provider
  name: string
  baseURL: string
  defaultModel: string
  apiKeyHeader: string
  chatPath: string
}

export const PROVIDER_CONFIGS: Record<Provider, ProviderConfig> = {
  deepseek: {
    id: 'deepseek', name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    apiKeyHeader: 'Authorization',
    chatPath: '/v1/chat/completions',
  },
  openai: {
    id: 'openai', name: 'OpenAI',
    baseURL: 'https://api.openai.com',
    defaultModel: 'gpt-4o-mini',
    apiKeyHeader: 'Authorization',
    chatPath: '/v1/chat/completions',
  },
  claude: {
    id: 'claude', name: 'Claude',
    baseURL: 'https://api.anthropic.com',
    defaultModel: 'claude-3-5-haiku-20241022',
    apiKeyHeader: 'x-api-key',
    chatPath: '/v1/messages',
  },
  qwen: {
    id: 'qwen', name: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode',
    defaultModel: 'qwen-turbo',
    apiKeyHeader: 'Authorization',
    chatPath: '/v1/chat/completions',
  },
  kimi: {
    id: 'kimi', name: 'Kimi',
    baseURL: 'https://api.moonshot.cn',
    defaultModel: 'moonshot-v1-8k',
    apiKeyHeader: 'Authorization',
    chatPath: '/v1/chat/completions',
  },
  zhipu: {
    id: 'zhipu', name: '智谱 GLM',
    baseURL: 'https://open.bigmodel.cn/api/paas',
    defaultModel: 'glm-4-flash',
    apiKeyHeader: 'Authorization',
    chatPath: '/v4/chat/completions',
  },
  gemini: {
    id: 'gemini', name: 'Gemini',
    baseURL: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-1.5-flash',
    apiKeyHeader: 'Authorization',
    chatPath: '/v1beta/openai/chat/completions',
  },
  kiro: {
    id: 'kiro', name: 'Kiro Gateway',
    baseURL: 'http://localhost:8000',
    defaultModel: 'claude-sonnet-4-5',
    apiKeyHeader: 'Authorization',
    chatPath: '/v1/chat/completions',
  },
}

export interface ResolvedKey {
  provider: ProviderConfig
  apiKey: string
  model: string
}

/**
 * 从用户配置中解析可用的 API Key，按 fallback_order 排列
 */
export async function resolveKeys(userId: number): Promise<ResolvedKey[]> {
  const row = await queryOne<{ model_config: string }>(
    'SELECT model_config FROM users WHERE id=?', [userId]
  )
  if (!row?.model_config) return []

  const config = typeof row.model_config === 'string'
    ? JSON.parse(row.model_config)
    : row.model_config

  const order: Provider[] = config.fallback_order || Object.keys(PROVIDER_CONFIGS) as Provider[]
  const result: ResolvedKey[] = []

  for (const id of order) {
    const pConf = config.providers?.[id]
    if (!pConf?.enabled || !pConf?.api_key_encrypted) continue
    try {
      const apiKey = decryptApiKey(pConf.api_key_encrypted)
      result.push({
        provider: PROVIDER_CONFIGS[id],
        apiKey,
        model: pConf.model || PROVIDER_CONFIGS[id].defaultModel,
      })
    } catch { /* 解密失败跳过 */ }
  }
  return result
}
