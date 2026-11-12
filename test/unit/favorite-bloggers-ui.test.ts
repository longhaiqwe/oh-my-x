import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { closeFavoriteBloggersPanel, runFavoriteBloggersFeature } from '../../content-scripts/features/favorite-bloggers'
import { createFavoriteBloggerWriter } from '../../shared/favorite-bloggers'
import { KeyFavoriteBloggers, KeyFavoriteBloggersEnabled } from '../../storage-keys'
import { ensureQuickListNavEntry } from '../../content-scripts/features/quick-list'
import { applyLanguageSetting } from '../../shared/i18n'
import { getDynamicFeatureScopes } from '../../content-scripts/initialize'
import { MENTION_SEARCH_MESSAGE } from '../../shared/mention-search'

let stored: Record<string, unknown>
let get: Mock<() => Promise<Record<string, unknown>>>
let send: ReturnType<typeof vi.fn>
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const nav = () => document.querySelector<HTMLAnchorElement>('.xf-favorites-nav')!
const rows = () => document.querySelectorAll('.xf-favorites-row')
const button = () => document.querySelector<HTMLButtonElement>('[data-testid="HoverCard"] .xf-favorite-blogger-button')!

function mount() {
  document.body.innerHTML = `
    <header role="banner" style="width:275px"><nav role="navigation">
      <a role="link" href="/home" data-testid="AppTabBar_Home_Link"><div><div><svg viewBox="0 0 24 24"></svg></div><div><span>主页</span></div></div></a>
      <a role="link" href="/alice/lists">Lists</a>
    </nav></header>
    <main data-testid="primaryColumn"><div><div data-testid="UserName"><span>爱丽丝</span><span>@alice</span></div></div></main>
    <div data-testid="HoverCard"><a data-testid="UserLink" href="/bob"><div data-testid="User-Name"><span>Bob</span><span>@bob</span></div></a><div><button data-testid="123-follow">关注</button></div></div>
  `
}

beforeEach(() => {
  closeFavoriteBloggersPanel()
  applyLanguageSetting('zh-CN')
  window.history.replaceState({}, '', '/alice')
  stored = {}
  get = vi.fn(async () => structuredClone(stored))
  const storage = { get, set: vi.fn(async (value: Record<string, unknown>) => { Object.assign(stored, structuredClone(value)) }) }
  send = vi.fn(createFavoriteBloggerWriter(storage))
  vi.stubGlobal('browser', { storage: { local: storage }, runtime: { id: 'test', sendMessage: send } })
  mount()
})
afterEach(() => {
  closeFavoriteBloggersPanel()
  document.body.style.removeProperty('font-family')
  vi.unstubAllGlobals()
  applyLanguageSetting('zh-CN')
})

