import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  CREATOR_NAV_ITEMS,
  NAVIGATE_FALLBACK_MS,
  ensureCreatorNavEntries,
  openCreatorPage,
  setCreatorNavEntryEnabled,
} from '../../content-scripts/options/creator-nav'
import { CREATOR_NAV_NAVIGATE_TYPE, XF_BRIDGE_MARKER } from '../../shared/bridge'
import { navigateCreatorPage } from '../../shared/creator-nav'
import { changeInspirationButton, changeRadarButton } from '../../content-scripts/options/navigation'
import { defaultPreferences, KeyInspirationButton, KeyRadarButton } from '../../storage-keys'

function renderNav({ expanded = true } = {}) {
  const text = (label: string) => (expanded ? `<div dir="ltr"><span>${label}</span></div>` : '')
  document.body.innerHTML = `
    <header role="banner" style="width: ${expanded ? 275 : 68}px;">
      <nav role="navigation">
        <a data-testid="AppTabBar_Home_Link" href="/home" aria-current="page">
          <div>
            <div><svg viewBox="0 0 24 24"><path d="M0 0"></path></svg></div>
            ${text('主页')}
          </div>
        </a>
        <a data-testid="AppTabBar_Explore_Link" href="/explore">
          <div><div><svg viewBox="0 0 24 24"></svg></div>${text('探索')}</div>
        </a>
        <a data-testid="AppTabBar_Profile_Link" href="/someone">
          <div><div><svg viewBox="0 0 24 24"></svg></div>${text('个人资料')}</div>
        </a>
        <button data-testid="AppTabBar_More_Menu"></button>
      </nav>
    </header>
  `
}

function navOrder() {
  return [...document.querySelectorAll('nav[role="navigation"] > *')].map(
    (el) => el.getAttribute('data-xf-creator-nav') ?? el.getAttribute('data-testid'),
  )
}

const entry = (id: string) => document.querySelector<HTMLAnchorElement>(`[data-xf-creator-nav="${id}"]`)

