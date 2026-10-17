import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { changeBookmarksButton, changeCreatorStudioButton } from '../../content-scripts/options/navigation'

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
    changeCreatorStudioButton('on')
    changeBookmarksButton('on')
    document.body.innerHTML = ''
  })

  it('关掉创作者工作室后，菜单里的这一项被隐藏，其他项不受影响', async () => {
    changeCreatorStudioButton('off')
    const menu = await openMoreMenu(`
      <a role="menuitem" href="/i/jf/creators/studio"><span>创作者工作室</span></a>
      <a role="menuitem" href="/settings"><span>设置和隐私</span></a>
    `)
    expect(isHidden(menu.querySelector('a[href*="creators/studio"]'))).toBe(true)
    expect(isHidden(menu.querySelector('a[href="/settings"]'))).toBe(false)
  })

  it('链接地址对不上时，按菜单文字也能找到', async () => {
    changeCreatorStudioButton('off')
    const menu = await openMoreMenu(`
      <div role="menuitem" id="en"><span>Creator Studio</span></div>
      <div role="menuitem" id="other"><span>Creator Studio Tips</span></div>
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
    changeCreatorStudioButton('off')
    const menu = document.createElement('div')
    menu.setAttribute('data-testid', 'Dropdown')
    menu.innerHTML = `<a role="menuitem" href="/i/jf/creators/studio"><span>创作者工作室</span></a>`
    document.getElementById('layers')!.append(menu)
    await sleep(80)
    expect(isHidden(menu.querySelector('a'))).toBe(false)
  })
})
