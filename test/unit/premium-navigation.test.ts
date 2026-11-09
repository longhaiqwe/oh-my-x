import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addXPremiumButton, changeXPremiumButton } from '../../content-scripts/options/navigation'

function premiumLink(label: string, href = '/i/premium_sign_up', extra = '') {
  return `<a role="link" aria-label="${label}" href="${href}" ${extra}>
    <div><div><svg><path d="M0 0"/></svg></div><div><span>${label}</span></div></div>
  </a>`
}

function mountNav(entries: string) {
  document.body.innerHTML = `<header role="banner"><nav role="navigation">${entries}
    <a role="link" data-testid="AppTabBar_Profile_Link" href="/alice" aria-label="个人资料">
      <div><div><svg><path d="M1 1"/></svg></div><div><span>个人资料</span></div></div>
    </a>
  </nav></header>`
}

describe('Premium 导航入口去重', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    document.head.innerHTML = ''
  })

  afterEach(() => {
    changeXPremiumButton('on')
    vi.clearAllTimers()
    vi.useRealTimers()
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it.each(['订阅', 'Abonnement', 'Premium'])('保留名为 %s 的原生入口，不添加重复按钮', (label) => {
    mountNav(premiumLink(label))
    const native = document.querySelector('a')!
    addXPremiumButton()
    vi.advanceTimersByTime(100)
    expect(document.querySelectorAll('a[href*="premium"]')).toHaveLength(1)
    expect(document.querySelector('a')).toBe(native)
    expect(document.querySelector('.xf-sidebar-button')).toBeNull()
  })

  it('链接变化时仍通过稳定标识识别原生入口', () => {
    mountNav(premiumLink('订阅', '/i/subscribe', 'data-testid="premium-signup-tab"'))
    addXPremiumButton()
    vi.advanceTimersByTime(100)
    expect(document.querySelector('.xf-sidebar-button')).toBeNull()
  })

  it('移除旧版添加的重复按钮，保留原生入口和其他插件入口', () => {
    mountNav(
      premiumLink('订阅') +
      premiumLink('Premium', '/settings/premium', 'class="xf-sidebar-button"') +
      '<a class="xf-sidebar-button" href="/alice/lists" aria-label="Lists">Lists</a>',
    )
    const native = document.querySelector('a')!
    addXPremiumButton()
    vi.advanceTimersByTime(100)
    expect(document.querySelectorAll('a[href*="premium"]')).toHaveLength(1)
    expect(document.querySelector('a')).toBe(native)
    expect(document.querySelector('[aria-label="Lists"]')).not.toBeNull()
  })

  it('延迟执行期间出现原生入口时也不重复添加', () => {
    mountNav('')
    addXPremiumButton()
    document.querySelector('nav')!.insertAdjacentHTML('afterbegin', premiumLink('订阅'))
    vi.advanceTimersByTime(100)
    expect(document.querySelectorAll('a[href*="premium"]')).toHaveLength(1)
  })

  it('关闭再开启后只恢复原生入口', () => {
    mountNav(premiumLink('订阅'))
    const native = document.querySelector('a')!
    changeXPremiumButton('off')
    expect(getComputedStyle(native).display).toBe('none')
    changeXPremiumButton('on')
    vi.advanceTimersByTime(100)
    expect(getComputedStyle(native).display).not.toBe('none')
    expect(document.querySelectorAll('a[href*="premium"]')).toHaveLength(1)
  })

  it('只存在插件入口时重复执行不会将其删除或重复添加', () => {
    mountNav(premiumLink('Premium', '/settings/premium', 'class="xf-sidebar-button"'))
    addXPremiumButton()
    vi.advanceTimersByTime(100)
    addXPremiumButton()
    vi.advanceTimersByTime(100)
    expect(document.querySelectorAll('a[href*="premium"]')).toHaveLength(1)
  })

  it('页面没有 Premium 入口和可用图标时不添加按钮', () => {
    mountNav('')
    addXPremiumButton()
    vi.advanceTimersByTime(100)
    expect(document.querySelector('.xf-sidebar-button')).toBeNull()
  })
})
