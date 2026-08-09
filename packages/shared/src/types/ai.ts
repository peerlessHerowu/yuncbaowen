export interface TitleRequest {
  topic: string
  style?: string
  count?: number  // 默认 12
}

export interface TitleResult {
  titles: Array<{ text: string; type: string }>
  provider: string
}

export interface StyleAnalyzeRequest {
  urls: string[]  // 1-5 篇
}

export interface StylePrompt {
  id?: number
  name: string
  description: string
  source_urls: string[]
  prompt_content: string
}

export interface GenerateRequest {
  topic: string
  style_prompt_id?: number
  style_prompt?: string
  use_knowledge: boolean
  knowledge_doc_ids?: number[]
  word_count?: number
}

export interface RewriteRequest {
  original: string
  intensity?: 'light' | 'medium' | 'heavy'
}

export interface PlatformRequest {
  content: string
  platforms: Array<'weixin' | 'xiaohongshu' | 'weibo' | 'zhihu' | 'douyin' | 'pyq' | 'shipinhao'>
}

export interface PlatformResult {
  results: Record<string, string>
  provider: string
}

export interface DeAIRequest {
  content: string
  max_rounds?: number  // 最多 3 轮
}

export interface DeAIRoundResult {
  round: number
  content: string
  score: number
  passed: boolean
}

export interface DeAIResult {
  rounds: DeAIRoundResult[]
  final_content: string
  final_score: number
  provider: string
}

export interface DetectRequest {
  content: string
  use_deep_detect?: boolean
}

export interface DetectDimension {
  name: string
  score: number
  issues: Array<{ text: string; start: number; end: number; reason: string }>
}

export interface DetectResult {
  overall_score: number
  passed: boolean
  dimensions: {
    ai_taste: DetectDimension
    forbidden_words: DetectDimension
    originality: DetectDimension
    readability: DetectDimension
  }
  provider: string
}
