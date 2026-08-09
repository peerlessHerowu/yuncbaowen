export type CreationType =
  | 'title'       // 爆款标题
  | 'article'     // 定向生成文章
  | 'rewrite'     // 二次仿写
  | 'platform'    // 多平台推文
  | 'deai'        // 去AI味后的内容
  | 'style'       // 风格分析结果

export type Platform = 'weixin' | 'xiaohongshu' | 'weibo' | 'zhihu' | 'douyin' | 'pyq' | 'shipinhao'

export interface Creation {
  id: number
  user_id: number
  type: CreationType
  title: string
  content: string
  meta: Record<string, unknown>
  source_style_id: number | null
  platform: Platform | null
  ai_score: number | null
  created_at: string
  updated_at: string
}

export interface CreateCreationDto {
  type: CreationType
  title: string
  content: string
  meta?: Record<string, unknown>
  source_style_id?: number
  platform?: Platform
  ai_score?: number
}

export interface PaginatedCreations {
  items: Creation[]
  total: number
  page: number
  page_size: number
}
