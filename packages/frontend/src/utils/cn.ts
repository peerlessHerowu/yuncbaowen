/**
 * 简单的 className 合并工具（不引入 clsx/cn 依赖）
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ')
}
