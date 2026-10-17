import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  buildRepostMessages,
  buildRepostSystemPrompt,
  DEFAULT_REPOST_STYLE,
  extractTweetFullTextFromGraphql,
  parseAiRepostResponse,
  parseStyleSamples,
  resolveChatCompletionsUrl,
  sanitizeAiTone,
} from '../../shared/ai-repost'
import {
  extractLocalRepostSource,
  findAudienceButtonInModal,
  replaceComposeEditorText,
  updateAiRepostComposerButton,
} from '../../content-scripts/features/ai-repost'

describe('shared/ai-repost', () => {
  it('normalizes OpenAI-compatible chat completions URLs', () => {
    expect(resolveChatCompletionsUrl('')).toBe('https://api.openai.com/v1/chat/completions')
    expect(resolveChatCompletionsUrl('https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/chat/completions',
    )
    expect(resolveChatCompletionsUrl('https://api.openai.com/v1/')).toBe(
      'https://api.openai.com/v1/chat/completions',
    )
    expect(resolveChatCompletionsUrl('https://api.deepseek.com')).toBe(
      'https://api.deepseek.com/v1/chat/completions',
    )
    expect(resolveChatCompletionsUrl('https://ark.cn-beijing.volces.com/api/v3')).toBe(
      'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
    )
    expect(resolveChatCompletionsUrl('https://custom.proxy.com/v1/chat/completions')).toBe(
      'https://custom.proxy.com/v1/chat/completions',
    )
  })

  it('sanitizes banned AI adverbs and clichés', () => {
    const raw =
      '“这篇文章极其重要，完美解决了痛点，实现无缝衔接，彻底秒杀同类工具，让人醍醐灌顶！”'
    const cleaned = sanitizeAiTone(raw)
    expect(cleaned).not.toContain('极其')
    expect(cleaned).not.toContain('完美')
    expect(cleaned).not.toContain('无缝')
    expect(cleaned).not.toContain('彻底')
    expect(cleaned).not.toContain('秒杀')
    expect(cleaned).not.toContain('醍醐灌顶')
    expect(cleaned.startsWith('“')).toBe(false)
  })

  it('builds system and user messages with distilled style and anti-AI rules', () => {
    const msgs = buildRepostMessages(
      {
        authorName: '孟岩',
        authorHandle: 'myanTokenGeek',
        title: '没有什么能把我们的人生分为两段',
        text: '在播客《无人知晓》中，孟岩举了他写《投资第一课》这门课程的经历。',
      },
      '控制在 100 字以内',
    )

    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('system')
    expect(msgs[0].content).toBe(buildRepostSystemPrompt())
    expect(msgs[0].content).toContain('拟人化与过度隐喻')
    expect(msgs[0].content).toContain('鸡汤式心理抚慰')
    expect(msgs[0].content).toContain('设问式推销腔')
    expect(msgs[0].content).toContain('极端副词与空洞修饰')

    expect(msgs[1].role).toBe('user')
    expect(msgs[1].content).toContain('孟岩 (@myanTokenGeek)')
    expect(msgs[1].content).toContain('没有什么能把我们的人生分为两段')
    expect(msgs[1].content).toContain('控制在 100 字以内')
  })

  it('默认风格不带任何个人身份或账号', () => {
    const prompt = buildRepostSystemPrompt()
    expect(prompt).toContain(DEFAULT_REPOST_STYLE)
    for (const personal of ['龙海', 'longhaiqwe123', '带娃', '下厨', '数据库内核']) {
      expect(prompt).not.toContain(personal)
    }
  })

  it('填写风格描述后替换默认风格，样本作为参考附上', () => {
    const prompt = buildRepostSystemPrompt({
      description: '开头直接说结论，多用短句',
      samples: '第一条样本\n第二行\n\n第二条样本',
    })
    expect(prompt).toContain('开头直接说结论，多用短句')
    expect(prompt).not.toContain(DEFAULT_REPOST_STYLE)
    expect(prompt).toContain('样本 1：\n第一条样本\n第二行')
    expect(prompt).toContain('样本 2：\n第二条样本')
    expect(prompt).toContain('严禁照抄样本内容')
    // 通用规则仍然保留
    expect(prompt).toContain('拟人化与过度隐喻')
    expect(prompt).toContain('"optionA"')
  })

  it('有 --- 分隔时按 --- 拆，一条样本内部可以分段', () => {
    const raw = '第一条第一段\n\n第一条第二段\n---\n第二条\n\n  ---  \n第三条'
    expect(parseStyleSamples(raw)).toEqual(['第一条第一段\n\n第一条第二段', '第二条', '第三条'])
  })

  it('没有 --- 时按空行拆分，最多取 5 条，单条过长会截断', () => {
    expect(parseStyleSamples('')).toEqual([])
    expect(parseStyleSamples('a\r\n\r\nb\n  \nc')).toEqual(['a', 'b', 'c'])
    expect(parseStyleSamples(['1', '2', '3', '4', '5', '6'].join('\n\n'))).toHaveLength(5)
    expect(parseStyleSamples('x'.repeat(700))[0]).toHaveLength(601)
  })

  it('只填样本时仍使用默认风格描述', () => {
    const prompt = buildRepostSystemPrompt({ samples: '一条样本' })
    expect(prompt).toContain(DEFAULT_REPOST_STYLE)
    expect(prompt).toContain('样本 1：\n一条样本')
  })

  it('parses JSON, fenced JSON, and fallback text into two options', () => {
    const jsonResp = JSON.stringify({
      optionA: '这篇把投资课背后的写作过程拆得很清楚：1）全情投入 2）持续迭代。',
      optionB: '很认可文中的观点，做产品和写文章一样，都需要一段高密度的专注期。',
    })
    const parsed1 = parseAiRepostResponse(jsonResp)
    expect(parsed1.optionA).toContain('1）全情投入')
    expect(parsed1.optionB).toContain('很认可文中的观点')

    const fencedResp =
      '```json\n{"optionA": "极其清楚的总结", "optionB": "完美命中我的需求"}\n```'
    const parsed2 = parseAiRepostResponse(fencedResp)
    expect(parsed2.optionA).toBe('很清楚的总结')
    expect(parsed2.optionB).toBe('很好地命中我的需求')

    const plainTextResp =
      '选项A：第一套干货脱水总结文案\n\n选项B：第二套个人共鸣延伸文案'
    const parsed3 = parseAiRepostResponse(plainTextResp)
    expect(parsed3.optionA).toBe('第一套干货脱水总结文案')
    expect(parsed3.optionB).toBe('第二套个人共鸣延伸文案')
  })

  it('extracts full text from X GraphQL TweetResultByRestId for X Article and NoteTweet', () => {
    const articlePayload = {
      data: {
        tweetResult: {
          result: {
            rest_id: '12345',
            core: {
              user_results: {
                result: {
                  legacy: { name: '龙海', screen_name: 'longhaiqwe123' },
                },
              },
            },
            article: {
              article_results: {
                result: {
                  title: '严肃听播客工作流',
                  plain_text: '获取英文文字稿 -> AI 整理初稿 -> 自己审阅修改',
                },
              },
            },
          },
        },
      },
    }

    const res = extractTweetFullTextFromGraphql(articlePayload, '12345')
    expect(res).toEqual({
      authorName: '龙海',
      authorHandle: 'longhaiqwe123',
      title: '严肃听播客工作流',
      text: '获取英文文字稿 -> AI 整理初稿 -> 自己审阅修改',
    })
  })
})

describe('content-scripts/features/ai-repost DOM behavior', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('injects AI repost button right next to the audience selector button (Everyone / 每个人) and extracts quoted tweet', async () => {
    document.body.innerHTML = `
      <div aria-labelledby="modal-header" role="dialog">
        <div>
          <div class="audience-row">
            <button type="button" aria-haspopup="menu"><span>每个人</span></button>
          </div>
          <div class="DraftEditor-root">
            <div class="DraftEditor-editorContainer">
              <div contenteditable="true" data-testid="tweetTextarea_0">旧的草稿文字</div>
            </div>
          </div>
          <div class="quoted-card">
            <div data-testid="User-Name">龙海 @longhaiqwe123 · 17小时</div>
            <div data-testid="tweetText">没有什么能把我们的人生分为两段 by 孟岩。在播客《无人知晓》中，孟岩举了他写《投资第一课》这门课程的经历。</div>
          </div>
        </div>
      </div>
    `

    const modalEl = document.querySelector<HTMLElement>('[role="dialog"]')!
    const audienceBtn = findAudienceButtonInModal(modalEl)
    expect(audienceBtn).not.toBeNull()
    expect(audienceBtn?.textContent).toBe('每个人')

    await updateAiRepostComposerButton()

    const triggerBtn = modalEl.querySelector<HTMLButtonElement>('.xf-ai-repost-trigger')
    expect(triggerBtn).not.toBeNull()
    expect(audienceBtn?.nextElementSibling).toBe(triggerBtn)
    expect(audienceBtn?.parentElement?.classList.contains('xf-ai-repost-audience-row')).toBe(true)
    expect(audienceBtn?.parentElement?.style.flexDirection).toBe('row')
    expect(audienceBtn?.parentElement?.style.gap).toBe('8px')

    const { source } = extractLocalRepostSource(modalEl)
    expect(source).not.toBeNull()
    expect(source?.authorHandle).toBe('longhaiqwe123')
    expect(source?.text).toContain('没有什么能把我们的人生分为两段')

    // 测试替换编辑器内容并可在两个选项间切换
    replaceComposeEditorText(modalEl, '选项一：干货总结文本')
    const editor = modalEl.querySelector<HTMLElement>('[data-testid="tweetTextarea_0"]')!
    expect(editor.textContent).toBe('选项一：干货总结文本')

    replaceComposeEditorText(modalEl, '选项二：共鸣延伸文本')
    expect(editor.textContent).toBe('选项二：共鸣延伸文本')
  })
})
