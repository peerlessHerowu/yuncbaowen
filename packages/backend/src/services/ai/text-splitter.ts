/**
 * 文本分段器
 * 将长文按段落分割，每段不超过 maxLen
 * 提供上下文摘要保证改写连贯性
 */

export interface TextSegment {
  index: number
  content: string
  contextBefore: string  // 前一段最后 80 字
  contextAfter: string   // 后一段开头 80 字
}

/**
 * 将长文按段落分割
 * 分割策略：
 * 1. 优先按 \n\n 分段
 * 2. 如果单段超过 maxLen，按句号/问号/感叹号分割
 * 3. 相邻短段合并直到接近 maxLen
 */
export function splitText(text: string, maxLen: number = 2000): TextSegment[] {
  const rawParagraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0)

  // 合并短段、拆分超长段
  const chunks: string[] = []
  let buffer = ''

  for (const para of rawParagraphs) {
    if (para.length > maxLen) {
      // 先把 buffer 推入
      if (buffer) { chunks.push(buffer); buffer = '' }
      // 按句子拆分超长段
      const sentences = splitBySentence(para)
      let sentBuf = ''
      for (const s of sentences) {
        if (sentBuf.length + s.length > maxLen && sentBuf) {
          chunks.push(sentBuf)
          sentBuf = s
        } else {
          sentBuf += s
        }
      }
      if (sentBuf) chunks.push(sentBuf)
    } else if (buffer.length + para.length + 2 > maxLen) {
      // buffer 满了，推入后开始新 buffer
      if (buffer) chunks.push(buffer)
      buffer = para
    } else {
      buffer += (buffer ? '\n\n' : '') + para
    }
  }
  if (buffer) chunks.push(buffer)

  // 构建 TextSegment（附带上下文）
  return chunks.map((content, i) => ({
    index: i,
    content,
    contextBefore: i > 0 ? chunks[i - 1].slice(-80) : '',
    contextAfter: i < chunks.length - 1 ? chunks[i + 1].slice(0, 80) : '',
  }))
}

/** 按中文句号/问号/感叹号分句 */
function splitBySentence(text: string): string[] {
  const result: string[] = []
  let last = 0
  const re = /[。！？!?]+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    result.push(text.slice(last, m.index + m[0].length))
    last = m.index + m[0].length
  }
  if (last < text.length) result.push(text.slice(last))
  return result.filter(s => s.trim().length > 0)
}
