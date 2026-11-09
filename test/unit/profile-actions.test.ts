import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scanAndInjectHoverCards } from '../../content-scripts/features/quick-list'
import { runFavoriteBloggersFeature } from '../../content-scripts/features/favorite-bloggers'
import { applyLanguageSetting } from '../../shared/i18n'
import { KeyFavoriteBloggersEnabled, KeyQuickLists } from '../../storage-keys'

let stored: Record<string, unknown>
const group = () => document.querySelector<HTMLElement>('.xf-profile-name-actions')!
const list = () => document.querySelector<HTMLButtonElement>('.xf-quick-list-btn')!
const favorite = () => document.querySelector<HTMLButtonElement>('.xf-favorite-blogger-button')!

beforeEach(() => {
  window.history.replaceState({}, '', '/home')
  stored = { [KeyQuickLists]: [{ id: '123', name: '阅读', isOwned: true }] }
  vi.stubGlobal('browser', { runtime: { id: 'test', sendMessage: vi.fn(async () => ({ ok: true })) }, storage: { local: { get: async () => stored } } })
  document.body.innerHTML = `<div data-testid="HoverCard"><div class="native"><a href="/bob"><span>B</span></a><button data-testid="123-follow"><span>正在关注</span></button></div><div data-testid="User-Name"><div class="name"><a href="/bob"><span>Bob</span></a><svg aria-label="认证账号"></svg></div><div><span>@bob</span></div></div></div>`
  applyLanguageSetting('zh-CN')
})
afterEach(() => { vi.unstubAllGlobals(); applyLanguageSetting('zh-CN'); document.body.style.removeProperty('font-family') })

describe('昵称右侧的扩展操作', () => {
  it('按钮使用昵称文字的原生字体，避免继承 body 字体，并在重新扫描时跟随更新', async () => {
    document.body.style.fontFamily = '"Comic Sans MS", cursive'
    const name = document.querySelector<HTMLElement>('.name span')!
    name.style.fontFamily = '"TwitterChirp", Arial, sans-serif'
    scanAndInjectHoverCards()
    await runFavoriteBloggersFeature()
    for (const button of [list(), favorite()]) {
      expect(button.style.fontFamily).toBe(getComputedStyle(name).fontFamily)
      expect(button.style.fontFamily).not.toBe(getComputedStyle(document.body).fontFamily)
    }
    name.style.fontFamily = 'Helvetica, sans-serif'
    scanAndInjectHoverCards()
    await runFavoriteBloggersFeature()
    expect(list().style.fontFamily).toBe(getComputedStyle(name).fontFamily)
    expect(favorite().style.fontFamily).toBe(getComputedStyle(name).fontFamily)
  })

  it('博主主页也显示两个纯文字按钮，无关注按钮时仍能打开列表', async () => {
    window.history.replaceState({}, '', '/alice')
    document.body.innerHTML = '<main data-testid="primaryColumn"><div data-testid="UserName"><div class="name"><span>Alice</span><svg aria-label="认证账号"></svg></div><div><span>@alice</span></div></div></main>'
    scanAndInjectHoverCards()
    await runFavoriteBloggersFeature()
    expect([...group().children]).toEqual([list(), favorite()])
    expect(list()?.textContent).toBe('加列表')
    expect(favorite()?.textContent).toBe('收藏')
    expect(group().querySelector('svg')).toBeNull()
    expect(list().style.height).toBe(favorite().style.height)
    expect(list().style.padding).toBe(favorite().style.padding)
    expect(list().style.justifyContent).toBe('center')
    expect(favorite().style.justifyContent).toBe('center')
    list().click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.querySelector('.xf-ql-panel .xf-ql-item')?.textContent).toContain('阅读')
    document.querySelector<HTMLElement>('.xf-ql-panel .xf-ql-item')!.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'XF_ADD_TO_LIST', listId: '123', handle: 'alice', userId: null })
    document.body.click()
  })

  it('主页路由切换时移除旧用户按钮，等待资料名称与路由一致后再注入', () => {
    window.history.replaceState({}, '', '/alice')
    document.body.innerHTML = '<main data-testid="primaryColumn"><div data-testid="UserName"><span>Alice</span><span>@alice</span></div></main>'
    scanAndInjectHoverCards()
    expect(list()?.dataset.handle).toBe('alice')
    window.history.replaceState({}, '', '/carol')
    scanAndInjectHoverCards()
    expect(list()).toBeNull()
    document.querySelector('[data-testid="UserName"]')!.innerHTML = '<span>Carol</span><span>@carol</span>'
    scanAndInjectHoverCards()
    expect(list()?.dataset.handle).toBe('carol')
  })

  it.each(['list-first', 'favorite-first'])('两功能按任意顺序初始化都共用一行：%s', async order => {
    if (order === 'list-first') scanAndInjectHoverCards()
    await runFavoriteBloggersFeature()
    scanAndInjectHoverCards()
    await runFavoriteBloggersFeature()
    expect([...group().children]).toEqual([list(), favorite()])
    expect(group().previousElementSibling).toBe(document.querySelector('.name'))
    expect(group().nextElementSibling?.textContent).toBe('@bob')
    expect(list().textContent).toBe('加列表')
    expect(favorite().textContent).toBe('收藏')
    expect(group().querySelector('svg')).toBeNull()
    expect(document.querySelector('.native')!.querySelectorAll('button')).toHaveLength(1)
    expect(document.querySelector('.native')!.getAttribute('style')).toBeNull()
    const observer = new MutationObserver(() => {})
    observer.observe(group(), { childList: true })
    scanAndInjectHoverCards()
    await runFavoriteBloggersFeature()
    expect(observer.takeRecords()).toHaveLength(0)
    observer.disconnect()
  })

  it('英文保留 + List，切换语言后不会重复按钮', async () => {
    scanAndInjectHoverCards()
    applyLanguageSetting('en')
    scanAndInjectHoverCards()
    await runFavoriteBloggersFeature()
    expect(list().textContent).toBe('+ List')
    expect(favorite().textContent).toBe('Save')
    expect(group().children).toHaveLength(2)
  })

  it.each(['list', 'favorite'])('关闭 %s 不影响另一个功能，全部关闭后恢复原生布局', async first => {
    scanAndInjectHoverCards()
    await runFavoriteBloggersFeature()
    if (first === 'list') scanAndInjectHoverCards(false)
    else { stored[KeyFavoriteBloggersEnabled] = 'off'; await runFavoriteBloggersFeature() }
    expect(group().children).toHaveLength(1)
    expect(group().firstElementChild).toBe(first === 'list' ? favorite() : list())
    scanAndInjectHoverCards(false)
    stored[KeyFavoriteBloggersEnabled] = 'off'
    await runFavoriteBloggersFeature()
    expect(group()).toBeNull()
    expect(document.querySelector('.xf-profile-name-layout')).toBeNull()
    expect(document.querySelector('.xf-profile-name-content')).toBeNull()
  })

  it('移动后的加列表按钮仍打开原有列表选择面板', async () => {
    scanAndInjectHoverCards()
    list().click()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.querySelector('.xf-ql-panel .xf-ql-item')?.textContent).toContain('阅读')
    document.body.click()
  })
})
