import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import {
  normalizeForTweetFilter,
  parseTweetFilterKeywords,
  evaluateTweetFilter,
} from '../../shared/tweet-filter-rules'
import {
  applyTweetCollapse,
  applyTweetHide,
  applyTweetAllow,
  cleanupTweetFilter,
  TF_STATE_ATTR,
  TF_MATCHED_ATTR,
  TF_REPLACEMENT_ATTR,
} from '../../content-scripts/features/tweet-filter'
import { defaultTweetFilterKeywords } from '../../storage-keys'

describe('tweet-filter rules & normalization', () => {
  describe('normalizeForTweetFilter', () => {
    it('strips urls, mentions, emojis, invisible chars, punctuation, and spaces', () => {
      const input = '🔥 说 个 暴 论 ： https://x.com/abc @user 这年头谁还在用键盘？ \u200B'
      const normalized = normalizeForTweetFilter(input)
      expect(normalized).toBe('说个暴论这年头谁还在用键盘')
    })

    it('handles empty or null string safely', () => {
      expect(normalizeForTweetFilter('')).toBe('')
    })
  })

  describe('parseTweetFilterKeywords', () => {
    it('parses newline and comma separated keywords', () => {
      const input = '说个暴论\n发个暴论, 提个暴论，暴论：'
      const parsed = parseTweetFilterKeywords(input)
      expect(parsed).toEqual(['说个暴论', '发个暴论', '提个暴论', '暴论：'])
    })

    it('returns empty array on empty input', () => {
      expect(parseTweetFilterKeywords('')).toEqual([])
      expect(parseTweetFilterKeywords(null)).toEqual([])
    })
  })

  describe('evaluateTweetFilter', () => {
    const keywords = [...defaultTweetFilterKeywords]
    const normalizedKeywords = keywords.map(normalizeForTweetFilter)

    it('matches exact keyword "说个暴论"', () => {
      const result = evaluateTweetFilter({
        text: '今天说个暴论，AI 时代不需要初级程序员了。',
        keywords,
        normalizedKeywords,
      })
      expect(result.matched).toBe(true)
      expect(result.matchedKeyword).toBe('说个暴论')
    })

    it('matches keywords obscured with spaces and punctuation', () => {
      const result = evaluateTweetFilter({
        text: '我来 说 个 暴 论 ！大家不要买股票。',
        keywords,
        normalizedKeywords,
      })
      expect(result.matched).toBe(true)
      expect(result.matchedKeyword).toBe('说个暴论')
    })

    it('matches keywords obscured with emojis', () => {
      const result = evaluateTweetFilter({
        text: '说🔥个🔥暴🔥论，今天天气真好。',
        keywords,
        normalizedKeywords,
      })
      expect(result.matched).toBe(true)
      expect(result.matchedKeyword).toBe('说个暴论')
    })

    it('matches colon-variant "暴论："', () => {
      const result = evaluateTweetFilter({
        text: '暴论：产品体验比代码质量更重要。',
        keywords,
        normalizedKeywords,
      })
      expect(result.matched).toBe(true)
      expect(result.matchedKeyword).toContain('暴论')
    })

    it('does not match normal clean tweets without violent opinion keywords', () => {
      const result = evaluateTweetFilter({
        text: '今天天气很好，出去散步很开心。欢迎大家关注！',
        keywords,
        normalizedKeywords,
      })
      expect(result.matched).toBe(false)
      expect(result.matchedKeyword).toBeUndefined()
    })
  })
})

describe('tweet-filter DOM manipulations', () => {
  function createTimelineDOM(): {
    doc: Document
    timeline: HTMLElement
    article: HTMLElement
  } {
    const dom = new JSDOM(
      '<div id="timeline"><article data-testid="tweet"><div data-testid="tweetText">说个暴论，哈哈</div></article></div>',
    )
    const doc = dom.window.document
    const timeline = doc.getElementById('timeline')!
    const article = doc.querySelector<HTMLElement>('article[data-testid="tweet"]')!
    return { doc, timeline, article }
  }

  it('applyTweetCollapse hides article, sets attribute, and inserts interactive placeholder', () => {
    const { doc, timeline, article } = createTimelineDOM()

    applyTweetCollapse(article, '说个暴论')

    expect(article.style.display).toBe('none')
    expect(article.getAttribute(TF_STATE_ATTR)).toBe('collapsed')
    expect(article.getAttribute(TF_MATCHED_ATTR)).toBe('说个暴论')

    const replacement = timeline.querySelector<HTMLElement>(`[${TF_REPLACEMENT_ATTR}]`)
    expect(replacement).not.toBeNull()
    expect(replacement!.textContent).toContain('推文已过滤')
    expect(replacement!.textContent).toContain('说个暴论')

    const expandBtn = replacement!.querySelector<HTMLButtonElement>('.xf-tf-placeholder-btn')
    expect(expandBtn).not.toBeNull()

    // 点击“展开查看”
    expandBtn!.click()

    expect(article.style.display).toBe('')
    expect(article.getAttribute(TF_STATE_ATTR)).toBe('expanded')

    // 占位条中变为重新收起按钮
    const collapseBtn = replacement!.querySelector<HTMLButtonElement>('.xf-tf-expanded-btn')
    expect(collapseBtn).not.toBeNull()
    expect(collapseBtn!.textContent).toBe('重新收起')

    // 点击“重新收起”
    collapseBtn!.click()
    expect(article.style.display).toBe('none')
    expect(article.getAttribute(TF_STATE_ATTR)).toBe('collapsed')
  })

  it('applyTweetHide hides article without inserting replacement', () => {
    const { timeline, article } = createTimelineDOM()

    applyTweetHide(article, '说个暴论')

    expect(article.style.display).toBe('none')
    expect(article.getAttribute(TF_STATE_ATTR)).toBe('hidden')
    expect(article.getAttribute(TF_MATCHED_ATTR)).toBe('说个暴论')

    const replacement = timeline.querySelector<HTMLElement>(`[${TF_REPLACEMENT_ATTR}]`)
    expect(replacement).toBeNull()
  })

  it('applyTweetAllow restores article and cleans up replacements', () => {
    const { timeline, article } = createTimelineDOM()

    applyTweetCollapse(article, '说个暴论')
    expect(timeline.querySelector(`[${TF_REPLACEMENT_ATTR}]`)).not.toBeNull()

    applyTweetAllow(article)

    expect(article.style.display).toBe('')
    expect(article.getAttribute(TF_STATE_ATTR)).toBeNull()
    expect(article.getAttribute(TF_MATCHED_ATTR)).toBeNull()
    expect(timeline.querySelector(`[${TF_REPLACEMENT_ATTR}]`)).toBeNull()
  })

  it('cleanupTweetFilter removes all replacements and restores articles', () => {
    const { timeline, article } = createTimelineDOM()

    // 模拟全局 document
    ;(globalThis as any).document = timeline.ownerDocument

    applyTweetCollapse(article, '说个暴论')
    expect(timeline.querySelector(`[${TF_REPLACEMENT_ATTR}]`)).not.toBeNull()

    cleanupTweetFilter()

    expect(article.style.display).toBe('')
    expect(article.getAttribute(TF_STATE_ATTR)).toBeNull()
    expect(timeline.querySelector(`[${TF_REPLACEMENT_ATTR}]`)).toBeNull()
  })
})
