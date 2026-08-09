import { useState, useEffect } from 'react'
import { Settings, Key, Check, Loader2, Eye, EyeOff, ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { settingsApi } from '../../api'
import toast from 'react-hot-toast'
import { cn } from '../../utils/cn'

interface ProviderInfo { id: string; name: string; defaultModel: string }
interface ProviderState { enabled: boolean; api_key: string; has_key: boolean; model: string }

const PROVIDER_ICONS: Record<string, string> = {
  deepseek: '🔮', openai: '🤖', claude: '🎭', qwen: '🌊',
  kimi: '🌙', zhipu: '🧠', gemini: '💎',
}

export default function SettingsPage() {
  const [providers, setProviders] = useState<Record<string, ProviderState>>({})
  const [providerList, setProviderList] = useState<ProviderInfo[]>([])
  const [fallbackOrder, setFallbackOrder] = useState<string[]>([])
  const [defaultProvider, setDefaultProvider] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, boolean | null>>({})
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    settingsApi.getModels().then(res => {
      const { config, provider_list } = res.data.data
      setProviderList(provider_list)
      setDefaultProvider(config.default_provider || '')
      setFallbackOrder(config.fallback_order || [])
      const states: Record<string, ProviderState> = {}
      for (const p of provider_list) {
        const conf = config.providers?.[p.id] || {}
        states[p.id] = { enabled: conf.enabled ?? false, api_key: '', has_key: conf.has_key ?? false, model: conf.model || p.defaultModel }
      }
      setProviders(states)
      const exp: Record<string, boolean> = {}
      for (const p of provider_list) {
        if (states[p.id].enabled || states[p.id].has_key) exp[p.id] = true
      }
      setExpanded(exp)
    }).finally(() => setLoading(false))
  }, [])

  async function save() {
    setSaving(true)
    try {
      const providerData: Record<string, unknown> = {}
      for (const [id, state] of Object.entries(providers)) {
        providerData[id] = { enabled: state.enabled, model: state.model, api_key: state.api_key || undefined }
      }
      await settingsApi.saveModels({ default_provider: defaultProvider, fallback_order: fallbackOrder, providers: providerData })
      const res = await settingsApi.getModels()
      const newConf = res.data.data.config.providers || {}
      setProviders(prev => {
        const next = { ...prev }
        for (const id of Object.keys(next)) {
          next[id] = { ...next[id], has_key: newConf[id]?.has_key ?? next[id].has_key, api_key: '' }
        }
        return next
      })
      setShowKeys({})
      toast.success('配置已保存')
    } catch {} finally { setSaving(false) }
  }

  async function testProvider(id: string) {
    const state = providers[id]
    if (!state.api_key && !state.has_key) return void toast.error('请先输入 API Key')
    setTesting(id)
    try {
      const res = await settingsApi.testProvider(id, state.api_key || '')
      setTestResults(prev => ({ ...prev, [id]: res.data.success }))
      if (res.data.success) toast.success(res.data.message)
      else toast.error(res.data.error || '连接失败')
    } catch {} finally { setTesting(null) }
  }

  function updateProvider(id: string, field: string, value: unknown) {
    setProviders(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  function moveOrder(id: string, dir: 'up' | 'down') {
    setFallbackOrder(prev => {
      const base = prev.length ? [...prev] : providerList.filter(p => providers[p.id]?.enabled).map(p => p.id)
      const idx = base.indexOf(id)
      if (idx === -1) return base
      const list = [...base]
      if (dir === 'up' && idx > 0) [list[idx-1], list[idx]] = [list[idx], list[idx-1]]
      if (dir === 'down' && idx < list.length-1) [list[idx], list[idx+1]] = [list[idx+1], list[idx]]
      return list
    })
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 size={24} className="animate-spin text-slate-500" /></div>

  const enabledProviders = providerList.filter(p => providers[p.id]?.enabled)
  const orderList = (fallbackOrder.length ? fallbackOrder : enabledProviders.map(p => p.id)).filter(id => providers[id]?.enabled)

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="section-header">
        <div className="flex items-center gap-3 mb-1"><Settings size={20} className="text-slate-400" /><h1 className="section-title mb-0">模型设置</h1></div>
        <p className="section-desc">配置你自己的 AI 模型 Key（BYOK），Key 使用 AES-256-GCM 加密存储在服务端</p>
      </div>

      {/* Provider 列表 */}
      <div className="space-y-3">
        {providerList.map(p => {
          const state = providers[p.id]; if (!state) return null
          const testResult = testResults[p.id]
          return (
            <div key={p.id} className={cn('card overflow-hidden transition-all', !state.enabled && 'opacity-60')}>
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-xl">{PROVIDER_ICONS[p.id] || '🤖'}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-slate-200">{p.name}</span>
                    {state.has_key && !state.api_key && <span className="badge bg-brand-500/15 text-brand-400 text-[10px]">✓ 已配置</span>}
                    {testResult === true  && <span className="badge bg-brand-500/15 text-brand-400 text-[10px]">✓ 连接正常</span>}
                    {testResult === false && <span className="badge bg-red-500/15 text-red-400 text-[10px]">✗ 连接失败</span>}
                  </div>
                  <div className="text-xs text-slate-500">{state.model || p.defaultModel}</div>
                </div>
                <button onClick={() => updateProvider(p.id, 'enabled', !state.enabled)}
                  className={cn('relative w-10 h-5 rounded-full transition-colors', state.enabled ? 'bg-brand-600' : 'bg-dark-600')}>
                  <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', state.enabled ? 'translate-x-5' : 'translate-x-0.5')} />
                </button>
                <button onClick={() => setExpanded(prev => ({ ...prev, [p.id]: !prev[p.id] }))} className="text-slate-500 hover:text-slate-300 p-1">
                  {expanded[p.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              </div>
              {expanded[p.id] && (
                <div className="px-4 pb-4 border-t border-dark-500 pt-3 space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      <Key size={11} className="inline mr-1" />API Key{state.has_key && <span className="text-slate-500 ml-1 font-normal">（留空保留现有 Key）</span>}
                    </label>
                    <div className="relative">
                      <input type={showKeys[p.id] ? 'text' : 'password'} value={state.api_key}
                        onChange={e => updateProvider(p.id, 'api_key', e.target.value)}
                        placeholder={state.has_key ? '已配置，留空则保留' : `输入 ${p.name} API Key`}
                        className="input-base pr-20 font-mono text-xs" />
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                        <button onClick={() => setShowKeys(prev => ({ ...prev, [p.id]: !prev[p.id] }))} className="p-1 text-slate-500 hover:text-slate-300">
                          {showKeys[p.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button onClick={() => testProvider(p.id)} disabled={testing === p.id} className="text-xs text-brand-400 hover:text-brand-300 px-1 font-medium">
                          {testing === p.id ? <Loader2 size={12} className="animate-spin" /> : '测试'}
                        </button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">使用模型</label>
                    <input value={state.model} onChange={e => updateProvider(p.id, 'model', e.target.value)}
                      className="input-base text-xs font-mono" placeholder={p.defaultModel} />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 故障切换顺序 */}
      {enabledProviders.length > 1 && (
        <div className="card p-5">
          <div className="text-sm font-medium text-slate-300 mb-1 flex items-center gap-2"><GripVertical size={14} className="text-slate-500" />故障切换优先级</div>
          <p className="text-xs text-slate-500 mb-3">当某个服务商不可用时，按以下顺序自动切换</p>
          <div className="space-y-1.5">
            {orderList.map((id, idx) => {
              const p = providerList.find(x => x.id === id); if (!p) return null
              return (
                <div key={id} className="flex items-center gap-3 bg-dark-300 rounded-lg px-3 py-2.5">
                  <span className="text-xs text-slate-500 w-4 font-mono">{idx + 1}</span>
                  <span>{PROVIDER_ICONS[id] || '🤖'}</span>
                  <span className="text-sm text-slate-200 flex-1">{p.name}</span>
                  <div className="flex gap-1">
                    <button onClick={() => moveOrder(id, 'up')} disabled={idx === 0} className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30"><ChevronUp size={13} /></button>
                    <button onClick={() => moveOrder(id, 'down')} disabled={idx === orderList.length-1} className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30"><ChevronDown size={13} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-4">
        <button onClick={save} disabled={saving} className="btn-primary px-8">
          {saving ? <><Loader2 size={14} className="animate-spin" />保存中...</> : <><Check size={14} />保存配置</>}
        </button>
        <p className="text-xs text-slate-500">🔒 Key 使用 AES-256-GCM 加密存储，绝不以明文返回前端</p>
      </div>
    </div>
  )
}
