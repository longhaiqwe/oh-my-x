import { beforeEach, describe, expect, it } from 'vitest'
import { placeNavEntry } from '../../content-scripts/features/quick-list'

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
