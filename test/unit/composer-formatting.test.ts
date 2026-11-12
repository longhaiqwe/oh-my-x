import { describe, expect, it } from 'vitest'
import { COMPOSER_FORMATS, planComposerFormat, mapFormatPoint, type ComposerFormat } from '../../shared/composer-formatting'

function apply(text: string, format: ComposerFormat, start = 0, end = text.length) {
  const plan = planComposerFormat([{ block: 0, text, start, end }], format)!
  let result = text
  for (const edit of [...plan.edits].reverse()) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  return { result, plan, start: mapFormatPoint(plan.start, plan.edits, 'start').offset, end: mapFormatPoint(plan.end, plan.edits, 'end').offset }
}

describe('发帖格式计划', () => {
  it.each(COMPOSER_FORMATS)('%s 可连续添加、取消，并恢复原文', format => {
    const original = '中文说明 English\n\n第二段 café 👨‍👩‍👧‍👦'
    const added = apply(original, format)
    expect(added.result).not.toBe(original)
    expect(added.start).toBe(0)
    expect(added.end).toBe(added.result.length)
    const removed = apply(added.result, format, added.start, added.end)
    expect(removed.plan.active).toBe(true)
    expect(removed.result).toBe(original)
    expect(removed.end).toBe(original.length)
  })

  it('编号跳过空行，超过九行时正确映射选区', () => {
    const original = Array.from({ length: 12 }, (_, i) => `条目${i}`).join('\n\n')
    const { result, end } = apply(original, 'number')
    expect(result).toContain('10. 条目9')
    expect(result).toContain('12. 条目11')
    expect(end).toBe(result.length)
    expect(apply(result, 'number').result).toBe(original)
  })

  it('编号和圆点互相转换，不重复堆叠前缀', () => {
    expect(apply('• 甲\n乙\n7. 丙', 'number').result).toBe('1. 甲\n2. 乙\n3. 丙')
    expect(apply('1. 甲\n2. 乙\n3. 丙', 'bullet').result).toBe('• 甲\n• 乙\n• 丙')
  })

  it.each(COMPOSER_FORMATS)('%s 不修改正文中的旧引用符号和组合字符', format => {
    const original = '> 原文\n删̶除̶ 下̲划̲线̲'
    const added = apply(original, format)
    expect(apply(added.result, format, added.start, added.end).result).toBe(original)
  })
})
