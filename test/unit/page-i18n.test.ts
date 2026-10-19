import { afterEach, describe, expect, it } from 'vitest'
import { applyLanguageSetting } from '../../shared/i18n'
import { AppError, CodedError, errorText, fromTransferable, toTransferable } from '../../shared/errors'
import { createLibraryService, emptyLibrary, type LibraryRequest, type LibraryState } from '../../shared/own-post-library'
import { evaluateSpam } from '../../shared/spam-rules'
import { formatRuleHit, ruleHitText, type RuleHit } from '../../shared/spam-types'
import { formatVelocityBadge } from '../../shared/viral-radar-parser'
import { formatFollowerCount } from '../../shared/user-metrics-interceptor'
import { formatBookmarkCount } from '../../shared/bookmark-interceptor'
import { buildPlaceholder } from '../../content-scripts/spam/placeholder'
import { buildDebugBar } from '../../content-scripts/spam/debug-bar'
import { buildExpandedBar, buildTweetFilterPlaceholder } from '../../content-scripts/features/tweet-filter'
import { formatScheduleDayLabel } from '../../content-scripts/features/scheduled-sidebar'
import { formatDurationGap, formatRelativePublishTime, getIntervalTheme } from '../../content-scripts/options/scheduled-time'

const CJK = /[一-鿿]/

afterEach(() => applyLanguageSetting('auto'))

describe('错误代号', () => {
  it('按当前语言翻译，带参数', () => {
    const payload = { code: 'error.readHttp' as const, params: { status: 404 } }
    expect(errorText(payload)).toBe('读取失败（404），请稍后重试')
    applyLanguageSetting('en')
    expect(errorText(payload)).toBe('Could not read (404). Try again later')
    expect(errorText(new AppError('error.tooFrequent'))).toBe('Too many requests. Try again later')
  })

  it('原文照样显示，拿不到时用兜底代号', () => {
    expect(errorText('Failed to fetch')).toBe('Failed to fetch')
    expect(errorText(new Error('network down'))).toBe('network down')
    expect(errorText(undefined, 'error.readFailed')).toBe('读取失败，请重试')
    expect(errorText(undefined)).toBe('')
  })

  it('跨消息传递时只留代号和参数，收到后能还原成可抛出的报错', () => {
    const payload = toTransferable(new CodedError('error.rateLimited', { time: '15:04:05', pages: 2 }))
    expect(payload).toEqual({ code: 'error.rateLimited', params: { time: '15:04:05', pages: 2 } })
    expect(toTransferable(new Error('raw'))).toBe('raw')
    expect(toTransferable(undefined, 'error.fetchFailed')).toEqual({ code: 'error.fetchFailed' })

    const restored = fromTransferable(payload, 'error.readFailed')
    expect(restored).toBeInstanceOf(AppError)
    expect((restored as AppError).code).toBe('error.rateLimited')
    expect(fromTransferable('raw text', 'error.readFailed').message).toBe('raw text')
    expect((fromTransferable(undefined, 'error.readFailed') as AppError).code).toBe('error.readFailed')
  })

  it('帖子库按代号判断限流：限流等 15 分钟，其他错误等 2 分钟；旧数据的中文原文也认得', async () => {
    let now = 1_000_000_000
    const accounts = new Map<string, LibraryState>()
    const service = createLibraryService({
      read: async (key) => structuredClone(accounts.get(key) || emptyLibrary(key)),
      update: async (key, change) => {
        const state = structuredClone(accounts.get(key) || emptyLibrary(key))
        const value = change(state)
        accounts.set(key, state)
        return value
      },
    }, () => now)
    const call = (action: LibraryRequest['action'], extra = {}, account = '42') =>
      service({ action, account, handle: 'me', ...extra })

    const blockedFor = async (error: LibraryRequest['error'], account: string) => {
      const run = await call('begin', {}, account)
      await call('finish', { token: run.token, error }, account)
      const start = now
      while (!(await call('begin', { manual: true }, account)).token) now += 60_000
      const waited = now - start
      return Math.round(waited / 60_000)
    }

    expect(await blockedFor({ code: 'error.tooFrequent' }, '1')).toBe(15)
    expect(await blockedFor({ code: 'error.readHttp', params: { status: 429 } }, '2')).toBe(15)
    expect(await blockedFor('请求过于频繁', '3')).toBe(15)
    expect(await blockedFor({ code: 'error.readFailed' }, '4')).toBe(2)
  })
})

