import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { changeTimelineWidth, syncAccountAnalyticsPageMarker } from '../../content-scripts/options/timeline'

describe('changeTimelineWidth', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM(
      `<!DOCTYPE html><html><head>
        <style>
          .r-1mdsvnl { width: 95%; }
          .r-1ye8kvj { max-width: 600px; }
        </style>
      </head><body>
        <main role="main">
          <div>
            <div data-testid="primaryColumn" id="column" style="width:800px">
              <div>
                <div>
                  <div class="r-1mdsvnl" id="search">搜索书签</div>
                  <div class="r-1ye8kvj" id="feed-wrap">
                    <section role="region" id="feed">timeline</section>
                  </div>
                </div>
              </div>
            </div>
            <div data-testid="sidebarColumn">Sidebar</div>
          </div>
        </main>
      </body></html>`,
      { pretendToBeVisual: true, url: 'https://x.com/i/bookmarks' },
    )
    globalThis.document = dom.window.document
    // @ts-expect-error jsdom window 与浏览器 Window 类型不完全兼容
    globalThis.window = dom.window
    globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
  })

  afterEach(() => {
    dom.window.close()
  })

  it('expands section parent past 600px without stretching bookmarks search to 100%', () => {
    const search = document.getElementById('search')!
    expect(getComputedStyle(search).width).toBe('95%')

    changeTimelineWidth(800)

    const css = document.getElementById('xf-style-timelineWidth')!.textContent!

    // Timeline feed: override the 600px wrapper (X .r-1ye8kvj) via :has(> section) and profile state selectors
    expect(css).toContain('div:has(> section[role="region"])')
    expect(css).toContain('div.r-13qz1uu.r-1ye8kvj')
    expect(css).toContain('section[role="region"]')
    expect(css).toMatch(
      /div:has\(> section\[role="region"\]\)[\s\S]*?\{[^}]*max-width:\s*800px\s*!important/,
    )
    expect(css).toMatch(
      /div:has\(> section\[role="region"\]\)[\s\S]*?\{[^}]*width:\s*100%\s*!important/,
    )

    // Must not revive the old blanket depth-4 rule that broke search
    expect(css).not.toContain('> div > div > div > div')

    // Search keeps its own 95% (no matching width:100% override)
    expect(getComputedStyle(search).width).toBe('95%')
  })

  // 回归：以前时间线 > 600 时会把整个左栏强行设成 200–275px。
  // 窗口窄于 1265px 时 X 只显示 88px 图标，左边空出一大块，右侧栏被挤出屏幕、出现横向滚动条
  it('never forces the left column width', () => {
    for (const width of [600, 650, 700, 800]) {
      changeTimelineWidth(width)
      const css = document.getElementById('xf-style-timelineWidth')!.textContent!
      expect(css).not.toMatch(/header\[role="banner"\]\s*\{\s*width:/)
    }
  })

  it('gives the timeline and right sidebar priority over blank space beside the navigation', () => {
    changeTimelineWidth(700)
    const css = document.getElementById('xf-style-timelineWidth')!.textContent!

    // X 在宽屏给导航加的左边距要去掉，否则空间紧张时它也不让出来
    expect(css).toMatch(
      /header\[role="banner"\]:has\(\+ main\[role="main"\] \[data-testid="sidebarColumn"\]\) > div \{\s*margin-left: 0px !important;/,
    )
    // 中间区域按内容定宽，只针对有右侧栏的布局，私信、设置等页面不受影响
    expect(css).toMatch(
      /main\[role="main"\] > div:has\(\[data-testid="sidebarColumn"\]\),[\s\S]*?\{\s*width: fit-content !important;\s*max-width: 100% !important;/,
    )
    // 放不下时时间线自动收窄，最窄 600px
    expect(css).toMatch(
      /\[data-testid="primaryColumn"\]:has\(\+ \[data-testid="sidebarColumn"\]\) \{\s*flex-shrink: 1 !important;\s*min-width: 600px !important;/,
    )
  })

  it('gates the primaryColumn width rules behind the account-analytics marker', () => {
    changeTimelineWidth(800)

    const css = document.getElementById('xf-style-timelineWidth')!.textContent!

    // 所有主列宽度规则都必须被 body 标记排除，账号分析页（/i/account_analytics）与 Radar 页面不受限
    const column =
      'body:not([data-xf-account-analytics]):not([data-xf-radar]) [data-testid="primaryColumn"]:has(+ [data-testid="sidebarColumn"])'
    expect(css).toContain(`${column} {`)
    expect(css).toContain(`${column} div:has(> section[role="region"])`)
    expect(css).toContain(`${column} section[role="region"]`)
    // 布局分配规则同样受标记约束，这两个页面保持 X 原样
    expect(css).toContain(
      'body:not([data-xf-account-analytics]):not([data-xf-radar]) main[role="main"] > div:has([data-testid="sidebarColumn"])',
    )
  })

  it('syncs the account-analytics marker based on the current path', () => {
    const marker = 'data-xf-account-analytics'

    // 非分析页：标记不存在
    syncAccountAnalyticsPageMarker()
    expect(document.body.hasAttribute(marker)).toBe(false)

    // 进入账号分析页：标记存在
    dom.window.history.pushState({}, '', '/i/account_analytics')
    syncAccountAnalyticsPageMarker()
    expect(document.body.hasAttribute(marker)).toBe(true)

    // 离开分析页：标记移除，宽度规则恢复
    dom.window.history.pushState({}, '', '/home')
    syncAccountAnalyticsPageMarker()
    expect(document.body.hasAttribute(marker)).toBe(false)
  })

  it('applies the width rules to the timeline column next to the right sidebar', () => {
    changeTimelineWidth(700)
    const column = document.getElementById('column')!
    const feed = document.getElementById('feed')!
    expect(rulesMatching(column).some((rule) => rule.style.getPropertyValue('width') === '700px')).toBe(true)
    expect(rulesMatching(feed).length).toBeGreaterThan(0)
  })

  it('resets primary margin-right when right sidebar is hidden', () => {
    changeTimelineWidth(700, 'on')
    const css = document.getElementById('xf-style-timelineWidth')!.textContent!
    expect(css).toContain('margin-right: 0px;')

    changeTimelineWidth(700, 'off')
    const cssWithSidebar = document.getElementById('xf-style-timelineWidth')!.textContent!
    expect(cssWithSidebar).toContain('margin-right: 20px;')
  })
})

// 私信页（/i/chat，旧地址 /messages 会跳过来）：主列后面没有右侧栏，聊天区宽度由 X 自己决定。
// 以前时间线宽度把主列设成 700px，1250px 窗口下本该约 980px 的聊天区被压窄、右边空着；
// 「隐藏右侧边栏」把外层按内容定宽，主列直接塌成 2px
describe('layout options on pages without the right sidebar', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM(
      `<!DOCTYPE html><html><head></head><body>
        <header role="banner"><div><div>Nav</div></div></header>
        <main role="main">
          <div>
            <div>
              <div>
                <div data-testid="primaryColumn" id="chat">
                  <div>
                    <div>
                      <section role="region" id="conversations">会话列表</section>
                      <section role="region" id="thread">聊天内容</section>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </body></html>`,
      { pretendToBeVisual: true, url: 'https://x.com/i/chat' },
    )
    globalThis.document = dom.window.document
    // @ts-expect-error jsdom window
    globalThis.window = dom.window
  })

  afterEach(() => {
    dom.window.close()
  })

  it('leaves the chat column and the surrounding layout untouched', () => {
    for (const sidebar of ['off', 'on']) {
      changeTimelineWidth(700, sidebar)
      const touched = Array.from(document.body.querySelectorAll('*')).filter(
        (el) => rulesMatching(el).length > 0,
      )
      expect(touched.map((el) => el.id || el.tagName.toLowerCase())).toEqual([])
    }
  })

  it('does not shrink the chat column when the right sidebar is hidden', async () => {
    const { changeSidebarColumn } = await import('../../content-scripts/options/interface')
    changeSidebarColumn('on')
    const touched = Array.from(document.body.querySelectorAll('*')).filter(
      (el) => rulesMatching(el, 'hideSidebarColumn').length > 0,
    )
    expect(touched.map((el) => el.id || el.tagName.toLowerCase())).toEqual([])
    changeSidebarColumn('off')
  })
})

