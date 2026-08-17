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
  taskId?: string
  segments?: SegmentStatus[]
  [key: string]: unknown
}

export interface SegmentStatus {
  index: number
  status: 'pending' | 'done' | 'failed'
  result?: string
}

/**
 * 读取 SSE 流式响应
 *
 * 修复：维护跨 TCP 包的行缓冲（lineBuffer），避免"Unterminated string in JSON"
 * 原因：TCP 分包可能把 data: {...} 切开，需要等到完整一行再解析
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
  let lineBuffer = ''  // 跨包行缓冲，解决 JSON 被 TCP 分包截断的问题

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    // 追加到行缓冲，然后按换行符分割
    lineBuffer += decoder.decode(value, { stream: true })
    const parts = lineBuffer.split('\n')

    // 最后一个 part 可能不完整（没有换行符），保留到下次
    lineBuffer = parts.pop() ?? ''

    for (const line of parts) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (!data || data === '[DONE]') continue

      try {
        const json = JSON.parse(data) as StreamEvent
        if (json.chunk) onChunk(json.chunk)
        if (json.stage !== undefined || json.progress !== undefined) onEvent?.(json)
        if (json.error) throw new Error(json.error as string)
        if (json.taskId || json.segments) onEvent?.(json)
        if (json.done) {
          finalEvent = json
          gotDone = true
          onEvent?.(json)
          return finalEvent
        }
      } catch (parseErr) {
        if (parseErr instanceof Error && !parseErr.message.startsWith('JSON')) throw parseErr
        // JSON 解析失败（被截断的包已通过 lineBuffer 解决了，走到这里说明服务端发了非法 JSON）
      }
    }
  }

  // 处理缓冲区最后残余（没有换行符结尾的情况）
  if (lineBuffer.startsWith('data: ')) {
    const data = lineBuffer.slice(6).trim()
    if (data && data !== '[DONE]') {
      try {
        const json = JSON.parse(data) as StreamEvent
        if (json.done) { finalEvent = json; gotDone = true }
      } catch { /* 不完整的行，忽略 */ }
    }
  }

  if (!gotDone) {
    throw new Error('AI 服务响应超时，请再试一次')
  }
  return finalEvent
}
