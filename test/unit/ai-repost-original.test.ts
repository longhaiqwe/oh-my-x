import { describe, expect, it } from 'vitest'
import original from '../fixtures/ai-repost-original-prompts.json'
import { buildRepostMessages, buildRepostSystemPrompt } from '../../shared/ai-repost'

// 固定内容直接取自新增风格前的版本，不从当前提示词生成预期值。
describe('preserves original detailed prompts', () => {
  it.each(['zh-CN', 'en'] as const)('keeps the complete original system prompt for the original pair (%s)', locale => {
    const text = original[locale]
    const styleHeading = locale === 'en' ? '[Writing style]' : '【语言风格】'
    expect(buildRepostSystemPrompt({ optionA: 'summary', optionB: 'extension' }, locale))
      .toBe([text.intro, `${styleHeading}\n${text.style}`, text.options, text.banned, text.format].join('\n\n'))
    const [, user] = buildRepostMessages({ text: '原文' }, undefined, { optionA: 'summary', optionB: 'extension' }, locale)
    expect(user.content).toContain(locale === 'en' ? 'optionA: key points; optionB: take and follow-up' : 'optionA 为干货脱水总结，optionB 为观点共鸣与延伸')
  })

  it.each(['zh-CN', 'en'] as const)('keeps the original detailed content when paired with a short style (%s)', locale => {
    const prompt = buildRepostSystemPrompt({}, locale)
    const detailed = prompt.split('[optionA]')[1].split('[optionB]')[0]
    const short = prompt.split('[optionB]')[1]
    expect(detailed).toContain(original[locale].style)
    expect(detailed).toContain(original[locale].options.split('\n')[1])
    expect(detailed).not.toMatch(/60—120|160 字|不加开场|不机械列点|不加.*结尾|30–60|at most 80|no formulaic lists/)
    expect(short).toContain(locale === 'en' ? 'at most 40' : '最多 80 字')
    expect(short).not.toContain(original[locale].style)
  })

  it('preserves user preferences for the original pair', () => {
    const prompt = buildRepostSystemPrompt({ optionA: 'summary', optionB: 'extension', description: '保留背景介绍', samples: '我的原有样本' })
    expect(prompt).toContain('【语言风格（用户自己的描述，优先遵守）】\n保留背景介绍')
    expect(prompt).toContain('样本 1：\n我的原有样本')
    expect(prompt).not.toContain(original['zh-CN'].style)
    expect(prompt).toContain(original['zh-CN'].options)
  })
})

// 路由分类器即使只读取用户消息的开头，也应拿到完整的任务性质。
describe('makes the task explicit to user-message-only intent routers', () => {
  const cases = [
    { optionA: 'summary', optionB: 'summary-short' },
    { optionA: 'summary', optionB: 'extension' },
    { optionA: 'custom:brief', optionB: 'extension-short', styles: [
      { id: 'custom:brief', name: '短评', base: 'summary-short' as const, description: '用短句', samples: '' },
    ] },
  ]
  for (const locale of ['zh-CN', 'en'] as const) {
    it.each(cases)(`puts the task before a long foreign source without changing style instructions (${locale}): $optionA / $optionB`, style => {
      const source = { title: 'An English article', text: 'This is source material. '.repeat(600) }
      const [system, user] = buildRepostMessages(source, '额外要求', style, locale)
      const firstParagraph = user.content.split('\n\n')[0]
      expect(firstParagraph).toContain(locale === 'en' ? 'summarize the source and write quote-post drafts' : '原文总结与转发文案创作')
      expect(firstParagraph).toContain(locale === 'en' ? 'do not translate it sentence by sentence' : '不做逐句翻译')
      expect(firstParagraph.length).toBeLessThan(1000)
      expect(user.content.indexOf(firstParagraph)).toBeLessThan(user.content.indexOf(source.title))
      expect(user.content).toContain(source.text.slice(0, 12000))
      expect(user.content).toContain(locale === 'en' ? '(content truncated)' : '(正文已截断)')
      expect(user.content).toContain('额外要求')
      expect(system.content).toBe(buildRepostSystemPrompt(style, locale))
    })
  }
})
