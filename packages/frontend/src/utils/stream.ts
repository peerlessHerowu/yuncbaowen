/**
 * 读取 SSE 流式响应
 */
export async function readStream(
  url: string,
  body: unknown,
  onChunk: (chunk: string) => void,
  token?: string
): Promise<void> {
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

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const lines = decoder.decode(value, { stream: true }).split('\n')
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6)
      if (data === '[DONE]') return
      try {
        const json = JSON.parse(data) as { chunk?: string; done?: boolean }
        if (json.chunk) onChunk(json.chunk)
        if (json.done)  return
      } catch { /* 忽略解析错误 */ }
    }
  }
}
