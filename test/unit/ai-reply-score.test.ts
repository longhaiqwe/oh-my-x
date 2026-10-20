import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  REPLY_SCORE_SIGNALS,
  REPLY_SCORE_TEXT_LIMIT,
  buildReplyScoreMessages,
  buildReplyScoreSystemPrompt,
  buildReplyScoreUserMessage,
  parseReplyScoreResponse,
  replyDelaySeconds,
} from '../../shared/ai-reply-score'
import { CodedError } from '../../shared/errors'
import { extractAuthorVerified, extractTweetId, extractTweetTime } from '../../shared/parse-tweet'
import { knownFollowerCount, userMetricsMemory } from '../../content-scripts/features/user-followers'

const parent = { id: '100', author: 'alice', text: '主帖正文' }

describe('AI 打分提示词', () => {
  it('中英两版都列出全部信号，并在最后固定追加输出格式', () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      const prompt = buildReplyScoreSystemPrompt(locale)
      for (const signal of REPLY_SCORE_SIGNALS) expect(prompt).toContain(`- ${signal} `)
      expect(prompt.trim().endsWith('{"results":[{"id":' + (locale === 'en' ? '"reply id"' : '"回复 id"') + ',"score":0,"signals":[],"reason":"…"}]}')).toBe(true)
    }
    expect(buildReplyScoreSystemPrompt('zh-CN')).toContain('一句中文')
    expect(buildReplyScoreSystemPrompt('en')).toContain('one English sentence')
    expect(buildReplyScoreSystemPrompt('en')).not.toMatch(/一句中文/)
  })

  it('第 2 版：复述原帖细节、顺着原帖提问不再算真人特征；蓝 V 低粉只作辅助', () => {
    const zh = buildReplyScoreSystemPrompt('zh-CN')
    expect(zh).not.toContain('追问原帖细节的回复，更可能是真人写的')
    expect(zh).toContain('复述原帖的细节、顺着原帖问一个问题，都不算真人特征')
    expect(zh).toContain('S10 同批雷同（中）')
    expect(zh).toContain('S11 认同 + 复述 + 补一句（中）')
    expect(zh).toContain('不能单靠它把分数打到 31 以上')
    const en = buildReplyScoreSystemPrompt('en')
    expect(en).toContain('S10 Near-identical replies (medium)')
    expect(en).toContain('must not push the score above 30')
  })

  it('请求内容是 JSON：主帖只带作者和正文，回复带 id、作者、正文、间隔秒数', () => {
    const user = JSON.parse(buildReplyScoreUserMessage(parent, [
      { id: '101', author: 'bob', text: '  说得好  ', delaySeconds: 30, followers: 64, verified: true },
      { id: '102', author: 'carl', text: '没有时间', delaySeconds: null },
    ]))
    expect(user).toEqual({
      parent: { author: 'alice', text: '主帖正文' },
      replies: [
        { id: '101', author: 'bob', text: '说得好', delaySeconds: 30, followers: 64, verified: true },
        { id: '102', author: 'carl', text: '没有时间', delaySeconds: null, followers: null, verified: null },
      ],
    })
    const messages = buildReplyScoreMessages(parent, [], 'en')
    expect(messages.map((m) => m.role)).toEqual(['system', 'user'])
  })

  it('正文按字截断，不拆开 emoji', () => {
    const long = '😀'.repeat(REPLY_SCORE_TEXT_LIMIT + 10)
    const user = JSON.parse(buildReplyScoreUserMessage(parent, [{ id: '1', author: 'a', text: long, delaySeconds: null }]))
    expect(Array.from(user.replies[0].text)).toHaveLength(REPLY_SCORE_TEXT_LIMIT + 1)
    expect(user.replies[0].text.endsWith('😀…')).toBe(true)
  })
})

describe('解析模型返回', () => {
  it('容忍 JSON 前后的多余文字和代码块标记', () => {
    const text = '好的，结果如下：\n```json\n{"results":[{"id":"101","score":82,"signals":["S1","s6"],"reason":"万能夸奖"}]}\n```'
    expect(parseReplyScoreResponse(text, ['101'])).toEqual([{ id: '101', score: 82, signals: ['S1', 'S6'], reason: '万能夸奖' }])
  })

  it('分数四舍五入并限制在 0–100；丢掉缺 ID、不在本批、重复、分数不是数字的条目和未知信号', () => {
    const text = JSON.stringify({
      results: [
        { id: 101, score: 120.4, signals: ['S1', 'S99', 'S1'], reason: 'a' },
        { id: '102', score: -5 },
        { id: '103', score: 49.5, signals: 'S2' },
        { score: 50 },
        { id: '999', score: 50 },
        { id: '101', score: 10 },
        { id: '104', score: 'high' },
      ],
    })
    expect(parseReplyScoreResponse(text, ['101', '102', '103', '104'])).toEqual([
      { id: '101', score: 100, signals: ['S1'], reason: 'a' },
      { id: '102', score: 0, signals: [], reason: '' },
      { id: '103', score: 50, signals: [], reason: '' },
    ])
  })

  it('解析不出 results 数组时抛出错误代号', () => {
    for (const text of ['', '没有 JSON', '{"results":', '{"items":[]}']) {
      try {
        parseReplyScoreResponse(text, ['1'])
        expect.unreachable()
      } catch (error) {
        expect((error as CodedError).code).toBe('error.aiScoreParse')
      }
    }
  })
})

describe('回复间隔', () => {
  it('按秒取整；缺时间或回复早于主帖时为 null', () => {
    expect(replyDelaySeconds(1_000, 42_600)).toBe(42)
    expect(replyDelaySeconds(null, 1)).toBeNull()
    expect(replyDelaySeconds(1, null)).toBeNull()
    expect(replyDelaySeconds(5_000, 1_000)).toBeNull()
  })
})