/** 某份注入样式（默认时间线宽度）里，选择器能命中 el 的规则；媒体查询里的规则一并展开 */
function rulesMatching(el: Element, id = 'timelineWidth') {
  const sheet = (document.getElementById(`xf-style-${id}`) as HTMLStyleElement).sheet!
  return Array.from(sheet.cssRules)
    .flatMap((rule) => ('cssRules' in rule ? Array.from((rule as CSSMediaRule).cssRules) : [rule]))
    .map((rule) => rule as CSSStyleRule)
    .filter((rule) => el.matches(rule.selectorText))
}

describe('changeSidebarColumn', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM(
      `<!DOCTYPE html><html><head></head><body>
        <header role="banner"><div><div><div>Nav</div></div></div></header>
        <main role="main">
          <div>
            <div>
              <div data-testid="primaryColumn">Timeline</div>
              <div data-testid="sidebarColumn">Sidebar</div>
            </div>
          </div>
        </main>
      </body></html>`,
      { pretendToBeVisual: true, url: 'https://x.com/home' },
    )
    globalThis.document = dom.window.document
    // @ts-expect-error jsdom window
    globalThis.window = dom.window
  })

  afterEach(() => {
    dom.window.close()
  })

  it('injects auto-centering styles when right sidebar is hidden', async () => {
    const { changeSidebarColumn } = await import('../../content-scripts/options/interface')
    changeSidebarColumn('on')

    const css = document.getElementById('xf-style-hideSidebarColumn')!.textContent!
    expect(css).toContain('[data-testid="sidebarColumn"] { display: none !important; }')

    // 时间线布局：导航去掉左边距、中间区域按内容定宽、主列去掉右边距，整体居中
    const declared = (el: Element, prop: string) =>
      rulesMatching(el, 'hideSidebarColumn').map((rule) => rule.style.getPropertyValue(prop))
    expect(declared(document.querySelector('header[role="banner"] > div')!, 'margin-left')).toContain('0px')
    expect(declared(document.querySelector('main[role="main"] > div')!, 'width')).toContain('fit-content')
    expect(declared(document.querySelector('[data-testid="primaryColumn"]')!, 'margin-right')).toContain('0px')

    changeSidebarColumn('off')
    expect(document.getElementById('xf-style-hideSidebarColumn')).toBeNull()
  })
})

