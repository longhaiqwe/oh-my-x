import { beforeEach, describe, expect, it } from 'vitest'
import {
  computeNavPanelPosition,
  getNavAnchorRect,
  placeNavEntry,
} from '../../content-scripts/features/quick-list'

function mountNav() {
  document.body.innerHTML = `
    <nav role="navigation">
      <a id="home" data-testid="AppTabBar_Home_Link" href="/home" role="link">主页</a>
      <a id="explore" href="/explore" role="link">探索</a>
      <a id="lists" href="/alice/lists" role="link">列表</a>
      <a id="profile" data-testid="AppTabBar_Profile_Link" href="/alice" role="link">个人资料</a>
    </nav>
  `
  const nav = document.querySelector('nav')!
  const home = document.getElementById('home')!
  const entry = document.createElement('a')
  entry.className = 'xf-quick-list-nav-entry'
  entry.id = 'entry'
  entry.setAttribute('href', '/i/lists')
  entry.setAttribute('role', 'link')
  return { nav, home, entry }
}

const order = () => Array.from(document.querySelectorAll('nav > a')).map((a) => a.id)

describe('Lists 导航入口位置', () => {
  let ctx: ReturnType<typeof mountNav>
  beforeEach(() => {
    ctx = mountNav()
  })

  it('已在 Home 上方的入口，改成「列表区」后立即移到原生 Lists 后面', () => {
    placeNavEntry(ctx.nav, ctx.home, ctx.entry, 'top')
    expect(order()).toEqual(['entry', 'home', 'explore', 'lists', 'profile'])

    placeNavEntry(ctx.nav, ctx.home, ctx.entry, 'sidebar')
    expect(order()).toEqual(['home', 'explore', 'lists', 'entry', 'profile'])
  })

  it('从「列表区」改回「Home 上方」也立即生效', () => {
    placeNavEntry(ctx.nav, ctx.home, ctx.entry, 'sidebar')
    placeNavEntry(ctx.nav, ctx.home, ctx.entry, 'top')
    expect(order()).toEqual(['entry', 'home', 'explore', 'lists', 'profile'])
  })

  it('已经在目标位置时不再移动', () => {
    placeNavEntry(ctx.nav, ctx.home, ctx.entry, 'sidebar')
    const before = order()
    placeNavEntry(ctx.nav, ctx.home, ctx.entry, 'sidebar')
    placeNavEntry(ctx.nav, ctx.home, ctx.entry, 'sidebar')
    expect(order()).toEqual(before)
  })
})

describe('「我的列表」面板位置', () => {
  const viewport = { width: 1200, height: 800 }
  const panel = { width: 300, height: 400 }

  it('贴在入口右侧，顶部与入口对齐', () => {
    const pos = computeNavPanelPosition({ left: 80, right: 340, top: 160 }, panel, viewport)
    expect(pos).toEqual({ left: 348, top: 160 })
  })

  it('右侧放不下时改放到入口左侧', () => {
    const pos = computeNavPanelPosition({ left: 1000, right: 1150, top: 160 }, panel, viewport)
    expect(pos.left).toBe(1000 - 300 - 8)
  })

  it('入口靠近屏幕底部时面板上移，不超出视口', () => {
    const pos = computeNavPanelPosition({ left: 80, right: 340, top: 700 }, panel, viewport)
    expect(pos.top).toBe(800 - 400 - 8)
  })

  it('按入口里的圆角高亮定位，而不是占满左栏宽度的整条链接', () => {
    const entry = document.createElement('a')
    const pill = document.createElement('div')
    entry.appendChild(pill)
    entry.getBoundingClientRect = () => ({ left: 0, right: 600, top: 160, bottom: 210, width: 600, height: 50 }) as DOMRect
    pill.getBoundingClientRect = () => ({ left: 80, right: 340, top: 160, bottom: 210, width: 260, height: 50 }) as DOMRect
    expect(getNavAnchorRect(entry).right).toBe(340)
  })
})
