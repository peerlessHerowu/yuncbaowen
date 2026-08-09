export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginationParams {
  page?: number
  page_size?: number
}

export interface LoginDto {
  username: string
  password: string
}

export interface RegisterDto {
  username: string
  email: string
  password: string
  card_key?: string
}

export interface AuthResponse {
  user: import('./user').User
  token: string
  refresh_token: string
}

export interface ActivateDto {
  card_key: string
}
