import { describe, it, expect, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { changeHighlightNonFollowers } from '../../content-scripts/options/interface'

describe('changeHighlightNonFollowers 页面作用域测试', () => {
  let dom: JSDOM

  const createDom = (url: string) => {
    dom = new JSDOM(
      `<!DOCTYPE html><html><head></head><body>
        <div data-testid="UserCell" id="user-1">
          <button data-testid="12345-unfollow" aria-label="正在关注 @user1">
            <span>正在关注</span>
          </button>
        </div>
        <div data-testid="UserCell" id="user-2">
          <div data-testid="userFollowIndicator"><span>关注了你</span></div>
          <button data-testid="67890-unfollow" aria-label="正在关注 @user2">
            <span>正在关注</span>
          </button>
        </div>
      </body></html>`,
      { pretendToBeVisual: true, url },
    )
    globalThis.document = dom.window.document
    // @ts-expect-error jsdom window 与浏览器 Window 类型不完全兼容
    globalThis.window = dom.window
    globalThis.location = dom.window.location
  }

  afterEach(() => {
    if (dom) dom.window.close()
  })

  it('在非 /following 页面（如 /home）上，不添加任何高亮样式，且清理已有样式', () => {
    createDom('https://x.com/home')
    changeHighlightNonFollowers('on')

    const user1Btn = document.querySelector('#user-1 button')!
    expect(user1Btn.classList.contains('xf-non-follower-btn')).toBe(false)
    expect(document.getElementById('xf-style-highlightNonFollowers')).toBeNull()
  })

  it('在 /following 页面上，对未关注我的用户按钮添加红色边框类名 xf-non-follower-btn', () => {
    createDom('https://x.com/my_username/following')
    changeHighlightNonFollowers('on')

    const user1Btn = document.querySelector('#user-1 button')!
    const user2Btn = document.querySelector('#user-2 button')!

    // user1 没有 userFollowIndicator，因此被标记
    expect(user1Btn.classList.contains('xf-non-follower-btn')).toBe(true)
    // user2 有 userFollowIndicator，保持原样
    expect(user2Btn.classList.contains('xf-non-follower-btn')).toBe(false)
    expect(document.getElementById('xf-style-highlightNonFollowers')).not.toBeNull()
  })

  it('切换离开 /following 页面时，自动清理之前的标红类名', () => {
    createDom('https://x.com/my_username/following')
    changeHighlightNonFollowers('on')

    const user1Btn = document.querySelector('#user-1 button')!
    expect(user1Btn.classList.contains('xf-non-follower-btn')).toBe(true)

    // 模拟路由跳转到 /home
    dom.reconfigure({ url: 'https://x.com/home' })
    changeHighlightNonFollowers('on')

    expect(user1Btn.classList.contains('xf-non-follower-btn')).toBe(false)
    expect(document.getElementById('xf-style-highlightNonFollowers')).toBeNull()
  })

  it('注入的样式包含结构性 :has 选择器，即便 React 在 hover/移出时重置类名，也能持续命中非互关按钮', () => {
    createDom('https://x.com/my_username/following')
    changeHighlightNonFollowers('on')

    const styleEl = document.getElementById('xf-style-highlightNonFollowers')
    expect(styleEl).not.toBeNull()
    const cssText = styleEl!.textContent || ''
    expect(cssText).toContain(':not(:has([data-testid="userFollowIndicator"]))')

    // 模拟 React 在 hover 移出后重置了 button 的 className，导致 xf-non-follower-btn 被抹除
    const user1Btn = document.querySelector('#user-1 button')!
    const user2Btn = document.querySelector('#user-2 button')!
    user1Btn.classList.remove('xf-non-follower-btn')

    // 验证基于结构的选择器仍能精准命中 user-1（未关注），而不会命中 user-2（已关注我）
    const selector = '[data-testid="UserCell"]:not(:has([data-testid="userFollowIndicator"])) button[data-testid*="-unfollow"]'
    const matchedButtons = Array.from(document.querySelectorAll(selector))
    expect(matchedButtons).toContain(user1Btn)
    expect(matchedButtons).not.toContain(user2Btn)
  })
})