describe('changeTweetButton', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM(
      `<!DOCTYPE html><html><head></head><body>
        <header role="banner">
          <nav role="navigation">
            <a data-testid="SideNav_NewTweet_Button" href="/compose/post"><span>Tweet</span></a>
          </nav>
        </header>
      </body></html>`,
      { pretendToBeVisual: true, url: 'https://x.com/home' },
    )
    globalThis.document = dom.window.document
    // @ts-expect-error jsdom window
    globalThis.window = dom.window
  })

  afterEach(() => {
    dom.window.close()
  })

  it('hides both native and custom tweet buttons with hover-overriding specificity when off', async () => {
    const { changeTweetButton } = await import('../../content-scripts/options/interface')
    changeTweetButton('off')

    const css = document.getElementById('xf-style-hideTweetButton')!.textContent!
    expect(css).toContain('.xf-custom-tweet-button')
    expect(css).toContain('a[data-testid="SideNav_NewTweet_Button"]')
    expect(css).toContain('header[role="banner"]:hover')
    expect(css).toContain('display: none !important;')

    changeTweetButton('on')
    expect(document.getElementById('xf-style-hideTweetButton')).toBeNull()
  })

  it('restores and ensures custom tweet button when navigation labels are never or hover', async () => {
    const { changeTweetButton } = await import('../../content-scripts/options/interface')
    changeTweetButton('off')
    expect(document.querySelector('.xf-custom-tweet-button')).toBeNull()

    changeTweetButton('on', 'never')
    expect(document.getElementById('xf-style-hideTweetButton')).toBeNull()
    expect(document.querySelector('.xf-custom-tweet-button')).not.toBeNull()
  })
})
