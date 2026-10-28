import { describe, it, expect } from 'vitest'
import {
  parseNumberWithSuffix,
  calculateTweetVelocity,
  classifyTweetVelocity,
  formatVelocityBadge,
  extractTweetViews,
  extractTweetPublishTime,
} from '../../shared/viral-radar-parser'

function article(html: string): HTMLElement {
  const el = document.createElement('article')
  el.innerHTML = html
  return el
}

describe('viral-radar-parser', () => {
  describe('extractTweetViews', () => {
    it('reads the analytics link aria-label', () => {
      const el = article('<a href="/u/status/1/analytics" aria-label="1,273 次查看。查看帖子分析">x</a>')
      expect(extractTweetViews(el)).toBe(1273)
    })

    it('reads the analytics link text when aria-label has no number', () => {
      const el = article('<a href="/u/status/1/analytics" aria-label="查看帖子分析"><span>1.2万</span></a>')
      expect(extractTweetViews(el)).toBe(12000)
    })

    it('reads the analytics link text when it has no aria-label', () => {
      const el = article('<div data-testid="analytics">3.4K</div>')
      expect(extractTweetViews(el)).toBe(3400)
    })

    it('prefers the /analytics link over other view links', () => {
      const el = article(
        '<a href="/u/status/2" aria-label="9 Views">a</a>' +
          '<a href="/u/status/1/analytics" aria-label="5 Views">b</a>',
      )
      expect(extractTweetViews(el)).toBe(5)
    })

    it('finds links by English or Chinese aria-label', () => {
      expect(extractTweetViews(article('<a href="/x" aria-label="15.3k views">x</a>'))).toBe(15300)
      expect(extractTweetViews(article('<a href="/x" aria-label="1.5万 次浏览">x</a>'))).toBe(15000)
      expect(extractTweetViews(article('<a href="/x" aria-label="500 次查看">x</a>'))).toBe(500)
    })

    it('falls back to status links when the analytics link has no number', () => {
      const viaAria = article(
        '<a href="/u/status/1/analytics" aria-label="查看帖子分析">分析</a>' +
          '<a href="/u/status/1" aria-label="2 replies">2</a>' +
          '<a href="/u/status/1/photo" aria-label="800 Views">p</a>',
      )
      expect(extractTweetViews(viaAria)).toBe(800)

      const viaText = article(
        '<a href="/u/status/1/analytics" aria-label="查看帖子分析">分析</a>' +
          '<a href="/u/status/1/x">1.1M Views</a>',
      )
      expect(extractTweetViews(viaText)).toBe(1100000)
    })

    it('skips status links whose view text has no number', () => {
      const el = article(
        '<a href="/u/status/1/analytics" aria-label="查看帖子分析">分析</a>' +
          '<a href="/u/status/1/a" aria-label="View post">查看</a>' +
          '<a href="/u/status/1/b">42 浏览</a>',
      )
      expect(extractTweetViews(el)).toBe(42)
    })

    it('returns null when no view count is present', () => {
      expect(extractTweetViews(article('<a href="/u/status/1">12 replies</a><span>3</span>'))).toBeNull()
      expect(extractTweetViews(article('<a href="/u/status/1/analytics" aria-label="查看帖子分析">分析</a>'))).toBeNull()
    })
  })

  describe('extractTweetPublishTime', () => {
    it('returns the datetime in milliseconds', () => {
      const el = article('<time datetime="2026-10-28T01:02:03.000Z">Oct 28</time>')
      expect(extractTweetPublishTime(el)).toBe(Date.UTC(2026, 9, 28, 1, 2, 3))
    })

    it('returns null without a usable datetime', () => {
      expect(extractTweetPublishTime(article('<time>Oct 28</time>'))).toBeNull()
      expect(extractTweetPublishTime(article('<time datetime="">Oct 28</time>'))).toBeNull()
      expect(extractTweetPublishTime(article('<time datetime="not a date">Oct 28</time>'))).toBeNull()
    })
  })

  describe('parseNumberWithSuffix', () => {
    it('parses standard numbers with commas', () => {
      expect(parseNumberWithSuffix('1,234')).toBe(1234)
      expect(parseNumberWithSuffix('500')).toBe(500)
      expect(parseNumberWithSuffix('0')).toBe(0)
    })

    it('parses English K/M/B suffixes', () => {
      expect(parseNumberWithSuffix('1.2K')).toBe(1200)
      expect(parseNumberWithSuffix('15.3k')).toBe(15300)
      expect(parseNumberWithSuffix('2.5M')).toBe(2500000)
      expect(parseNumberWithSuffix('1.2B')).toBe(1200000000)
    })

    it('parses Chinese units (万 / 千 / 亿)', () => {
      expect(parseNumberWithSuffix('1.2万')).toBe(12000)
      expect(parseNumberWithSuffix('15.5萬')).toBe(155000)
      expect(parseNumberWithSuffix('1.5千')).toBe(1500)
      expect(parseNumberWithSuffix('1.2亿')).toBe(120000000)
    })

    it('parses embedded text in aria-label or status links', () => {
      expect(parseNumberWithSuffix('1,234 Views')).toBe(1234)
      expect(parseNumberWithSuffix('1.2K 次查看')).toBe(1200)
      expect(parseNumberWithSuffix('1.5万 次浏览')).toBe(15000)
      expect(parseNumberWithSuffix('1.8万 查看')).toBe(18000)
      expect(parseNumberWithSuffix('1273 次查看。查看帖子分析')).toBe(1273)
      expect(parseNumberWithSuffix('1074 次查看。查看帖子分析')).toBe(1074)
      expect(parseNumberWithSuffix('353 次查看。查看帖子分析')).toBe(353)
    })

    it('returns null for invalid inputs', () => {
      expect(parseNumberWithSuffix('')).toBeNull()
      expect(parseNumberWithSuffix('abc')).toBeNull()
    })
  })

  describe('calculateTweetVelocity', () => {
    it('calculates views per hour accurately', () => {
      const now = 1000 * 60 * 60 * 10 // 10 hours
      const publishTime = 1000 * 60 * 60 * 8 // 8 hours (2 hours ago)
      const views = 10000
      expect(calculateTweetVelocity(views, publishTime, now)).toBe(5000) // 10000 / 2 = 5000/h
    })

    it('clamps elapsed time to 1 minute minimum to prevent spikes', () => {
      const now = 1000 * 60 * 10
      const publishTime = now - 1000 * 10 // 10 seconds ago
      const views = 60
      // effectiveHours = 1 / 60
      expect(calculateTweetVelocity(views, publishTime, now)).toBe(3600) // 60 / (1/60)
    })
  })

  describe('classifyTweetVelocity', () => {
    it('classifies normal, potential, and viral tweets', () => {
      expect(classifyTweetVelocity(500, 1000, 10000)).toBe('normal')
      expect(classifyTweetVelocity(1000, 1000, 10000)).toBe('potential')
      expect(classifyTweetVelocity(5000, 1000, 10000)).toBe('potential')
      expect(classifyTweetVelocity(10000, 1000, 10000)).toBe('viral')
      expect(classifyTweetVelocity(25000, 1000, 10000)).toBe('viral')
    })
  })

  describe('formatVelocityBadge', () => {
    it('formats velocity numbers into readable strings', () => {
      expect(formatVelocityBadge(500)).toBe('500/h')
      expect(formatVelocityBadge(1200)).toBe('1.2k/h')
      expect(formatVelocityBadge(6900)).toBe('6.9k/h')
      expect(formatVelocityBadge(15800)).toBe('1.6万/h')
      expect(formatVelocityBadge(127000)).toBe('12.7万/h')
    })
  })
})