describe('拦截命中说明', () => {
  const hits = (text: string, authorName = 'name', authorHandle = 'user_1') =>
    evaluateSpam({ text, authorName, authorHandle, keywords: ['同城', '约会', '福利'], enabledRules: new Set(['marketing_keyword', 'mention_referral', 'emoji_ratio', 'repeated_chars', 'marketing_nickname', 'decorated_nickname']) as never }).hits

  it('中文说明和改动前一致', () => {
    const labels = hits('同城约会福利 看@abcdef').map((h) => h.label)
    expect(labels).toContain('垃圾词库（"同城", "约会"等3个）')
    expect(labels).toContain('矩阵引流（引流 @abcdef）')
  })

  it('命中细节和语言无关，英文按细节重新拼', () => {
    const hit = hits('同城约会福利').find((h) => h.id === 'marketing_keyword')!
    expect(hit.detail).toEqual({ words: ['同城', '约会'], count: 3 })
    expect(formatRuleHit(hit, 'en')).toBe('Spam words ("同城", "约会", 3 in total)')
    expect(formatRuleHit({ id: 'mention_referral', detail: { referral: 'tail', handle: 'abc' } }, 'en')).toBe('Mention referral (ends with @abc)')
    expect(formatRuleHit({ id: 'emoji_ratio', detail: { percent: 60 } }, 'en')).toBe('Emoji ratio (60%)')
    expect(formatRuleHit({ id: 'short_text', detail: {} }, 'en')).toBe('Too short')
    expect(formatRuleHit({ id: 'marketing_keyword', detail: { blocklist: true } }, 'en')).toBe('Blocklisted user')
  })

  it('旧记录只有中文说明：中文界面照原样，英文只显示规则名', () => {
    const legacy: RuleHit = { id: 'marketing_nickname', label: '营销昵称（"同城"）', score: 40 }
    expect(ruleHitText(legacy, 'zh-CN')).toBe('营销昵称（"同城"）')
    expect(ruleHitText(legacy, 'en')).toBe('Promo display name')
  })
})

describe('X 页面上的界面：英文下没有中文', () => {
  it('隐藏占位、调试条、正文过滤提示条', () => {
    applyLanguageSetting('en')
    const evaluation = { score: 80, hits: hits('同城约会福利 看@abcdef'), category: 'porn_spam' as const, text: 'x', authorHandle: 'u' }
    const keywordLabels = ['"同城", "约会"']
    const strip = (text: string) => keywordLabels.reduce((rest, word) => rest.split(word).join(''), text)

    const placeholder = buildPlaceholder(evaluation)
    expect(placeholder.textContent).toContain('Hidden — likely spam reply')
    expect(CJK.test(strip(placeholder.textContent ?? ''))).toBe(false)

    const bar = buildDebugBar(evaluation, 55)
    expect(bar.textContent).toContain('Would be hidden')
    expect(CJK.test(strip(bar.textContent ?? ''))).toBe(false)

    const collapsed = buildTweetFilterPlaceholder('kw', () => {})
    expect(collapsed.textContent).toContain('Post filtered')
    expect(CJK.test(collapsed.textContent ?? '')).toBe(false)
    const expanded = buildExpandedBar('kw', () => {})
    expect(CJK.test(expanded.textContent ?? '')).toBe(false)

    function hits(text: string) {
      return evaluateSpam({ text, authorName: 'n', authorHandle: 'user_1', keywords: ['同城', '约会', '福利'], enabledRules: new Set(['marketing_keyword', 'mention_referral']) as never }).hits
    }
  })

  it('排期的日期、相对时间、间隔', () => {
    const now = new Date(2026, 9, 17, 21, 30) // 周六
    applyLanguageSetting('en')
    expect(formatScheduleDayLabel(new Date(2026, 9, 17, 23, 0), now)).toBe('Today · 10-17')
    expect(formatScheduleDayLabel(new Date(2026, 9, 20, 9, 0), now)).toBe('Tue · 10-20')
    expect(formatRelativePublishTime(new Date(2026, 9, 17, 23, 6), now)).toBe('in 1h 36m')
    expect(formatDurationGap(9 * 3600_000 + 42 * 60_000)).toBe('9h 42m')
    expect(getIntervalTheme(false, 3600_000).label).toBe('Too close')

    applyLanguageSetting('zh-CN')
    expect(formatScheduleDayLabel(new Date(2026, 9, 20, 9, 0), now)).toBe('周二 · 10-20')
    expect(formatRelativePublishTime(new Date(2026, 9, 17, 23, 6), now)).toBe('1小时36分钟后')
  })

  it('数字单位：中文用万和亿，英文用 K 和 M', () => {
    expect(formatVelocityBadge(15800, 'zh-CN')).toBe('1.6万/h')
    expect(formatVelocityBadge(15800, 'en')).toBe('15.8k/h')
    expect(formatVelocityBadge(1_200_000, 'en')).toBe('1.2m/h')
    expect(formatFollowerCount(125_000, 'en')).toBe('125K')
    expect(formatFollowerCount(125_000, 'zh-CN')).toBe('12.5万')
    expect(formatBookmarkCount(23_400, 'en')).toBe('23.4K')
    expect(formatBookmarkCount(1_245, 'en')).toBe('1,245')
  })
})
