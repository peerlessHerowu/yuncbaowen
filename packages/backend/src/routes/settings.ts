import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth } from '../middleware/auth'
import { queryOne, execute } from '../db/connection'
import { encryptApiKey, decryptApiKey } from '../utils/crypto'
import { PROVIDER_CONFIGS } from '../services/ai/providers'

export const settingsRouter = Router()
settingsRouter.use(requireAuth)

// 获取模型配置（不返回明文 Key，只返回是否已配置）
settingsRouter.get('/models', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await queryOne<{ model_config: string }>(
      'SELECT model_config FROM users WHERE id=?', [req.user!.id]
    )
    const config = user?.model_config
      ? (typeof user.model_config === 'string' ? JSON.parse(user.model_config) : user.model_config)
      : { default_provider: 'deepseek', fallback_order: [], providers: {} }

    // 脱敏处理：只返回 has_key，不返回 Key 明文
    const sanitized = { ...config }
    if (sanitized.providers) {
      for (const id of Object.keys(sanitized.providers)) {
        const p = sanitized.providers[id]
        sanitized.providers[id] = {
          ...p,
          api_key_encrypted: undefined,
          has_key: !!p.api_key_encrypted,
        }
      }
    }

    res.json({
      success: true,
      data: {
        config: sanitized,
        provider_list: Object.values(PROVIDER_CONFIGS).map(p => ({
          id: p.id, name: p.name, defaultModel: p.defaultModel, models: [],
        })),
      },
    })
  } catch (err) { next(err) }
})

// 保存模型配置
settingsRouter.put('/models', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { default_provider, fallback_order, providers } = req.body

    // 读取现有配置（保留已有 encrypted key）
    const existing = await queryOne<{ model_config: string }>(
      'SELECT model_config FROM users WHERE id=?', [req.user!.id]
    )
    const oldConfig = existing?.model_config
      ? (typeof existing.model_config === 'string' ? JSON.parse(existing.model_config) : existing.model_config)
      : { providers: {} }

    const newProviders: Record<string, unknown> = {}
    for (const [id, pConf] of Object.entries(providers as Record<string, { enabled?: boolean; api_key?: string; model?: string }>)) {
      const old = (oldConfig.providers?.[id] ?? {}) as Record<string, unknown>
      newProviders[id] = {
        enabled:            pConf.enabled ?? false,
        model:              pConf.model || (PROVIDER_CONFIGS[id as keyof typeof PROVIDER_CONFIGS]?.defaultModel),
        // 如果传了新 Key（非空），则加密存储；否则保留旧的
        api_key_encrypted: pConf.api_key
          ? encryptApiKey(pConf.api_key)
          : (old.api_key_encrypted ?? null),
      }
    }

    const newConfig = { default_provider, fallback_order: fallback_order ?? [], providers: newProviders }
    await execute('UPDATE users SET model_config=? WHERE id=?', [JSON.stringify(newConfig), req.user!.id])
    res.json({ success: true, message: '配置已保存' })
  } catch (err) { next(err) }
})

// 测试某个 Provider 连通性
settingsRouter.post('/test', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider_id, api_key } = req.body as { provider_id: string; api_key: string }
    const pConf = PROVIDER_CONFIGS[provider_id as keyof typeof PROVIDER_CONFIGS]
    if (!pConf) return void res.status(400).json({ success: false, error: '未知服务商' })
    if (!api_key) return void res.status(400).json({ success: false, error: 'API Key 不能为空' })

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (provider_id === 'claude') {
      headers['x-api-key'] = api_key
      headers['anthropic-version'] = '2023-06-01'
    } else {
      headers['Authorization'] = `Bearer ${api_key}`
    }

    const body = JSON.stringify({
      model:    pConf.defaultModel,
      messages: [{ role: 'user', content: 'Hi' }],
      max_tokens: 5,
    })

    const resp = await fetch(pConf.baseURL + pConf.chatPath, {
      method: 'POST', headers, body,
      signal: AbortSignal.timeout(15000),
    })

    if (resp.ok || resp.status === 400) {
      // 400 通常是参数问题，但说明 Key 有效
      res.json({ success: true, message: `${pConf.name} 连接成功` })
    } else {
      const text = await resp.text()
      res.json({ success: false, error: `${pConf.name} 返回 ${resp.status}: ${text.slice(0, 100)}` })
    }
  } catch (err) {
    res.json({ success: false, error: err instanceof Error ? err.message : '连接失败' })
  }
})
