/**
 * SSE 流式响应事件类型
 */
export interface StreamEvent {
  chunk?: string
  done?: boolean
  stage?: string
  progress?: number
  similarity?: number
  fixCount?: number
  provider?: string
  [key: string]: unknown
}

/**
 * 读取 SSE 流式响应（支持 chunk + stage 事件）
 */
export async function readStream(
  url: string,
  body: unknown,
  onChunk: (chunk: string) => void,
  token?: string,
  onEvent?: (event: StreamEvent) => void
): Promise<StreamEvent | void> {
  const resp = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const text = await resp.text()
    let errMsg = '请求失败'
    try { errMsg = JSON.parse(text).error || errMsg } catch {}
    throw new Error(errMsg)
  }

  if (!resp.body) throw new Error('Response body is null')

  const reader  = resp.body.getReader()
  const decoder = new TextDecoder()
  let finalEvent: StreamEvent | undefined
  let gotDone = false

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const lines = decoder.decode(value, { stream: true }).split('\n')
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') return finalEvent
      try {
        const json = JSON.parse(data) as StreamEvent
        if (json.chunk) onChunk(json.chunk)
        if (json.stage || json.progress !== undefined) onEvent?.(json)
        if (json.error) {
          throw new Error(json.error as string)
        }
        if (json.done) {
          finalEvent = json
          gotDone = true
          onEvent?.(json)
          return finalEvent
        }
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== 'Unexpected token') throw parseErr
      }
    }
  }

  // 流关闭但没收到 done:true — 服务端异常中断（如 Caddy response_header_timeout）
  if (!gotDone) {
    throw new Error('AI 服务响应超时，请再试一次')
  }
  return finalEvent
}