describe('creator-nav', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/home')
    renderNav()
  })

  afterEach(() => {
    setCreatorNavEntryEnabled('radar', false)
    setCreatorNavEntryEnabled('inspiration', false)
  })

  it('两个入口默认关闭', () => {
    expect(defaultPreferences[KeyRadarButton]).toBe('off')
    expect(defaultPreferences[KeyInspirationButton]).toBe('off')
  })

  it('打开后按 Radar、灵感的顺序插在「个人资料」前面', () => {
    changeInspirationButton('on')
    changeRadarButton('on')

    expect(navOrder()).toEqual([
      'AppTabBar_Home_Link',
      'AppTabBar_Explore_Link',
      'radar',
      'inspiration',
      'AppTabBar_Profile_Link',
      'AppTabBar_More_Menu',
    ])
    expect(entry('radar')?.getAttribute('href')).toBe('/i/radar')
    expect(entry('inspiration')?.getAttribute('href')).toBe('/i/jf/creators/inspiration/top_posts')
  })

  it('入口用自己的图标和文字，不带「主页」的标识和当前页状态', () => {
    changeRadarButton('on')
    const radar = entry('radar')!

    expect(radar.getAttribute('data-testid')).toBeNull()
    expect(radar.getAttribute('aria-current')).toBeNull()
    expect(radar.getAttribute('aria-label')).toBe('Radar')
    expect(radar.textContent).toContain('Radar')
    expect(radar.textContent).not.toContain('主页')
    expect(radar.querySelector('svg')?.innerHTML).toContain('M12 3.75')
    expect(radar.classList.contains('xf-sidebar-button')).toBe(true)
  })

  it('关闭后移除入口', () => {
    changeRadarButton('on')
    changeInspirationButton('on')
    changeRadarButton('off')

    expect(entry('radar')).toBeNull()
    expect(entry('inspiration')).not.toBeNull()
  })

  it('入口已在位时再同步不改动导航栏的子节点', async () => {
    changeRadarButton('on')
    changeInspirationButton('on')

    const records: MutationRecord[] = []
    const observer = new MutationObserver((list) => records.push(...list))
    observer.observe(document.querySelector('nav')!, { childList: true, subtree: true })
    ensureCreatorNavEntries()
    ensureCreatorNavEntries()
    await Promise.resolve()
    observer.disconnect()

    expect(records).toEqual([])
  })

  it('X 在入口和「个人资料」之间插了新项后，入口挪回「个人资料」前面', () => {
    changeRadarButton('on')
    changeInspirationButton('on')
    const premium = document.createElement('a')
    premium.setAttribute('data-testid', 'premium-signup-tab')
    document.querySelector('[data-testid="AppTabBar_Profile_Link"]')!.before(premium)

    ensureCreatorNavEntries()

    expect(navOrder().slice(2)).toEqual([
      'premium-signup-tab',
      'radar',
      'inspiration',
      'AppTabBar_Profile_Link',
      'AppTabBar_More_Menu',
    ])
  })

  it('X 重新渲染导航栏后补回入口', () => {
    changeRadarButton('on')
    renderNav()
    expect(entry('radar')).toBeNull()

    ensureCreatorNavEntries()
    expect(entry('radar')).not.toBeNull()
  })

  it('在对应页面时显示为当前页', () => {
    changeRadarButton('on')
    changeInspirationButton('on')

    window.history.pushState({}, '', '/i/radar/2100033969874178136')
    ensureCreatorNavEntries()
    expect(entry('radar')?.getAttribute('aria-current')).toBe('page')
    expect(entry('inspiration')?.getAttribute('aria-current')).toBeNull()

    window.history.pushState({}, '', '/i/jf/creators/inspiration/top_posts')
    ensureCreatorNavEntries()
    expect(entry('radar')?.getAttribute('aria-current')).toBeNull()
    expect(entry('inspiration')?.getAttribute('aria-current')).toBe('page')
  })

  it('导航只显示图标时隐藏文字，展开后补上文字', () => {
    renderNav({ expanded: false })
    changeRadarButton('on')
    expect(entry('radar')?.getAttribute('data-xf-mode')).toBe('collapsed')
    expect(entry('radar')?.querySelector('div[dir]')).toBeNull()

    // X 展开导航时替换整个导航栏；入口在新导航栏里重建，带上文字
    renderNav({ expanded: true })
    ensureCreatorNavEntries()
    expect(entry('radar')?.getAttribute('data-xf-mode')).toBe('expanded')
    expect(entry('radar')?.textContent).toContain('Radar')
  })

  describe('点击', () => {
    let messages: any[]
    const onMessage = (e: MessageEvent) => messages.push(e.data)
    beforeEach(() => {
      messages = []
      window.addEventListener('message', onMessage)
    })
    afterEach(() => window.removeEventListener('message', onMessage))

    it('普通点击不整页跳转，请求页面拦截器换地址', async () => {
      changeRadarButton('on')
      const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
      entry('radar')!.dispatchEvent(click)

      expect(click.defaultPrevented).toBe(true)
      await vi.waitFor(() => expect(messages).toHaveLength(1))
      expect(messages[0]).toEqual({ type: CREATOR_NAV_NAVIGATE_TYPE, href: '/i/radar', __xf: XF_BRIDGE_MARKER })
    })

    it('按着 Cmd / Ctrl / Shift 点击交给浏览器在新标签页打开', async () => {
      changeRadarButton('on')
      for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }]) {
        const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init })
        entry('radar')!.dispatchEvent(click)
        expect(click.defaultPrevented).toBe(false)
      }
      await new Promise((r) => setTimeout(r, 10))
      expect(messages).toEqual([])
    })

    it('拦截器换了地址时不再整页打开', async () => {
      const intercept = (e: MessageEvent) => {
        if (e.data?.type === CREATOR_NAV_NAVIGATE_TYPE) navigateCreatorPage(e.data.href)
      }
      window.addEventListener('message', intercept)
      const fallback = vi.fn()
      openCreatorPage('/i/jf/creators/inspiration/top_posts', fallback)
      await new Promise((r) => setTimeout(r, NAVIGATE_FALLBACK_MS + 50))
      window.removeEventListener('message', intercept)

      expect(window.location.pathname).toBe('/i/jf/creators/inspiration/top_posts')
      expect(fallback).not.toHaveBeenCalled()
    })

    it('拦截器没有响应时整页打开', async () => {
      const fallback = vi.fn()
      openCreatorPage('/i/radar', fallback)
      await new Promise((r) => setTimeout(r, NAVIGATE_FALLBACK_MS + 50))

      expect(fallback).toHaveBeenCalledWith('/i/radar')
    })

    it('已在目标页时什么都不做', async () => {
      window.history.pushState({}, '', '/i/radar')
      const fallback = vi.fn()
      openCreatorPage('/i/radar', fallback)
      await new Promise((r) => setTimeout(r, NAVIGATE_FALLBACK_MS + 50))

      expect(messages).toEqual([])
      expect(fallback).not.toHaveBeenCalled()
    })
  })

  describe('navigateCreatorPage（页面拦截器里执行）', () => {
    it('写入 X 格式的历史记录并派发 popstate', () => {
      const events: PopStateEvent[] = []
      const onPop = (e: PopStateEvent) => events.push(e)
      window.addEventListener('popstate', onPop)
      const ok = navigateCreatorPage('/i/radar')
      window.removeEventListener('popstate', onPop)

      expect(ok).toBe(true)
      expect(window.location.pathname).toBe('/i/radar')
      expect(window.history.state.state).toEqual({ fromApp: true, previousPath: '/home' })
      expect(window.history.state.key).toMatch(/^[a-z0-9]+$/)
      expect(events).toHaveLength(1)
      expect(events[0].state).toEqual(window.history.state)
    })

    it('只接受 Radar 和灵感两个地址', () => {
      for (const href of ['/home', 'https://example.com/i/radar', '/i/radar/123', '//evil.test', 42, null]) {
        expect(navigateCreatorPage(href)).toBe(false)
      }
      expect(window.location.pathname).toBe('/home')
    })
  })

  it('每个入口在弹窗里都有图标', async () => {
    const { STATIC_NAV_ITEMS } = await import('../../shared/staticNavIcons')
    for (const item of CREATOR_NAV_ITEMS) {
      expect(STATIC_NAV_ITEMS.find((nav) => nav.id === item.id)?.innerHTML).toContain('<path')
    }
  })
})
