import { describe, it, expect } from 'vitest'
import { parseOptions, stripOptions } from '@/services/parseOptions'

describe('parseOptions', () => {
  it('解析 single 模式选项', () => {
    const result = parseOptions('请选择[OPTIONS:single:选项A, 选项B, 选项C]')
    expect(result.content).toBe('请选择')
    expect(result.options).toEqual(['选项A', '选项B', '选项C'])
    expect(result.optionMode).toBe('single')
  })

  it('解析 multi 模式选项', () => {
    const result = parseOptions('多选[OPTIONS:multi:红色, 蓝色, 绿色]')
    expect(result.content).toBe('多选')
    expect(result.options).toEqual(['红色', '蓝色', '绿色'])
    expect(result.optionMode).toBe('multi')
  })

  it('无选项时返回空数组', () => {
    const result = parseOptions('普通文本消息')
    expect(result.content).toBe('普通文本消息')
    expect(result.options).toEqual([])
    expect(result.optionMode).toBe('single')
  })

  it('过滤空白选项', () => {
    const result = parseOptions('[OPTIONS:single:A,  , B, , C]')
    expect(result.options).toEqual(['A', 'B', 'C'])
  })

  it('选项前后有空格时 trim', () => {
    const result = parseOptions('[OPTIONS:single: 选项一 , 选项二 ,  选项三  ]')
    expect(result.options).toEqual(['选项一', '选项二', '选项三'])
  })

  it('content 保留选项标记之外的文本', () => {
    const result = parseOptions('你好！请选择模板：[OPTIONS:single:模板A, 模板B]')
    expect(result.content).toBe('你好！请选择模板：')
  })

  it('多个 OPTIONS 标记只解析第一个', () => {
    const result = parseOptions('[OPTIONS:single:A, B] 还有 [OPTIONS:multi:C, D]')
    expect(result.options).toEqual(['A', 'B'])
    expect(result.optionMode).toBe('single')
  })
})

describe('stripOptions', () => {
  it('移除 OPTIONS 标记', () => {
    expect(stripOptions('请选择[OPTIONS:single:A, B]')).toBe('请选择')
  })

  it('无 OPTIONS 时原样返回', () => {
    expect(stripOptions('普通消息')).toBe('普通消息')
  })

  it('移除后 trim 多余空格', () => {
    expect(stripOptions('  文本  [OPTIONS:single:A, B]  ')).toBe('文本')
  })
})
