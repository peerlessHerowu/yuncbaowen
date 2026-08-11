export interface KnowledgeDoc {
  id: number
  user_id: number
  filename: string
  file_path?: string   // 文件路径或来源标识（url:/text:前缀）
  file_size: number
  chunk_count: number
  keywords: string[]
  created_at: string
}

export interface KnowledgeSearchResult {
  doc_id: number
  filename: string
  snippet: string
  relevance: number
}
