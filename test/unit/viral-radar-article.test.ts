import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanupViralRadar, runViralRadar } from '../../content-scripts/features/viral-radar'

const statusId = '2122568684312940870'

afterEach(() => {
  cleanupViralRadar()
  document.body.replaceChildren()
  window.history.replaceState(null, '', '/')
  vi.restoreAllMocks()
})

describe('长文详情页流速', () => {
  function mountReader(views = '5,845') {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 17, 11, 32, 42))
    window.history.replaceState(null, '', `/u/status/${statusId}`)
    document.body.innerHTML = `<article data-testid="twitterArticleReadView">
      <div role="group" id="id__counts">
        <a href="/u/status/${statusId}/analytics" aria-label="${views} 次查看">
          <span class="css-146c3p1">${views}</span>
        </a>
      </div>
    </article>`
    return document.querySelector<HTMLAnchorElement>('a')!
  }

  it('浏览量节点被 X 重建后，重新补出流速', async () => {
    const analytics = mountReader()
    await runViralRadar(true)
    expect(analytics.querySelector('[data-xf-viral-badge]')).not.toBeNull()

    analytics.innerHTML = '<span class="css-146c3p1">5,845</span>'
    await runViralRadar()

    expect(analytics.querySelector('[data-xf-viral-badge]')?.textContent).toBe('🚀 1k/h')
  })

  it('先出现 0 次浏览时，实际浏览量到达后重新计算', async () => {
    const analytics = mountReader('0')
    await runViralRadar(true)
    expect(analytics.querySelector('[data-xf-viral-badge]')).toBeNull()

    analytics.setAttribute('aria-label', '5,845 次查看')
    analytics.querySelector('span')!.textContent = '5,845'
    await runViralRadar()

    expect(analytics.querySelector('[data-xf-viral-badge]')?.textContent).toBe('🚀 1k/h')
  })

  it('只更新浏览量说明属性时，也自动补出流速', async () => {
    const analytics = mountReader('')
    await runViralRadar(true)
    analytics.setAttribute('aria-label', '5,845 次查看')
    await vi.waitFor(() => {
      expect(analytics.querySelector('[data-xf-viral-badge]')?.textContent).toBe('🚀 1k/h')
    }, { timeout: 250 })
  })

  it('直接修改已有数字文本时，也自动补出流速', async () => {
    const analytics = mountReader('0')
    analytics.removeAttribute('aria-label')
    await runViralRadar(true)
    analytics.querySelector('span')!.firstChild!.nodeValue = '5,845'
    await vi.waitFor(() => {
      expect(analytics.querySelector('[data-xf-viral-badge]')?.textContent).toBe('🚀 1k/h')
    }, { timeout: 250 })
  })

  it('重复扫描不把流速里的 1k 当成浏览量，也不反复改写标签', async () => {
    const analytics = mountReader()
    analytics.removeAttribute('aria-label')
    await runViralRadar(true)
    const badge = analytics.querySelector('[data-xf-viral-badge]')!
    const mutations: MutationRecord[] = []
    const observer = new MutationObserver((records) => mutations.push(...records))
    observer.observe(analytics, { childList: true, subtree: true, attributes: true, characterData: true })
    try {
      for (let i = 0; i < 5; i++) await runViralRadar()
      expect(analytics.querySelector('[data-xf-viral-badge]')).toBe(badge)
      expect(badge.textContent).toBe('🚀 1k/h')
      expect([...mutations, ...observer.takeRecords()]).toHaveLength(0)
    } finally {
      observer.disconnect()
    }
  })

  it('原生数字重建后自动补回，关闭时移除且停止监听', async () => {
    const analytics = mountReader()
    await runViralRadar(true)
    analytics.innerHTML = '<span class="css-146c3p1">5,845</span>'
    await vi.waitFor(() => {
      expect(analytics.querySelector('[data-xf-viral-badge]')?.textContent).toBe('🚀 1k/h')
    }, { timeout: 250 })
    cleanupViralRadar()
    analytics.setAttribute('aria-label', '6,000 次查看')
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(analytics.querySelector('[data-xf-viral-badge]')).toBeNull()
  })

  it.each([true, false])('页面没有发布时间时，按本帖编号计算流速（外层推文节点：%s）', async (hasTweetWrapper) => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 10, 17, 11, 32, 42))
    window.history.replaceState(null, '', `/u/status/${statusId}`)
    const reader = `
        <article data-testid="twitterArticleReadView">
          <header><h1>长文标题</h1></header>
          <div data-testid="twitterArticleRichTextView">
            <a href="/other/status/123"><time datetime="2026-11-17T11:30:00Z">2 分钟前</time></a>
            <a href="/other/status/123/analytics" aria-label="50,000 次查看">50,000</a>
          </div>
          <div><div role="group" id="id__article_counts">
            <a href="/u/status/${statusId}/analytics" aria-label="5,845 次查看">
              <span class="css-146c3p1">5,845<span class="xf-stat-ratio-badge">普通</span></span>
            </a>
            <button data-testid="bookmark">104</button>
          </div></div>
        </article>`
    document.body.innerHTML = hasTweetWrapper ? `<article data-testid="tweet">${reader}</article>` : reader

    await runViralRadar(true)

    const badge = document.querySelector('.xf-stat-ratio-badge')?.nextElementSibling
    expect(badge?.textContent).toBe('🚀 1k/h')
    expect(document.querySelector('[data-xf-viral-highlight]')).toBeNull()

    await runViralRadar()
    expect(document.querySelectorAll('[data-xf-viral-badge]')).toHaveLength(1)
  })
})
