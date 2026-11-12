import { describe, expect, it } from 'vitest'
import { parseRepostStyles, normalizeRepostPresets } from '../../shared/ai-repost-presets'
import { normalizeSettings } from '../../shared/settings'
import { buildRepostSystemPrompt } from '../../shared/ai-repost'

const styles = [
  { id: 'custom:first', name: '技术笔记', base: 'summary', description: '保留技术限制，最多 100 字', samples: '第一种语气样本' },
  { id: 'custom:second', name: '轻松短句', base: 'summary-short', description: '20 字左右，轻微俏皮', samples: '第二种语气样本' },
] as const

describe('repost style library', () => {
  it('migrates legacy short replies and resolves deleted or invalid style references', () => {
    const library = parseRepostStyles(styles)
    expect(normalizeRepostPresets({ optionA: 'reply', optionB: 'custom:second' }, library))
      .toEqual({ optionA: 'summary-short', optionB: 'custom:second' })
    expect(normalizeRepostPresets({ optionA: 'custom:missing', optionB: 'custom:second' }))
      .toEqual({ optionA: 'summary', optionB: 'summary-short' })
    const stored = normalizeSettings({ aiRepostStyles: JSON.stringify(styles), aiRepostOptionA: 'custom:first', aiRepostOptionB: 'custom:second' })
    expect(stored.aiRepostOptionA).toBe('custom:first')
    expect(stored.aiRepostOptionB).toBe('custom:second')
    expect(JSON.parse(stored.aiRepostStyles)).toEqual(styles)
  })

  it('rejects corrupt entries and duplicate or built-in ids without losing valid styles', () => {
    expect(parseRepostStyles('{broken')).toEqual([])
    expect(parseRepostStyles('{}')).toEqual([])
    expect(parseRepostStyles([null, { id: 'summary', name: 'override' }, { id: 'custom:blank', name: ' ' }, ...styles, styles[0]]))
      .toEqual(styles)
  })

  it.each(['zh-CN', 'en'] as const)('keeps requirements and samples scoped to their selected option (%s)', locale => {
    const prompt = buildRepostSystemPrompt({
      optionA: 'custom:first', optionB: 'custom:second', styles: parseRepostStyles(styles),
      description: '旧的共用描述', samples: '旧的共用样本',
    }, locale)
    const first = prompt.split('[optionA]')[1].split('[optionB]')[0]
    const second = prompt.split('[optionB]')[1]
    expect(first).toContain(styles[0].description)
    expect(first).toContain(styles[0].samples)
    expect(first).not.toContain(styles[1].samples)
    expect(second).toContain(styles[1].description)
    expect(second).toContain(styles[1].samples)
    expect(second).not.toContain(styles[0].description)
    expect(prompt).not.toContain('旧的共用')
  })

  it('keeps legacy preferences for the built-in option only', () => {
    const prompt = buildRepostSystemPrompt({ optionA: 'summary', optionB: 'custom:second', styles: parseRepostStyles(styles), description: '旧偏好', samples: '旧样本' })
    const first = prompt.split('[optionA]')[1].split('[optionB]')[0]
    const second = prompt.split('[optionB]')[1]
    expect(first).toContain('旧偏好')
    expect(first).toContain('旧样本')
    expect(second).not.toContain('旧偏好')
    expect(second).not.toContain('旧样本')
  })
})
