import { describe, it, expect } from 'vitest'
import {
  extractListId,
  extractHandleFromCard,
  extractUserIdFromCard,
  toPlainQuickLists,
  sortQuickLists,
} from '../../shared/quick-list'
import {
  KeyQuickListAdderEnabled,
  KeyQuickListNavEnabled,
  KeyQuickListNavPosition,
  KeyQuickLists,
  allSettingsKeys,
  defaultPreferences,
} from '../../storage-keys'

describe('Quick List Helpers', () => {
  describe('extractListId', () => {
    it('extracts ID from full x.com list URL', () => {
      expect(extractListId('https://x.com/i/lists/123456789')).toBe('123456789')
      expect(extractListId('https://x.com/i/lists/1832049281092834920/members')).toBe('1832049281092834920')
    })

    it('extracts ID from full twitter.com list URL', () => {
      expect(extractListId('https://twitter.com/i/lists/987654321')).toBe('987654321')
    })

    it('extracts ID from pure numeric string', () => {
      expect(extractListId('123456789')).toBe('123456789')
      expect(extractListId('   999888   ')).toBe('999888')
    })

    it('returns null for invalid strings', () => {
      expect(extractListId('https://x.com/home')).toBeNull()
      expect(extractListId('not-a-list')).toBeNull()
      expect(extractListId('')).toBeNull()
    })
  })

  describe('extractHandleFromCard', () => {
    it('extracts handle from UserLink', () => {
      const card = document.createElement('div')
      card.innerHTML = `
        <div>
          <a data-testid="UserLink" href="/dboy_yi2025">
            <span>谁是专家</span>
          </a>
        </div>
      `
      expect(extractHandleFromCard(card)).toBe('dboy_yi2025')
    })

    it('ignores reserved handles', () => {
      const card = document.createElement('div')
      card.innerHTML = `
        <div>
          <a href="/home">Home</a>
          <a data-testid="UserLink" href="/elonmusk">Elon</a>
        </div>
      `
      expect(extractHandleFromCard(card)).toBe('elonmusk')
    })

    it('returns null if no handle link is found', () => {
      const card = document.createElement('div')
      card.innerHTML = `<div><span>No Links</span></div>`
      expect(extractHandleFromCard(card)).toBeNull()
    })
  })

  describe('extractUserIdFromCard', () => {
    it('extracts userId from followBtn data-testid', () => {
      const card = document.createElement('div')
      const btn = document.createElement('button')
      btn.setAttribute('data-testid', '44196397-follow')
      card.appendChild(btn)

      expect(extractUserIdFromCard(card, btn)).toBe('44196397')
    })

    it('extracts userId from unfollow data-testid', () => {
      const card = document.createElement('div')
      const btn = document.createElement('button')
      btn.setAttribute('data-testid', '1234567890-unfollow')
      card.appendChild(btn)

      expect(extractUserIdFromCard(card, btn)).toBe('1234567890')
    })

    it('falls back to searching card descendants for follow testid', () => {
      const card = document.createElement('div')
      const inner = document.createElement('div')
      inner.setAttribute('data-testid', '888888-follow')
      card.appendChild(inner)

      expect(extractUserIdFromCard(card, null)).toBe('888888')
    })

    it('returns null if no follow testid exists', () => {
      const card = document.createElement('div')
      expect(extractUserIdFromCard(card, null)).toBeNull()
    })
  })

  describe('toPlainQuickLists', () => {
    it('normalizes array of lists into clean plain objects with isOwned and isPinned', () => {
      const input = [
        { id: '1001', name: 'Tech AI', isPinned: true, isOwned: true },
        { id: '  1002  ', name: '  Builders  ', isOwned: false, ownerHandle: 'jack' },
        { id: '', name: 'Empty ID' },
        { id: '1003', name: '' },
        null,
      ]
      const res = toPlainQuickLists(input)
      expect(res).toEqual([
        { id: '1001', name: 'Tech AI', isPinned: true, isOwned: true, ownerHandle: undefined },
        { id: '1002', name: 'Builders', isPinned: false, isOwned: false, ownerHandle: 'jack' },
      ])
    })

    it('parses JSON string into clean objects', () => {
      const json = JSON.stringify([{ id: '2001', name: 'Alpha', isPinned: true }])
      expect(toPlainQuickLists(json)).toEqual([{ id: '2001', name: 'Alpha', isPinned: true, isOwned: true, ownerHandle: undefined }])
    })

    it('returns empty array for invalid input', () => {
      expect(toPlainQuickLists(null)).toEqual([])
      expect(toPlainQuickLists(undefined)).toEqual([])
      expect(toPlainQuickLists('invalid json')).toEqual([])
    })
  })

  describe('sortQuickLists', () => {
    it('sorts pinned lists to the very top, followed by owned, then followed', () => {
      const lists = [
        { id: '1', name: 'Normal Owned', isOwned: true, isPinned: false },
        { id: '2', name: 'Followed List', isOwned: false, isPinned: false },
        { id: '3', name: 'Pinned Followed', isOwned: false, isPinned: true },
        { id: '4', name: 'Pinned Owned', isOwned: true, isPinned: true },
      ]

      const sorted = sortQuickLists(lists)
      expect(sorted.map((l) => l.id)).toEqual(['4', '3', '1', '2'])
    })
  })

  describe('storage keys and defaults', () => {
    it('defines storage keys correctly', () => {
      expect(KeyQuickListAdderEnabled).toBe('quickListAdderEnabled')
      expect(KeyQuickListNavEnabled).toBe('quickListNavEnabled')
      expect(KeyQuickListNavPosition).toBe('quickListNavPosition')
      expect(KeyQuickLists).toBe('quickLists')
    })

    it('includes keys in allSettingsKeys', () => {
      expect(allSettingsKeys).toContain(KeyQuickListAdderEnabled)
      expect(allSettingsKeys).toContain(KeyQuickListNavEnabled)
      expect(allSettingsKeys).toContain(KeyQuickListNavPosition)
    })

    it('has default preferences enabled', () => {
      expect(defaultPreferences[KeyQuickListAdderEnabled]).toBe('on')
      expect(defaultPreferences[KeyQuickListNavEnabled]).toBe('on')
      expect(defaultPreferences[KeyQuickListNavPosition]).toBe('top')
    })
  })

  describe('ensureQuickListNavEntry', () => {
    it('creates cloned navigation entry with proper alignment and text in expanded mode', async () => {
      const { ensureQuickListNavEntry } = await import('../../content-scripts/features/quick-list')
      window.history.pushState({}, '', '/home')
      document.body.innerHTML = `
        <header role="banner" style="width: 275px;">
          <nav role="navigation">
            <a data-testid="AppTabBar_Home_Link" href="/home" aria-current="page">
              <div>
                <div><svg viewBox="0 0 24 24"></svg></div>
                <div dir="ltr"><span>主页</span></div>
              </div>
            </a>
          </nav>
        </header>
      `

      ensureQuickListNavEntry(true, 'top')

      const navEntry = document.querySelector('.xf-quick-list-nav-entry') as HTMLElement | null
      expect(navEntry).not.toBeNull()
      expect(navEntry?.textContent).toContain('我的 Lists')
      expect(navEntry?.getAttribute('aria-current')).toBeNull()
      expect(navEntry?.getAttribute('href')).toBe('/i/lists')
      expect(navEntry?.classList.contains('xf-sidebar-button')).toBe(true)
      expect(navEntry?.getAttribute('data-xf-mode')).toBe('expanded')
      expect(navEntry?.style.width).toBe('100%')
      expect(navEntry?.style.alignItems).toBe('flex-start')
    })

    it('aligns entry to flex-end and hides text in Chat (/messages) collapsed mode', async () => {
      const { ensureQuickListNavEntry } = await import('../../content-scripts/features/quick-list')
      window.history.pushState({}, '', '/messages')
      document.body.innerHTML = `
        <header role="banner" style="width: 68px;">
          <nav role="navigation">
            <a data-testid="AppTabBar_Home_Link" href="/home">
              <div>
                <div><svg viewBox="0 0 24 24"></svg></div>
              </div>
            </a>
          </nav>
        </header>
      `

      ensureQuickListNavEntry(true, 'top')

      const navEntry = document.querySelector('.xf-quick-list-nav-entry') as HTMLElement | null
      expect(navEntry).not.toBeNull()
      expect(navEntry?.getAttribute('data-xf-mode')).toBe('collapsed')
      expect(navEntry?.style.width).toBe('100%')
      expect(navEntry?.style.alignItems).toBe('flex-end')
      const pill = navEntry?.firstElementChild as HTMLElement | null
      expect(pill?.style.margin).toBe('')
    })

    it('smoothly switches between expanded and collapsed modes via syncNavEntryLayout', async () => {
      const { ensureQuickListNavEntry } = await import('../../content-scripts/features/quick-list')
      window.history.pushState({}, '', '/home')
      document.body.innerHTML = `
        <header role="banner" style="width: 275px;">
          <nav role="navigation">
            <a data-testid="AppTabBar_Home_Link" href="/home">
              <div>
                <div><svg viewBox="0 0 24 24"></svg></div>
                <div dir="ltr"><span>主页</span></div>
              </div>
            </a>
          </nav>
        </header>
      `

      // 1. 展开模式注入
      ensureQuickListNavEntry(true, 'top')
      let navEntry = document.querySelector('.xf-quick-list-nav-entry') as HTMLElement | null
      expect(navEntry?.getAttribute('data-xf-mode')).toBe('expanded')
      expect(navEntry?.style.alignItems).toBe('flex-start')
      expect(navEntry?.textContent).toContain('我的 Lists')

      // 2. 模拟进入 Chat 路由并侧边栏收起
      window.history.pushState({}, '', '/messages')
      const homeLink = document.querySelector('[data-testid="AppTabBar_Home_Link"]') as HTMLElement
      // X React re-renders homeLink in compact mode
      homeLink.querySelector('div[dir]')?.remove()
      const header = document.querySelector('header[role="banner"]') as HTMLElement
      header.style.width = '68px'

      ensureQuickListNavEntry(true, 'top')
      navEntry = document.querySelector('.xf-quick-list-nav-entry') as HTMLElement | null
      expect(navEntry?.getAttribute('data-xf-mode')).toBe('collapsed')
      expect(navEntry?.style.alignItems).toBe('flex-end')
      expect(navEntry?.style.width).toBe('100%')
      const textContainer = navEntry?.querySelector('div[dir]') as HTMLElement | null
      expect(textContainer?.style.display).toBe('none')

      // 3. 模拟切回主页
      window.history.pushState({}, '', '/home')
      header.style.width = '275px'
      const pill = homeLink.firstElementChild as HTMLElement
      const newTextContainer = document.createElement('div')
      newTextContainer.setAttribute('dir', 'ltr')
      newTextContainer.innerHTML = '<span>主页</span>'
      pill.appendChild(newTextContainer)

      ensureQuickListNavEntry(true, 'top')
      navEntry = document.querySelector('.xf-quick-list-nav-entry') as HTMLElement | null
      expect(navEntry?.getAttribute('data-xf-mode')).toBe('expanded')
      expect(navEntry?.style.alignItems).toBe('flex-start')
      expect(navEntry?.textContent).toContain('我的 Lists')
      expect(textContainer?.style.display).toBe('')
    })
  })
})