describe('推文 ID 和发布时间', () => {
  function article(html: string) {
    document.body.innerHTML = `<article data-testid="tweet">${html}</article>`
    return document.querySelector<HTMLElement>('article')!
  }

  it('取时间戳所在的链接，跳过引用推文', () => {
    const el = article(`
      <a href="/bob" role="link">@bob</a>
      <div data-testid="quoteTweet"><a href="/carl/status/300"><time datetime="2026-10-01T00:00:00.000Z"></time></a></div>
      <a href="/bob/status/200"><time datetime="2026-10-20T08:00:05.000Z"></time></a>
    `)
    expect(extractTweetId(el)).toBe('200')
    expect(extractTweetTime(el)).toBe(Date.parse('2026-10-20T08:00:05.000Z'))
  })

  it('蓝 V 看作者名区域里的认证标志，引用推文里的不算', () => {
    expect(extractAuthorVerified(article(`
      <div data-testid="User-Name"><span>Bob</span></div>
      <div data-testid="quoteTweet"><div data-testid="User-Name"><svg data-testid="icon-verified"></svg></div></div>
    `))).toBe(false)
    expect(extractAuthorVerified(article('<div data-testid="User-Name"><svg data-testid="icon-verified" aria-label="认证账号"></svg></div>'))).toBe(true)
    expect(extractAuthorVerified(article('<a href="/bob">@bob</a>'))).toBeNull()
  })

  it('粉丝数先读拦截器写在作者名上的值（handle 要对得上），再读内存缓存', () => {
    const el = article('<div data-testid="User-Name" data-xf-screen-name="Bob" data-xf-followers-count="64"></div>')
    const nameEl = el.querySelector('[data-testid="User-Name"]')
    expect(knownFollowerCount('bob', nameEl)).toBe(64)
    expect(knownFollowerCount('carl', nameEl)).toBeNull()
    userMetricsMemory.carl = { screenName: 'Carl', followersCount: 1200 }
    expect(knownFollowerCount('Carl', nameEl)).toBe(1200)
    delete userMetricsMemory.carl
  })

  it('没有时间戳时取第一个 /status/ 链接；都没有时返回 null', () => {
    expect(extractTweetId(article('<a href="/bob/status/201/analytics">x</a>'))).toBe('201')
    expect(extractTweetId(article('<a href="/bob">@bob</a>'))).toBeNull()
    expect(extractTweetTime(article('<time datetime="bad"></time>'))).toBeNull()
  })
})

describe('样例集', () => {
  const data = JSON.parse(readFileSync(join(__dirname, '../../shared/ai-reply-samples.json'), 'utf8'))

  it('格式正确：ID 不重复、预期只有 ai / human、中英文都有、两类都不少于 10 条', () => {
    const ids = new Set<string>()
    const counts = { ai: 0, human: 0 }
    const locales = new Set<string>()
    for (const thread of data.threads) {
      locales.add(thread.locale)
      expect(thread.parent.text).toBeTruthy()
      for (const reply of thread.replies) {
        expect(ids.has(reply.id), reply.id).toBe(false)
        ids.add(reply.id)
        expect(['ai', 'human']).toContain(reply.expect)
        expect(reply.text.trim()).not.toBe('')
        expect(Number.isFinite(reply.delaySeconds)).toBe(true)
        if ('followers' in reply) expect(Number.isInteger(reply.followers) && reply.followers >= 0).toBe(true)
        if ('verified' in reply) expect(typeof reply.verified).toBe('boolean')
        counts[reply.expect as 'ai' | 'human']++
      }
    }
    expect([...locales].sort()).toEqual(['en', 'zh-CN'])
    expect(counts.ai).toBeGreaterThanOrEqual(10)
    expect(counts.human).toBeGreaterThanOrEqual(10)
    // 有「认同 + 复述原帖细节 + 补一句」写法的对话（中英文各一段）
    expect(data.threads.map((t: any) => t.id)).toEqual(expect.arrayContaining(['zh-weekly', 'en-notes']))
  })
})

describe('样例集测试的汇总', () => {
  it('按 ≥70 / ≤30 判定，分别统计 AI 和真人样例的相符条数、不确定和缺结果；没跑到的对话不计', async () => {
    const { REPLY_SCORE_SAMPLE_THREADS, summarizeSampleRun, sampleVerdict } = await import('../../shared/ai-reply-samples')
    expect([sampleVerdict(70), sampleVerdict(30), sampleVerdict(50), sampleVerdict(undefined)]).toEqual(['ai', 'human', 'unsure', 'missing'])
    const thread = REPLY_SCORE_SAMPLE_THREADS[0]
    const scores = thread.replies.map((r, i) => ({ id: r.id, score: i === 0 ? 50 : r.expect === 'ai' ? 90 : 10, signals: [], reason: '' }))
    scores.pop()
    const summary = summarizeSampleRun(REPLY_SCORE_SAMPLE_THREADS, new Map([[thread.id, scores]]))
    const ai = thread.replies.filter((r) => r.expect === 'ai').length
    expect(summary.total).toBe(thread.replies.length)
    expect(summary.aiTotal).toBe(ai)
    expect(summary.unsure).toBe(1)
    expect(summary.missing).toBe(1)
    expect(summary.matched).toBe(thread.replies.length - 2)
    expect(summary.rows[0]).toMatchObject({ id: thread.replies[0].id, score: 50, verdict: 'unsure', matched: false })
  })
})
