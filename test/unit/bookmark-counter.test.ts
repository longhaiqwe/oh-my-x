import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  applyBookmarkCountToButton,
  getContextTweetOrArticleId,
  setBookmarkCountEnabled,
  updateBookmarkCounters,
} from '../../content-scripts/features/bookmark-counter'

describe('bookmark-counter feature', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    setBookmarkCountEnabled(true)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should inject bookmark count into button with svg icon', () => {
    const btn = document.createElement('button')
    btn.setAttribute('data-testid', 'bookmark')
    btn.innerHTML = `
      <div>
        <div>
          <svg><path></path></svg>
        </div>
      </div>
    `
    document.body.appendChild(btn)

    applyBookmarkCountToButton(btn, 186)

    const counter = btn.querySelector('.xf-bookmark-counter')
    expect(counter).not.toBeNull()
    expect(counter?.textContent?.trim()).toBe('186')
    expect(btn.dataset.xfBookmarkCount).toBe('186')
  })

  it('should update existing counter when count changes', () => {
    const btn = document.createElement('button')
    btn.setAttribute('data-testid', 'bookmark')
    btn.innerHTML = `
      <div>
        <div>
          <svg><path></path></svg>
        </div>
      </div>
    `
    document.body.appendChild(btn)

    applyBookmarkCountToButton(btn, 100)
    expect(btn.querySelector('.xf-bookmark-counter')?.textContent?.trim()).toBe('100')

    applyBookmarkCountToButton(btn, 250)
    expect(btn.querySelector('.xf-bookmark-counter')?.textContent?.trim()).toBe('250')
  })

  it('should hide counter when count is 0', () => {
    const btn = document.createElement('button')
    btn.setAttribute('data-testid', 'bookmark')
    btn.innerHTML = `
      <div>
        <div>
          <svg><path></path></svg>
        </div>
      </div>
    `
    document.body.appendChild(btn)

    applyBookmarkCountToButton(btn, 50)
    const counter = btn.querySelector<HTMLElement>('.xf-bookmark-counter')
    expect(counter?.style.display).not.toBe('none')

    applyBookmarkCountToButton(btn, 0)
    expect(counter?.style.display).toBe('none')
  })

  it('should extract tweet or article id from context', () => {
    const tweetArticle = document.createElement('article')
    tweetArticle.setAttribute('data-testid', 'tweet')
    tweetArticle.innerHTML = `
      <a href="/user/status/987654321">Link</a>
      <div>
        <button data-testid="bookmark">
          <div><div><svg></svg></div></div>
        </button>
      </div>
    `
    document.body.appendChild(tweetArticle)

    const btn = tweetArticle.querySelector('button')!
    expect(getContextTweetOrArticleId(btn)).toBe('987654321')
  })

  it('should extract count from aria-label during updateBookmarkCounters', () => {
    const btn = document.createElement('button')
    btn.setAttribute('data-testid', 'bookmark')
    btn.setAttribute('aria-label', '32 个书签。将帖子添加到书签')
    btn.innerHTML = `
      <div>
        <div>
          <svg><path></path></svg>
        </div>
      </div>
    `
    document.body.appendChild(btn)

    updateBookmarkCounters()

    const counter = btn.querySelector('.xf-bookmark-counter')
    expect(counter).not.toBeNull()
    expect(counter?.textContent?.trim()).toBe('32')
  })

  it('should sync style from reference like/retweet button in same group', () => {
    const group = document.createElement('div')
    group.setAttribute('role', 'group')
    group.innerHTML = `
      <button data-testid="like">
        <div>
          <div><svg></svg></div>
          <div class="ref-class" style="color: rgb(83, 100, 113); font-size: 13px;">
            <span data-testid="app-text-transition-container">
              <span style="color: rgb(83, 100, 113); font-size: 13px;">191</span>
            </span>
          </div>
        </div>
      </button>
      <button data-testid="bookmark">
        <div>
          <div><svg></svg></div>
        </div>
      </button>
    `
    document.body.appendChild(group)

    const bookmarkBtn = group.querySelector<HTMLElement>('button[data-testid="bookmark"]')!
    applyBookmarkCountToButton(bookmarkBtn, 447)

    const counter = bookmarkBtn.querySelector<HTMLElement>('.xf-bookmark-counter')
    expect(counter).not.toBeNull()
    expect(counter?.textContent?.trim()).toBe('447')
    expect(counter?.style.fontSize).toBe('13px')
    expect(counter?.style.color).toBe('rgb(83, 100, 113)')
  })

  it('should highlight with twitter blue when bookmarked', () => {
    const btn = document.createElement('button')
    btn.setAttribute('data-testid', 'bookmark')
    btn.setAttribute('aria-label', '从书签中删除')
    btn.innerHTML = `
      <div>
        <div><svg></svg></div>
      </div>
    `
    document.body.appendChild(btn)

    applyBookmarkCountToButton(btn, 448)
    const counter = btn.querySelector<HTMLElement>('.xf-bookmark-counter')
    expect(counter?.style.color).toBe('rgb(29, 155, 240)')
  })

  it('should prioritize data-xf-bookmark-count attribute during updateBookmarkCounters', () => {
    const btn = document.createElement('button')
    btn.setAttribute('data-testid', 'bookmark')
    btn.setAttribute('data-xf-bookmark-count', '447')
    btn.innerHTML = `
      <div>
        <div>
          <svg><path></path></svg>
        </div>
      </div>
    `
    document.body.appendChild(btn)

    updateBookmarkCounters()

    const counter = btn.querySelector('.xf-bookmark-counter')
    expect(counter).not.toBeNull()
    expect(counter?.textContent?.trim()).toBe('447')
  })

  it('should extract article id from article card inside profile timeline', () => {
    const tweetArticle = document.createElement('article')
    tweetArticle.setAttribute('data-testid', 'tweet')
    tweetArticle.innerHTML = `
      <div>
        <a href="/longhaiqwe123/article/184123456789">Tim Urban 顶级思维模型</a>
      </div>
      <div>
        <button data-testid="bookmark">
          <div><div><svg></svg></div></div>
        </button>
      </div>
    `
    document.body.appendChild(tweetArticle)

    const btn = tweetArticle.querySelector('button')!
    expect(getContextTweetOrArticleId(btn)).toBe('184123456789')
  })

  it('should NOT skip injection if existing native container has no text (empty placeholder)', () => {
    const btn = document.createElement('button')
    btn.setAttribute('data-testid', 'bookmark')
    btn.setAttribute('data-xf-bookmark-count', '88')
    btn.innerHTML = `
      <div>
        <div><svg></svg></div>
        <div data-testid="app-text-transition-container">
          <span></span>
        </div>
      </div>
    `
    document.body.appendChild(btn)

    updateBookmarkCounters()

    const counter = btn.querySelector('.xf-bookmark-counter')
    expect(counter).not.toBeNull()
    expect(counter?.textContent?.trim()).toBe('88')
  })

  it('should fallback to detail stats text when in tweet status detail page', () => {
    const tweetArticle = document.createElement('article')
    tweetArticle.setAttribute('data-testid', 'tweet')
    tweetArticle.innerHTML = `
      <div>
        <div class="stats-bar">
          <span><span>447</span> <span>个书签</span></span>
        </div>
        <button data-testid="bookmark">
          <div><div><svg></svg></div></div>
        </button>
      </div>
    `
    document.body.appendChild(tweetArticle)

    updateBookmarkCounters()

    const counter = tweetArticle.querySelector('.xf-bookmark-counter')
    expect(counter).not.toBeNull()
    expect(counter?.textContent?.trim()).toBe('447')
  })
  it('关闭收藏量后移除已显示的数字和样式，并恢复按钮原有的内联样式', () => {
    const btn = document.createElement('button')
    btn.setAttribute('data-testid', 'bookmark')
    btn.style.width = '34px'
    btn.innerHTML = `
      <div>
        <div>
          <svg><path></path></svg>
        </div>
      </div>
    `
    document.body.appendChild(btn)

    applyBookmarkCountToButton(btn, 42)
    expect(btn.querySelector('.xf-bookmark-counter')).not.toBeNull()
    expect(btn.style.width).toBe('auto')
    expect(document.getElementById('xf-bookmark-counter-styles')).not.toBeNull()

    setBookmarkCountEnabled(false)
    expect(btn.querySelector('.xf-bookmark-counter')).toBeNull()
    expect(document.getElementById('xf-bookmark-counter-styles')).toBeNull()
    expect(btn.style.width).toBe('34px')
    expect(btn.style.display).toBe('')
    expect(btn.hasAttribute('data-xf-bookmark-styled')).toBe(false)
  })

  it('关闭期间不显示数字，点击书签也不会补画，重新打开后恢复显示', () => {
    const btn = document.createElement('button')
    btn.setAttribute('data-testid', 'bookmark')
    btn.setAttribute('aria-label', '32 个书签。将帖子添加到书签')
    btn.innerHTML = `
      <div>
        <div>
          <svg><path></path></svg>
        </div>
      </div>
    `
    document.body.appendChild(btn)

    updateBookmarkCounters()
    expect(btn.querySelector('.xf-bookmark-counter')).not.toBeNull()

    setBookmarkCountEnabled(false)
    updateBookmarkCounters()
    btn.click()
    vi.advanceTimersByTime(100)
    expect(btn.querySelector('.xf-bookmark-counter')).toBeNull()

    setBookmarkCountEnabled(true)
    updateBookmarkCounters()
    expect(btn.querySelector('.xf-bookmark-counter')?.textContent?.trim()).toBe('32')
  })
})
