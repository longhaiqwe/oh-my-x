import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KeySearchDefaultLatest, KeySearchFilterBar } from '../../storage-keys'

type SearchModule = typeof import('../../content-scripts/features/search-tools')

let search: SearchModule
let store: Record<string, unknown>
let postMessage: ReturnType<typeof vi.spyOn>

/** 仿 X 搜索页顶部：搜索框一行 + 标签栏（nav 外面包一层 div） */
function renderHeader(href = location.pathname + location.search) {
  const url = new URL(href, location.origin)
  const tab = (f: string | null) => {
    const params = new URLSearchParams(url.searchParams)
    params.delete('f')
    if (f) params.set('f', f)
    const selected = (url.searchParams.get('f') || null) === f
    return `<a role="tab" aria-selected="${selected}" href="${url.pathname}?${params}">${f ?? 'top'}</a>`
  }
  document.body.innerHTML = `<main><div data-testid="primaryColumn"><div class="header"><div class="searchbox"></div><div class="nav-wrap"><nav role="navigation"><div role="tablist">${
    [null, 'live', 'user', 'media', 'list'].map(tab).join('')
  }</div></nav></div></div><section></section></div></main>`
  // jsdom 不支持点链接跳转，X 自己也是拦下点击走路由
  document.querySelector('main')!.addEventListener('click', (event) => event.preventDefault())
}

function go(href: string) {
  window.history.pushState(null, '', href)
  renderHeader()
  search.updateSearchTools()
}

function bar() {
  return document.querySelector<HTMLElement>('.xf-search-filters')
}

function select(field: string) {
  return bar()!.querySelector<HTMLSelectElement>(`select[data-field="${field}"]`)!
}

function button(field: string) {
  return bar()!.querySelector<HTMLButtonElement>(`button[data-field="${field}"]`)!
}

interface NavigateMessage { type?: string; href?: string; replace?: boolean }

function navigations() {
  return (postMessage.mock.calls as unknown[][])
    .map(([data]) => data as NavigateMessage)
    .filter((data) => data?.type === 'XF_SEARCH_NAVIGATE')
    .map(({ href, replace }: NavigateMessage) => ({ href, replace }))
}

async function start(settings: Record<string, string> = {}) {
  store = { ...settings }
  search = await import('../../content-scripts/features/search-tools')
  await search.initSearchTools()
}

beforeEach(() => {
  vi.resetModules()
  vi.stubGlobal('browser', {
    runtime: { id: 'test-extension' },
    storage: { local: { get: async () => ({ ...store }), set: async () => {} } },
  })
  postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {})
  window.history.replaceState(null, '', '/home')
  document.body.innerHTML = ''
})

