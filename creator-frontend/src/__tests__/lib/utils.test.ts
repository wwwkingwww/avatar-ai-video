import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn', () => {
  it('合并多个 class 字符串', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('过滤 falsy 值', () => {
    expect(cn('foo', false && 'bar', undefined, null, 'baz')).toBe('foo baz')
  })

  it('处理条件 class', () => {
    const active = true
    const disabled = false
    expect(cn('base', active && 'active', disabled && 'disabled')).toBe('base active')
  })

  it('使用 twMerge 解决 tailwind 冲突', () => {
    expect(cn('px-4', 'px-2')).toBe('px-2')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('空输入返回空字符串', () => {
    expect(cn()).toBe('')
  })

  it('混合 clsx 对象语法和字符串', () => {
    expect(cn('base', { active: true, disabled: false })).toBe('base active')
  })
})
