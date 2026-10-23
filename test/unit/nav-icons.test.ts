import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { extractNavItems, getNavIconSvg } from '../../content-scripts/utilities/navIcons'
import { STATIC_NAV_ITEMS } from '../../shared/staticNavIcons'
import { allSettingsKeys } from '../../storage-keys'

describe('extractNavItems', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://x.com/home',
    })
    globalThis.document = dom.window.document
    // @ts-expect-error jsdom window 类型兼容
    globalThis.window = dom.window
  })

  afterEach(() => {
    dom.window.close()
  })

  it('omits home nav item and extracts history (/i/history) as bookmarks', () => {
    document.body.innerHTML = `
      <header role="banner">
        <nav role="navigation">
          <a data-testid="AppTabBar_Home_Link" href="/home">
            <svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
            <div><div></div><div><span>主页</span></div></div>
          </a>
          <a data-testid="AppTabBar_Explore_Link" href="/explore">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10"/></svg>
            <div><div></div><div><span>探索</span></div></div>
          </a>
          <a data-testid="AppTabBar_Notifications_Link" href="/notifications">
            <svg viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2z"/></svg>
            <div><div></div><div><span>通知</span></div></div>
          </a>
          <a data-testid="AppTabBar_DirectMessage_Link" href="/messages">
            <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18"/></svg>
            <div><div></div><div><span>聊天</span></div></div>
          </a>
          <a href="/i/grok" role="link">
            <svg viewBox="0 0 24 24"><path d="M5 3v18l7-3 7 3V3z"/></svg>
            <div><div></div><div><span>Grok</span></div></div>
          </a>
          <a data-testid="premium-signup-tab" href="/i/premium_sign_up">
            <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12"/></svg>
            <div><div></div><div><span>Premium</span></div></div>
          </a>
          <a href="/i/history" role="link">
            <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            <div><div></div><div><span>历史</span></div></div>
          </a>
          <a href="/i/creators/studio" role="link">
            <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27"/></svg>
            <div><div></div><div><span>创作者工作室</span></div></div>
          </a>
          <a href="/compose/articles" role="link">
            <svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14"/></svg>
            <div><div></div><div><span>文章</span></div></div>
          </a>
          <a data-testid="AppTabBar_Profile_Link" href="/user">
            <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4"/></svg>
            <div><div></div><div><span>个人资料</span></div></div>
          </a>
          <button data-testid="AppTabBar_More_Menu" role="button">
            <svg viewBox="0 0 24 24"><path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2"/></svg>
            <div><div></div><div><span>更多</span></div></div>
          </button>
        </nav>
      </header>
    `

    const items = extractNavItems()
    expect(items.map((i) => i.id)).toEqual([
      'explore',
      'notifications',
      'messages',
      'grok',
      'xPremium',
      'bookmarks',
      'creatorStudio',
      'articles',
      'profile',
      'moreMenu',
    ])
    expect(items.length).toBe(10)

    const historyItem = items.find((i) => i.id === 'bookmarks')!
    expect(historyItem.label).toBe('历史')
    expect(historyItem.icon.innerHTML).toContain('M19 21l-7-5-7 5V5')
  })

  it('also matches traditional /i/bookmarks path', () => {
    document.body.innerHTML = `
      <header role="banner">
        <nav role="navigation">
          <a href="/i/bookmarks" role="link">
            <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5"/></svg>
            <div><div></div><div><span>书签</span></div></div>
          </a>
        </nav>
      </header>
    `

    const items = extractNavItems()
    expect(items.map((i) => i.id)).toEqual(['bookmarks'])
    expect(items[0].label).toBe('书签')
  })

  it('returns SVG via getNavIconSvg', () => {
    document.body.innerHTML = `
      <nav role="navigation">
        <a data-testid="AppTabBar_Home_Link" href="/home">
          <svg><path d="M10 20"/></svg>
        </a>
        <a data-testid="AppTabBar_Explore_Link" href="/explore">
          <svg><path d="M12 2"/></svg>
        </a>
      </nav>
    `
    expect(getNavIconSvg('explore')).toBe('<path d="M12 2"></path>')
    expect(getNavIconSvg('home' as any)).toBeUndefined()
  })
  it('matches money path as chatMoney', () => {
    document.body.innerHTML = `
      <header role="banner">
        <nav role="navigation">
          <a href="/i/money" role="link">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12"/></svg>
            <div><div></div><div><span>Money</span></div></div>
          </a>
        </nav>
      </header>
    `

    const items = extractNavItems()
    expect(items.map((i) => i.id)).toEqual(['chatMoney'])
    expect(items[0].label).toBe('Money')
  })
})

describe('STATIC_NAV_ITEMS', () => {
  it('contains exactly 12 navigation items', () => {
    // 创作者工作室已被 X 收进「更多」菜单，不再提供开关；Radar、灵感是插件添加的入口
    expect(STATIC_NAV_ITEMS.length).toBe(12)
  })

  it('contains valid and unique storage keys defined in allSettingsKeys', () => {
    const validKeys = new Set(allSettingsKeys)
    const storageKeys = STATIC_NAV_ITEMS.map((item) => item.storageKey)

    expect(new Set(storageKeys).size).toBe(STATIC_NAV_ITEMS.length)
    for (const key of storageKeys) {
      expect(validKeys.has(key as any)).toBe(true)
    }
  })

  it('contains valid SVG markup, labels, and viewbox', () => {
    for (const item of STATIC_NAV_ITEMS) {
      expect(item.id).toBeTruthy()
      expect(item.label).toBeTruthy()
      expect(item.viewBox).toMatch(/^\d+ \d+ \d+ \d+$/)
      expect(item.innerHTML).toContain('<path')
    }
  })
})

