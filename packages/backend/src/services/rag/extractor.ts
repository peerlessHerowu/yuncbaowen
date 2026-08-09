import fs from 'fs'
import path from 'path'

/**
 * 从上传文件中提取文本内容
 * 支持 .txt .md .json 纯文本格式
 * PDF/DOCX 需要额外依赖，这里用轻量方案：读取文本内容
 */
export async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()
  const buffer = fs.readFileSync(filePath)

  switch (ext) {
    case '.txt':
    case '.md':
    case '.markdown':
      return buffer.toString('utf-8')

    case '.json':
      try {
        const obj = JSON.parse(buffer.toString('utf-8'))
        return typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2)
      } catch {
        return buffer.toString('utf-8')
      }

    case '.pdf': {
      // 简单处理：读取 PDF 中可提取的文字（不依赖重型库）
      // 真实场景建议用 pdf-parse，这里提取可见文本
      const text = buffer.toString('latin1')
      const extracted = text.match(/BT\s*(.*?)\s*ET/gs)
        ?.join('\n')
        .replace(/[^\u0020-\u007E\u4E00-\u9FFF\u3000-\u303F]/g, ' ')
        .replace(/\s{3,}/g, '\n')
        .trim()
      return extracted || '（PDF 文本提取失败，请上传 .txt 格式）'
    }

    default:
      return buffer.toString('utf-8').slice(0, 50000)
  }
}

/**
 * 提取关键词（简单中文分词，不依赖 jieba）
 */
export function extractKeywords(text: string, topN = 50): string[] {
  // 去掉标点和特殊字符
  const clean = text.replace(/[^\u4E00-\u9FFF\u3400-\u4DBF\u0030-\u0039\u0041-\u005A\u0061-\u007A]/g, ' ')
  
  // 统计词频（2-6字中文词或英文单词）
  const words = clean.match(/[\u4E00-\u9FFF]{2,6}|[a-zA-Z]{3,}/g) ?? []
  
  // 停用词
  const stopWords = new Set(['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '来', '为', '这个', '那个', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with'])
  
  const freq = new Map<string, number>()
  for (const w of words) {
    if (stopWords.has(w)) continue
    freq.set(w, (freq.get(w) ?? 0) + 1)
  }
  
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word]) => word)
}

/**
 * 将长文本分块，用于 RAG 检索
 */
export function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  if (text.length <= chunkSize) return [text]
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize))
    start += chunkSize - overlap
  }
  return chunks
}

/**
 * 关键词检索（简单 BM25 近似实现，无需 embedding API）
 */
export function searchByKeywords(
  chunks: string[],
  query: string,
  topK = 3
): Array<{ chunk: string; score: number }> {
  const queryWords = (query.match(/[\u4E00-\u9FFF]{2,}|[a-zA-Z]{3,}/g) ?? [])
    .map(w => w.toLowerCase())

  const scored = chunks.map(chunk => {
    const lower = chunk.toLowerCase()
    let score = 0
    for (const word of queryWords) {
      // TF 近似：词在 chunk 中出现次数 / chunk 长度
      const count = (lower.match(new RegExp(word, 'g')) ?? []).length
      score += count / (chunk.length / 100 + 1)
    }
    return { chunk, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