describe('收藏界面', () => {
  it('搜索收藏后保存头像，重开面板仍显示，图片失败时保留默认图标', async () => {
    const avatar = 'https://pbs.twimg.com/profile_images/123/alice_normal.jpg'
    const save = send.getMockImplementation()! as (message: unknown) => Promise<unknown>
    send.mockImplementation(async message => message.type === MENTION_SEARCH_MESSAGE
      ? { ok: true, users: [{ handle: 'alice', name: 'Alice', avatar }] } : save(message))
    await runFavoriteBloggersFeature()
    nav().click()
    await flush()
    const form = document.querySelector<HTMLFormElement>('.xf-favorites-form')!
    form.querySelector('input')!.value = 'Alice'
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    document.querySelector<HTMLButtonElement>('.xf-favorites-candidate')!.click()
    await flush()
    expect(stored[KeyFavoriteBloggers]).toEqual([{ handle: 'alice', name: 'Alice', avatar }])
    closeFavoriteBloggersPanel()
    nav().click()
    await flush()
    const image = rows()[0].querySelector('img')!
    expect(image?.src).toBe(avatar)
    image.dispatchEvent(new Event('error'))
    expect(rows()[0].querySelector('img')).toBeNull()
    expect(rows()[0].querySelector('.xf-favorites-avatar svg')).not.toBeNull()
  })

  it.each(['profile', 'hover'])('从 %s 收藏时读取对应博主头像，忽略其他用户图片', async source => {
    const avatar = 'https://pbs.twimg.com/profile_images/123/avatar.jpg'
    const root = document.querySelector(source === 'profile' ? 'main' : '[data-testid="HoverCard"]')!
    const handle = source === 'profile' ? 'alice' : 'bob'
    root.insertAdjacentHTML('afterbegin', `<a href="/other/photo"><img src="https://pbs.twimg.com/profile_images/456/other.jpg"></a><a href="/${handle}/photo"><img src="${avatar}"></a>`)
    await runFavoriteBloggersFeature()
    root.querySelector<HTMLButtonElement>('.xf-favorite-blogger-button')!.click()
    await flush()
    expect(stored[KeyFavoriteBloggers]).toEqual([expect.objectContaining({ handle, avatar })])
  })

  it('旧收藏只补取用户名精确匹配的头像，保存后不再重复查询', async () => {
    const avatar = 'https://pbs.twimg.com/profile_images/123/bob.jpg'
    stored[KeyFavoriteBloggers] = [{ handle: 'bob', name: '自存昵称' }, { handle: 'carol', name: 'Carol' }]
    const save = send.getMockImplementation()! as (message: unknown) => Promise<unknown>
    send.mockImplementation(async message => message.type === MENTION_SEARCH_MESSAGE
      ? { ok: true, users: [{ handle: 'BOB', name: 'Bob', avatar }] } : save(message))
    await runFavoriteBloggersFeature()
    nav().click()
    await flush()
    await flush()
    expect(stored[KeyFavoriteBloggers]).toEqual([{ handle: 'bob', name: '自存昵称', avatar }, { handle: 'carol', name: 'Carol' }])
    expect(rows()[0].querySelector('img')?.src).toBe(avatar)
    expect(rows()[1].querySelector('.xf-favorites-avatar svg')).not.toBeNull()
    await runFavoriteBloggersFeature()
    await flush()
    expect(send.mock.calls.filter(([message]) => message.type === MENTION_SEARCH_MESSAGE)).toHaveLength(2)
  })

  it('关闭面板后不保存迟到的头像查询', async () => {
    stored[KeyFavoriteBloggers] = [{ handle: 'bob', name: 'Bob' }]
    const save = send.getMockImplementation()! as (message: unknown) => Promise<unknown>
    let resolve!: (result: unknown) => void
    send.mockImplementation(message => message.type === MENTION_SEARCH_MESSAGE
      ? new Promise(r => { resolve = r }) : save(message))
    await runFavoriteBloggersFeature()
    nav().click()
    await flush()
    expect(resolve).toBeTypeOf('function')
    closeFavoriteBloggersPanel()
    resolve({ ok: true, users: [{ handle: 'bob', avatar: 'https://pbs.twimg.com/profile_images/123/bob.jpg' }] })
    await flush()
    expect(stored[KeyFavoriteBloggers]).toEqual([{ handle: 'bob', name: 'Bob' }])
  })

  it.each(['乔木', 'Chris'])('输入昵称 %s 后选择候选，保存名字并可在已有收藏中搜索；重复选择不重复添加', async query => {
    const save = send.getMockImplementation()! as (message: unknown) => Promise<unknown>
    send.mockImplementation(async message => message.type === MENTION_SEARCH_MESSAGE ? {
      ok: true, users: [{ id: '123', name: '向阳乔木', handle: 'vista8', avatar: '', following: true, verified: false }],
    } : save(message))
    await runFavoriteBloggersFeature()
    nav().click()
    await flush()
    const form = document.querySelector<HTMLFormElement>('.xf-favorites-form')!
    const input = form.querySelector('input')!
    for (let attempt = 0; attempt < 2; attempt++) {
      input.value = query
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flush()
      if (attempt === 0) expect(stored[KeyFavoriteBloggers]).toBeUndefined()
      document.querySelector<HTMLButtonElement>('.xf-favorites-candidate')!.click()
      await flush()
      expect(stored[KeyFavoriteBloggers]).toEqual([{ name: '向阳乔木', handle: 'vista8' }])
    }
    expect(document.querySelector('.xf-favorites-status')!.textContent).toContain('已收藏这个博主')
    const filter = document.querySelector<HTMLInputElement>('input[type="search"]')!
    filter.value = '乔木'
    filter.dispatchEvent(new Event('input'))
    expect(rows()).toHaveLength(1)
    expect(rows()[0].querySelector('a')!.href).toBe('https://x.com/vista8')
  })

  it('导航入口及挂到 body 的列表、收藏面板沿用 X 导航文字字体', async () => {
    document.body.style.fontFamily = '"Comic Sans MS", cursive'
    const native = document.querySelector<HTMLElement>('[data-testid="AppTabBar_Home_Link"] span')!
    native.style.fontFamily = '"TwitterChirp", Arial, sans-serif'
    const expected = getComputedStyle(native).fontFamily
    ensureQuickListNavEntry(true, 'top')
    const listNav = document.querySelector<HTMLElement>('.xf-quick-list-nav-entry')!
    expect(listNav.querySelector('span')!.style.fontFamily).toBe(expected)
    listNav.click()
    await flush()
    const listPanel = document.querySelector<HTMLElement>('.xf-ql-nav-panel')!
    expect(listPanel.parentElement).toBe(document.body)
    expect(listPanel.style.fontFamily).toBe(expected)
    document.body.click()
    await runFavoriteBloggersFeature()
    nav().click()
    await flush()
    const favoritesPanel = document.querySelector<HTMLElement>('.xf-favorites-panel')!
    expect(favoritesPanel.parentElement).toBe(document.body)
    expect(favoritesPanel.style.fontFamily).toBe(expected)
  })

  it.each([true, false])('收藏放在昵称右侧，不挤占关注与 List 按钮行（名称标记：%s）', async marked => {
    const card = document.querySelector('[data-testid="HoverCard"]')!
    card.innerHTML = `
      <div class="card-content" style="display:flex;flex-direction:column;width:300px;padding:16px">
        <div class="card-actions" style="display:flex;flex-direction:row">
          <a href="/bob"><span>B</span></a>
          <button data-testid="123-follow">正在关注</button>
          <button class="xf-quick-list-btn">+ List</button>
        </div>
        <div class="card-name" ${marked ? 'data-testid="User-Name"' : ''}>
          <div class="display-name"><a href="/bob"><span>Bob</span></a><svg aria-label="认证账号"></svg></div><a href="/bob"><span>@bob</span></a>
        </div>
        <div class="card-bio">简介</div>
      </div>`
    await runFavoriteBloggersFeature()
    const row = card.querySelector('.xf-profile-name-layout')!
    expect(row).toBe(card.querySelector('.card-name'))
    expect(card.querySelector('.card-actions .xf-favorite-blogger-button')).toBeNull()
    expect(button().parentElement!.previousElementSibling).toBe(card.querySelector('.display-name'))
    expect(button().parentElement!.nextElementSibling?.textContent).toBe('@bob')
    expect(button().textContent).toBe('收藏')
    expect(button().closest('a')).toBeNull()
    button().click()
    await flush()
    expect(button().getAttribute('aria-pressed')).toBe('true')
    await runFavoriteBloggersFeature()
    expect(card.querySelectorAll('.xf-profile-name-layout')).toHaveLength(1)
    expect(card.querySelectorAll('.xf-favorite-blogger-button')).toHaveLength(1)
    stored[KeyFavoriteBloggersEnabled] = 'off'
    await runFavoriteBloggersFeature()
    expect(card.querySelector('.xf-profile-name-layout')).toBeNull()
    expect(card.querySelector('.xf-quick-list-btn')).not.toBeNull()
  })

  it('首页与资料卡独立添加、取消收藏，重复扫描不重复注入', async () => {
    await runFavoriteBloggersFeature()
    await runFavoriteBloggersFeature()
    expect(document.querySelectorAll('.xf-favorite-blogger-button')).toHaveLength(2)
    const profile = document.querySelector<HTMLButtonElement>('main .xf-favorite-blogger-button')!
    profile.click()
    await flush()
    expect(stored[KeyFavoriteBloggers]).toEqual([{ handle: 'alice', name: '爱丽丝' }])
    expect(profile.getAttribute('aria-pressed')).toBe('true')
    profile.click()
    await flush()
    expect(stored[KeyFavoriteBloggers]).toEqual([])
    expect(profile.getAttribute('aria-pressed')).toBe('false')
  })

  it('主页的嵌套名称结构中，收藏紧随昵称与认证标记，用户名仍在下一行', async () => {
    const name = document.querySelector('[data-testid="UserName"]')!
    name.innerHTML = '<div><div><div class="display-name"><span>爱丽丝</span><button aria-label="认证账号">✓</button></div><div class="handle"><span>@alice</span></div></div></div><div></div>'
    await runFavoriteBloggersFeature()
    const favorite = name.querySelector<HTMLButtonElement>('.xf-favorite-blogger-button')!
    expect(favorite.parentElement!.previousElementSibling).toBe(name.querySelector('.display-name'))
    expect(favorite.parentElement!.nextElementSibling).toBe(name.querySelector('.handle'))
    expect(favorite.textContent).toBe('收藏')
    expect(favorite.closest('a, button') === favorite).toBe(true)
  })

  it('资料卡收藏按钮使用统一的紧凑文字按钮，不受原生按钮字号影响', async () => {
    const nativeName = document.querySelector<HTMLElement>('[data-testid="HoverCard"] [data-testid="User-Name"] span')!
    nativeName.style.fontFamily = 'Arial, sans-serif'
    const follow = document.querySelector<HTMLElement>('[data-testid="123-follow"]')!
    follow.style.cssText = 'height:36px;border:1px solid rgb(83, 100, 113);border-radius:9999px'
    follow.innerHTML = '<span style="font-family:Arial;font-size:15px;font-weight:700;line-height:20px">正在关注</span>'
    Object.defineProperty(follow, 'offsetHeight', { value: 36 })
    await runFavoriteBloggersFeature()
    expect(button().style.height).toBe('28px')
    expect(button().style.minWidth).toBe('0px')
    expect(button().querySelector('svg')).toBeNull()
    expect(button().style.fontSize).toBe('12px')
    expect(button().style.fontWeight).toBe('600')
    expect(button().style.fontFamily).toBe(getComputedStyle(nativeName).fontFamily)
    expect(button().style.borderStyle).toBe('none')
    expect(button().style.borderRadius).toBe('8px')
  })

  it('导航面板支持链接添加、搜索和移除，使用正确的主页地址', async () => {
    await runFavoriteBloggersFeature()
    nav().click()
    await flush()
    expect(document.querySelector('.xf-favorites-empty')?.textContent).toContain('还没有收藏')
    const form = document.querySelector<HTMLFormElement>('.xf-favorites-form')!
    form.querySelector('input')!.value = 'https://x.com/Carol?s=20'
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flush()
    expect(rows()).toHaveLength(1)
    expect(rows()[0].querySelector('a')?.href).toBe('https://x.com/Carol')
    const search = document.querySelector<HTMLInputElement>('input[type="search"]')!
    search.value = 'nobody'
    search.dispatchEvent(new Event('input'))
    expect(rows()).toHaveLength(0)
    search.value = '@carol'
    search.dispatchEvent(new Event('input'))
    expect(rows()).toHaveLength(1)
    rows()[0].querySelector<HTMLButtonElement>('[data-remove-handle]')!.click()
    await flush()
    expect(stored[KeyFavoriteBloggers]).toEqual([])
    expect(rows()).toHaveLength(0)
  })

  it('失败保留收藏和按钮状态，支持重试', async () => {
    stored[KeyFavoriteBloggers] = [{ handle: 'bob', name: 'Bob' }]
    await runFavoriteBloggersFeature()
    send.mockResolvedValueOnce({ ok: false })
    button().click()
    await flush()
    expect(button().getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.xf-favorites-toast')?.textContent).toContain('保存失败')
    button().click()
    await flush()
    expect(button().getAttribute('aria-pressed')).toBe('false')
  })

  it('读取失败有提示，不覆盖已有数据', async () => {
    await runFavoriteBloggersFeature()
    get.mockRejectedValueOnce(new Error('read failed'))
    nav().click()
    await flush()
    expect(document.querySelector('.xf-favorites-empty')?.textContent).toContain('无法读取收藏')
    expect(send).not.toHaveBeenCalled()
  })

  it('接收其他标签页的存储变更后更新面板，并安全显示昵称', async () => {
    await runFavoriteBloggersFeature()
    nav().click()
    await flush()
    stored[KeyFavoriteBloggers] = [{ handle: 'bob', name: '<img src=x onerror=alert(1)>' }]
    await runFavoriteBloggersFeature()
    expect(rows()).toHaveLength(1)
    expect(rows()[0].querySelector('img')).toBeNull()
    expect(rows()[0].textContent).toContain('<img')
    expect(button().getAttribute('aria-pressed')).toBe('true')
  })

  it('导航支持键盘、Escape 返回焦点、点击外部关闭', async () => {
    await runFavoriteBloggersFeature()
    nav().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await flush()
    expect(nav().getAttribute('aria-expanded')).toBe('true')
    expect(document.querySelector('.xf-favorites-header button')).toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(document.querySelector('.xf-favorites-panel')).toBeNull()
    expect(document.activeElement).toBe(nav())
    nav().click()
    await flush()
    document.body.click()
    expect(nav().getAttribute('aria-expanded')).toBe('false')
    nav().click()
    await flush()
    nav().click()
    expect(document.querySelector('.xf-favorites-panel')).toBeNull()
  })

  it('我的列表同样支持 Escape 返回入口焦点、再次点击入口和点击外部关闭', async () => {
    ensureQuickListNavEntry(true, 'top')
    const entry = document.querySelector<HTMLElement>('.xf-quick-list-nav-entry')!
    for (const method of ['escape', 'toggle', 'outside']) {
      entry.click()
      await flush()
      const panel = document.querySelector('.xf-ql-nav-panel')!
      expect(panel).not.toBeNull()
      if (method === 'escape') {
        panel.querySelector<HTMLElement>('button')?.focus()
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        expect(document.activeElement).toBe(entry)
      } else if (method === 'toggle') entry.click()
      else document.body.click()
      expect(document.querySelector('.xf-ql-nav-panel')).toBeNull()
      expect(entry.getAttribute('aria-expanded')).toBe('false')
    }
  })

  it.each(['top', 'sidebar'])('收藏固定在主页上方，与我的列表（%s）不互相移动，窄导航只显示图标', async position => {
    await runFavoriteBloggersFeature()
    ensureQuickListNavEntry(true, position)
    await runFavoriteBloggersFeature()
    const order = () => [...document.querySelector('nav')!.children].map(el => el.className || el.getAttribute('href'))
    const home = document.querySelector('[data-testid="AppTabBar_Home_Link"]')!
    expect(nav().textContent).toContain('收藏')
    expect(nav().textContent).not.toContain('我的')
    expect(nav().compareDocumentPosition(home) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const original = order()
    ensureQuickListNavEntry(true, position)
    await runFavoriteBloggersFeature()
    expect(order()).toEqual(original)
    // 已有入口被移回旧位置时，重新扫描也要恢复到主页上方。
    home.insertAdjacentElement('afterend', nav())
    await runFavoriteBloggersFeature()
    expect(order()).toEqual(original)
    ensureQuickListNavEntry(false)
    await runFavoriteBloggersFeature()
    expect(nav().nextElementSibling).toBe(home)
    document.querySelector('header')!.style.width = '80px'
    await runFavoriteBloggersFeature()
    expect(nav().getAttribute('data-xf-mode')).toBe('collapsed')
    document.querySelector('header')!.style.width = '275px'
    await runFavoriteBloggersFeature()
    expect(nav().getAttribute('data-xf-mode')).toBe('expanded')
  })

  it('宽容器中原生文字隐藏后，收藏同步收起并对齐，恢复后重新展开', async () => {
    await runFavoriteBloggersFeature()
    const home = document.querySelector<HTMLElement>('[data-testid="AppTabBar_Home_Link"]')!
    const label = home.querySelector<HTMLElement>('span')!.parentElement!
    label.style.display = 'none'
    home.style.alignItems = 'center'
    await flush()
    expect(nav().dataset.xfMode).toBe('collapsed')
    expect(nav().style.alignItems).toBe('center')
    expect(nav().querySelector('span')!.parentElement!.style.display).toBe('none')
    label.style.display = ''
    home.style.alignItems = 'flex-start'
    await flush()
    expect(nav().dataset.xfMode).toBe('expanded')
    expect(nav().querySelector('span')!.parentElement!.style.display).toBe('')
  })

  it('拖动手柄排序并保存，搜索结果中也保留未显示的收藏，重开后顺序不变', async () => {
    stored[KeyFavoriteBloggers] = [
      { handle: 'alice', name: '同名 Alice' }, { handle: 'bob', name: 'Bob' }, { handle: 'carol', name: '同名 Carol' },
    ]
    await runFavoriteBloggersFeature()
    nav().click()
    await flush()
    const search = document.querySelector<HTMLInputElement>('.xf-favorites-search input')!
    search.value = '同名'
    search.dispatchEvent(new Event('input'))
    const grip = rows()[1].querySelector<HTMLElement>('.xf-favorites-drag')!
    expect(grip).not.toBeNull()
    const transfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
    const drag = (target: Element, type: string, clientY = 0) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, { dataTransfer: { value: transfer }, clientY: { value: clientY } })
      target.dispatchEvent(event)
    }
    drag(grip, 'dragstart')
    drag(rows()[0], 'dragover', -1)
    expect(rows()[0].getAttribute('data-drop-position')).toBe('before')
    drag(rows()[0], 'drop', -1)
    await flush()
    expect((stored[KeyFavoriteBloggers] as {handle:string}[]).map(item => item.handle)).toEqual(['carol', 'alice', 'bob'])
    closeFavoriteBloggersPanel()
    nav().click()
    await flush()
    expect([...rows()].map(row => row.querySelector('a')?.getAttribute('href'))).toEqual(['https://x.com/carol', 'https://x.com/alice', 'https://x.com/bob'])
  })

  it('取消拖动或保存失败时保留原顺序，关闭面板后不残留拖动状态', async () => {
    stored[KeyFavoriteBloggers] = ['alice', 'bob'].map(handle => ({ handle, name: handle }))
    await runFavoriteBloggersFeature()
    nav().click()
    await flush()
    const grip = rows()[1].querySelector<HTMLElement>('.xf-favorites-drag')!
    grip.dispatchEvent(new Event('dragstart', { bubbles: true }))
    expect(rows()[1].hasAttribute('data-dragging')).toBe(true)
    grip.dispatchEvent(new Event('dragend', { bubbles: true }))
    expect(document.querySelector('[data-dragging]')).toBeNull()
    expect(send.mock.calls.filter(([message]) => message.type !== MENTION_SEARCH_MESSAGE)).toHaveLength(0)
    send.mockResolvedValueOnce({ ok: false })
    grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    await flush()
    expect((stored[KeyFavoriteBloggers] as {handle:string}[]).map(item => item.handle)).toEqual(['alice', 'bob'])
    expect(document.querySelector('.xf-favorites-status')?.textContent).toContain('失败')
    expect(document.querySelector<HTMLButtonElement>('.xf-favorites-drag')!.disabled).toBe(false)
    closeFavoriteBloggersPanel()
    expect(document.querySelector('[data-dragging]')).toBeNull()
  })

  it('关掉功能清理入口和按钮但保留收藏', async () => {
    stored[KeyFavoriteBloggers] = [{ handle: 'alice', name: 'Alice' }]
    await runFavoriteBloggersFeature()
    nav().click()
    await flush()
    stored[KeyFavoriteBloggersEnabled] = 'off'
    await runFavoriteBloggersFeature()
    expect(nav()).toBeNull()
    expect(button()).toBeNull()
    expect(document.querySelector('.xf-favorites-panel')).toBeNull()
    expect(stored[KeyFavoriteBloggers]).toHaveLength(1)
  })

  it('切换路由时不把旧资料收藏为新博主，异步资料加载触发扫描', async () => {
    await runFavoriteBloggersFeature()
    window.history.replaceState({}, '', '/carol')
    await runFavoriteBloggersFeature()
    expect(document.querySelector('main .xf-favorite-blogger-button')).toBeNull()
    const name = document.querySelector('[data-testid="UserName"]')!
    name.innerHTML = '<span>Carol</span><span>@carol</span>'
    const mutation = { target: name, addedNodes: [], removedNodes: [] } as unknown as MutationRecord
    expect(getDynamicFeatureScopes([mutation])).toContain('tweet')
    await runFavoriteBloggersFeature()
    expect(document.querySelector('main .xf-favorite-blogger-button')?.getAttribute('data-handle')).toBe('carol')
  })

  it('英文界面没有硬编码中文', async () => {
    applyLanguageSetting('en')
    await runFavoriteBloggersFeature()
    nav().click()
    await flush()
    expect(nav().textContent).toContain('Favorites')
    expect(document.querySelector('.xf-favorites-panel')?.textContent).not.toMatch(/[\u4e00-\u9fff]/)
  })
})
