import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { changeBookmarksButton, changeListsButton } from '../../content-scripts/options/navigation'
import { STATIC_NAV_ITEMS } from '../../shared/staticNavIcons'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function mountNav() {
  document.body.innerHTML = `
    <header role="banner"><nav role="navigation">
      <button data-testid="AppTabBar_More_Menu" aria-label="更多">更多</button>
    </nav></header>
    <div id="layers"></div>
  `
}

// 模拟 X 点开「更多」后渲染的菜单
async function openMoreMenu(items: string) {
  document.querySelector<HTMLElement>('[data-testid="AppTabBar_More_Menu"]')!.click()
  const menu = document.createElement('div')
  menu.setAttribute('data-testid', 'Dropdown')
  menu.setAttribute('role', 'menu')
  menu.innerHTML = items
  document.getElementById('layers')!.append(menu)
  await sleep(80)
  return menu
}

function isHidden(el: Element | null) {
  return (el as HTMLElement | null)?.style.display === 'none'
}

describe('「更多」菜单里的导航入口', () => {
  beforeEach(() => mountNav())
  afterEach(() => {
    changeBookmarksButton('on')
    document.body.innerHTML = ''
  })

  it('关掉书签后，菜单里的这一项被隐藏，其他项不受影响', async () => {
    changeBookmarksButton('off')
    const menu = await openMoreMenu(`
      <a role="menuitem" href="/i/bookmarks"><span>书签</span></a>
      <a role="menuitem" href="/settings"><span>设置和隐私</span></a>
    `)
    expect(isHidden(menu.querySelector('a[href="/i/bookmarks"]'))).toBe(true)
    expect(isHidden(menu.querySelector('a[href="/settings"]'))).toBe(false)
  })

  it('Lists 设置不影响 X 原生的列表：导航栏和「更多」菜单都照常显示', async () => {
    const nav = document.querySelector('nav[role="navigation"]')!
    nav.insertAdjacentHTML('afterbegin', `<a role="link" aria-label="列表" href="/alice/lists"><span>列表</span></a>`)

    changeListsButton('off')
    expect(document.getElementById('xf-style-lists')).toBeNull()
    expect(getComputedStyle(nav.querySelector('a[href*="lists"]')!).display).not.toBe('none')

    const menu = await openMoreMenu(`
      <a role="menuitem" href="/alice/lists"><span>列表</span></a>
      <div role="menuitem" id="en"><span>Lists</span></div>
    `)
    expect(isHidden(menu.querySelector('a[href*="lists"]'))).toBe(false)
    expect(isHidden(menu.querySelector('#en'))).toBe(false)
  })

  it('Lists 设置为关时，只删掉插件自己加的 Lists 按钮', () => {
    const nav = document.querySelector('nav[role="navigation"]')!
    nav.insertAdjacentHTML('afterbegin', `
      <a class="xf-sidebar-button" aria-label="Lists" href="/alice/lists"></a>
      <a class="xf-sidebar-button xf-quick-list-nav-entry" aria-label="我的 Lists" href="/i/lists"></a>
      <a role="link" aria-label="列表" href="/alice/lists" id="native"></a>
    `)
    changeListsButton('off')
    expect(nav.querySelector('[aria-label="Lists"]')).toBeNull()
    expect(nav.querySelector('.xf-quick-list-nav-entry')).not.toBeNull()
    expect(nav.querySelector('#native')).not.toBeNull()
  })

  it('链接地址对不上时，按菜单文字也能找到', async () => {
    changeBookmarksButton('off')
    const menu = await openMoreMenu(`
      <div role="menuitem" id="en"><span>Bookmarks</span></div>
      <div role="menuitem" id="other"><span>Bookmarks Folder</span></div>
    `)
    expect(isHidden(menu.querySelector('#en'))).toBe(true)
    // 只按完整文字匹配，避免误伤名字相近的项
    expect(isHidden(menu.querySelector('#other'))).toBe(false)
  })

  it('菜单开着时重新打开开关，入口马上恢复', async () => {
    changeBookmarksButton('off')
    const menu = await openMoreMenu(`<a role="menuitem" href="/i/bookmarks"><span>书签</span></a>`)
    const item = menu.querySelector('a[href="/i/bookmarks"]')
    expect(isHidden(item)).toBe(true)

    changeBookmarksButton('on')
    expect(isHidden(item)).toBe(false)
  })

  it('没有点「更多」时打开的其他菜单不受影响', async () => {
    changeBookmarksButton('off')
    const menu = document.createElement('div')
    menu.setAttribute('data-testid', 'Dropdown')
    menu.innerHTML = `<a role="menuitem" href="/i/bookmarks"><span>书签</span></a>`
    document.getElementById('layers')!.append(menu)
    await sleep(80)
    expect(isHidden(menu.querySelector('a'))).toBe(false)
  })
})

it('弹窗的导航栏按钮里不再提供创作者工作室', () => {
  // X 已把它收进「更多」菜单，显隐开关没有意义
  expect(STATIC_NAV_ITEMS.map((item) => item.label)).not.toContain('创作者工作室')
  expect(STATIC_NAV_ITEMS).toHaveLength(10)
})
