import { useEffect, useCallback } from 'react'

/**
 * 绑定键盘快捷键
 * @param key 目标键名（如 'Enter'）
 * @param callback 触发回调
 * @param options.meta 是否需要 Cmd/Ctrl 键同时按下
 * @param options.enabled 是否启用（默认 true）
 */
export function useHotkey(
  key: string,
  callback: () => void,
  options: { meta?: boolean; enabled?: boolean } = {}
) {
  const { meta = false, enabled = true } = options

  const handler = useCallback((e: KeyboardEvent) => {
    if (!enabled) return
    const metaMatch = !meta || e.metaKey || e.ctrlKey
    if (e.key === key && metaMatch) {
      // 不拦截 textarea 里的 Enter（除非有 meta）
      const target = e.target as HTMLElement
      if (key === 'Enter' && !meta && target.tagName === 'TEXTAREA') return
      e.preventDefault()
      callback()
    }
  }, [key, callback, meta, enabled])

  useEffect(() => {
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handler])
}
