import { resolveKeys, ResolvedKey, PROVIDER_CONFIGS } from './providers'
import { logger } from '../../utils/logger'

interface Message {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatOptions {
  stream?: boolean
  temperature?: number
  max_tokens?: number
}

/**
 * 调用单个 provider 的 chat API（OpenAI 兼容格式）
 */
async function callProvider(
  key: ResolvedKey,
  messages: Message[],
  options: ChatOptions = {}
): Promise<string> {
  const { provider, apiKey, model } = key
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (provider.id === 'claude') {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const body = JSON.stringify({
    model,
    messages,
    temperature: options.temperature ?? 0.7,
    max_tokens:  options.max_tokens  ?? 4096,
    stream:      false,
  })

  const url = provider.baseURL + provider.chatPath
  const resp = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(60000) })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`${provider.name} API error ${resp.status}: ${text.slice(0, 200)}`)
  }

  const json = await resp.json() as Record<string, unknown>

  // Claude 返回格式不同
  if (provider.id === 'claude') {
    const content = (json.content as Array<{ type: string; text: string }>)?.[0]?.text
    if (!content) throw new Error('Claude response missing content')
    return content
  }

  const choice = (json.choices as Array<{ message: { content: string } }>)?.[0]
  if (!choice?.message?.content) throw new Error(`${provider.name} response missing content`)
  return choice.message.content
}

/**
 * 带故障切换的聊天调用
 */
export async function chatWithFallback(
  userId: number,
  messages: Message[],
  options: ChatOptions = {}
): Promise<{ content: string; provider: string }> {
  const keys = await resolveKeys(userId)
  if (keys.length === 0) {
    throw new Error('未配置任何 AI 模型 Key，请前往「模型设置」添加')
  }

  const errors: string[] = []
  for (const key of keys) {
    try {
      const content = await callProvider(key, messages, options)
      return { content, provider: key.provider.name }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn(`Provider ${key.provider.name} failed: ${msg}`)
      errors.push(`${key.provider.name}: ${msg}`)
    }
  }
  throw new Error(`所有 AI 服务均不可用:\n${errors.join('\n')}`)
}

/**
 * 流式输出（SSE），带故障切换
 * onChunk: 每次收到内容片段时回调
 */
export async function streamWithFallback(
  userId: number,
  messages: Message[],
  onChunk: (chunk: string) => void,
  options: ChatOptions = {}
): Promise<{ provider: string }> {
  const keys = await resolveKeys(userId)
  if (keys.length === 0) {
    throw new Error('未配置任何 AI 模型 Key，请前往「模型设置」添加')
  }

  const errors: string[] = []
  for (const key of keys) {
    try {
      const result = await streamFromProvider(key, messages, onChunk, options)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn(`Stream provider ${key.provider.name} failed: ${msg}`)
      errors.push(`${key.provider.name}: ${msg}`)
    }
  }
  throw new Error(`所有 AI 服务均不可用:\n${errors.join('\n')}`)
}

async function streamFromProvider(
  key: ResolvedKey,
  messages: Message[],
  onChunk: (chunk: string) => void,
  options: ChatOptions
): Promise<{ provider: string }> {
  const { provider, apiKey, model } = key
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (provider.id === 'claude') {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  const body = JSON.stringify({
    model, messages,
    temperature: options.temperature ?? 0.7,
    max_tokens:  options.max_tokens  ?? 4096,
    stream:      true,
  })

  const resp = await fetch(provider.baseURL + provider.chatPath, {
    method: 'POST', headers, body,
    signal: AbortSignal.timeout(120000),
  })
  if (!resp.ok || !resp.body) {
    const text = await resp.text()
    throw new Error(`${provider.name} stream error ${resp.status}: ${text.slice(0, 200)}`)
  }

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '))
    for (const line of lines) {
      const data = line.slice(6)
      if (data === '[DONE]') break
      try {
        const json = JSON.parse(data) as Record<string, unknown>
        let text: string | undefined

        if (provider.id === 'claude') {
          text = (json.delta as { type?: string; text?: string })?.text
        } else {
          text = (json.choices as Array<{ delta?: { content?: string } }>)?.[0]?.delta?.content
        }
        if (text) onChunk(text)
      } catch { /* 忽略解析错误 */ }
    }
  }

  return { provider: provider.name }
}
