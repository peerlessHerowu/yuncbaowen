export interface KnowledgeDoc {
  id: number
  user_id: number
  filename: string
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