afterEach(() => {
  postMessage.mockRestore()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

describe('搜索默认「最新」', () => {
  it('新的搜索停在「热门」时替换成「最新」的地址', async () => {
    await start()
    go('/search?q=claude&src=typed_query')
    expect(navigations()).toEqual([{ href: '/search?q=claude&src=typed_query&f=live', replace: true }])
  })

  it('打开页面时已经在「热门」也会换', async () => {
    window.history.replaceState(null, '', '/hashtag/AI?src=hashtag_click')
    renderHeader()
    await start()
    expect(navigations()).toEqual([{ href: '/hashtag/AI?src=hashtag_click&f=live', replace: true }])
  })

  it('用户点了「热门」标签后，这个搜索保持「热门」', async () => {
    await start()
    go('/search?q=claude&f=live')
    expect(navigations()).toEqual([])
    document.querySelector<HTMLAnchorElement>('a[role="tab"][aria-selected="false"]')!.click()
    go('/search?q=claude')
    expect(navigations()).toEqual([])
    go('/search?q=gemini')
    expect(navigations()).toEqual([{ href: '/search?q=gemini&f=live', replace: true }])
  })

  it('关掉开关后不换', async () => {
    await start({ [KeySearchDefaultLatest]: 'off' })
    go('/search?q=claude')
    expect(navigations()).toEqual([])
  })
})

describe('搜索筛选条', () => {
  it('插在标签栏后面，按搜索词显示当前条件', async () => {
    await start()
    go('/search?q=claude%20min_faves%3A100%20-filter%3Areplies%20lang%3Azh&f=live&pf=on')
    const nav = document.querySelector('nav')!
    expect(nav.nextElementSibling).toBe(bar())
    expect(bar()!.getAttribute('aria-label')).toBe('搜索筛选')
    expect(select('time').value).toBe('')
    expect(select('minLikes').value).toBe('100')
    expect(select('minLikes').selectedOptions[0].textContent).toBe('至少 100 赞')
    expect(bar()!.querySelectorAll('select')).toHaveLength(3)
    expect(bar()!.querySelector('select[data-field="lang"]')).toBeNull()
    expect(select('minLikes').parentElement!.dataset.active).toBe('true')
    expect(select('time').parentElement!.dataset.active).toBe('false')
    expect(button('originalOnly').getAttribute('aria-pressed')).toBe('true')
    expect(button('following').getAttribute('aria-pressed')).toBe('true')
    expect(bar()!.querySelector<HTMLElement>('.xf-search-clear')!.hidden).toBe(false)
  })

  it('搜索框里自己写的值不在选项里时，加一个选项显示原文', async () => {
    await start()
    go('/search?q=a%20within_time%3A3d%20min_faves%3A500&f=live')
    expect(select('time').selectedOptions[0].textContent).toBe('within_time:3d')
    expect(select('minLikes').selectedOptions[0].textContent).toBe('至少 500 赞')
    go('/search?q=a&f=live')
    expect(select('time').querySelector('option[data-custom]')).toBeNull()
    expect(select('time').value).toBe('')
    expect(bar()!.querySelector<HTMLElement>('.xf-search-clear')!.hidden).toBe(true)
  })

  it('选择后改写搜索词，按新增历史记录跳转', async () => {
    await start()
    go('/search?q=claude%20min_faves%3A10&src=typed_query&f=live')
    select('time').value = '7d'
    select('time').dispatchEvent(new Event('change'))
    button('originalOnly').click()
    button('following').click()
    expect(navigations()).toEqual([
      { href: '/search?q=claude%20within_time%3A7d%20min_faves%3A10&src=typed_query&f=live', replace: false },
      { href: '/search?q=claude%20min_faves%3A10%20-filter%3Areplies&src=typed_query&f=live', replace: false },
      { href: '/search?q=claude%20min_faves%3A10&src=typed_query&f=live&pf=on', replace: false },
    ])
  })

  it('清除筛选去掉筛选条管的语法和只看关注的人，其他语法（含 lang:）保留', async () => {
    await start()
    go('/search?q=from%3Ax%20claude%20lang%3Aen%20min_faves%3A10&f=live&pf=on')
    bar()!.querySelector<HTMLButtonElement>('.xf-search-clear')!.click()
    expect(navigations()).toEqual([{ href: '/search?q=from%3Ax%20claude%20lang%3Aen&f=live', replace: false }])
  })

  it('在「热门」里改条件后停在「热门」，默认「最新」不再切换', async () => {
    await start()
    go('/search?q=claude&f=live')
    document.querySelector<HTMLAnchorElement>('a[role="tab"][aria-selected="false"]')!.click()
    go('/search?q=claude')
    select('media').value = 'images'
    select('media').dispatchEvent(new Event('change'))
    expect(navigations()).toEqual([{ href: '/search?q=claude%20filter%3Aimages', replace: false }])
    go('/search?q=claude%20filter%3Aimages')
    expect(navigations()).toHaveLength(1)
  })

  it('话题标签页上筛选，换成搜索页', async () => {
    await start()
    go('/hashtag/AI?src=hashtag_click&f=live')
    select('media').value = 'videos'
    select('media').dispatchEvent(new Event('change'))
    expect(navigations()).toEqual([{ href: '/search?q=%23AI%20filter%3Avideos&f=live', replace: false }])
  })

  it('「用户」「列表」标签和非搜索页不显示', async () => {
    await start()
    go('/search?q=a&f=user')
    expect(bar()).toBeNull()
    go('/search?q=a&f=live')
    expect(bar()).not.toBeNull()
    go('/home')
    expect(bar()).toBeNull()
  })

  it('关掉开关后移除，打开后重新插入', async () => {
    await start({ [KeySearchFilterBar]: 'off' })
    go('/search?q=a&f=live')
    expect(bar()).toBeNull()
    search.setSearchToolsSettings({ latest: true, filterBar: true })
    expect(bar()).not.toBeNull()
    search.setSearchToolsSettings({ latest: true, filterBar: false })
    expect(bar()).toBeNull()
  })

  it('X 重新渲染顶部后重新插入，只保留一条', async () => {
    await start()
    go('/search?q=a&f=live')
    renderHeader()
    search.updateSearchTools()
    expect(document.querySelectorAll('.xf-search-filters')).toHaveLength(1)
    expect(document.querySelector('nav')!.nextElementSibling).toBe(bar())
  })
})
