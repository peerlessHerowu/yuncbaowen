export type TrendingPlatform = 'weibo' | 'zhihu' | 'douyin' | 'toutiao' | 'bilibili'
export type TrendingCategory = 'all' | 'tech' | 'finance' | 'entertainment' | 'health' | 'emotion' | 'society'

export interface TrendingItem {
  id: string
  platform: TrendingPlatform
  title: string
  url: string
  heat_value: number
  category: TrendingCategory
  rank: number
  is_hot: boolean   // heat_value >= 10000
  fetched_at: string
}

export interface TrendingResponse {
  items: TrendingItem[]
  platform: TrendingPlatform | 'all'
  category: TrendingCategory
  cached: boolean
  fetched_at: string
}
