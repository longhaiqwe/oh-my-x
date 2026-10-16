import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ReplyAssistant,
  isTweetDetailPage,
} from '../../content-scripts/features/reply-assistant'

function mockTweetCell(id: string, datetime: string, isComposer = false) {
  if (isComposer) {
    return `
      <div data-testid="cellInnerDiv">
        <div data-testid="tweetTextarea_0"></div>
      </div>
    `
  }
  return `
    <div data-testid="cellInnerDiv" id="cell-${id}">
      <article data-testid="tweet" id="tweet-${id}">
        <div data-testid="User-Name">
          <a href="/user/status/${id}">
            <time datetime="${datetime}">${datetime}</time>
          </a>
        </div>
        <div data-testid="tweetText">Tweet ${id}</div>
      </article>
    </div>
  `
}

describe('isTweetDetailPage URL matching', () => {
  it('correctly accepts standard tweet detail URLs', () => {
    expect(isTweetDetailPage('/elonmusk/status/1888888888888')).toBe(true)
    expect(isTweetDetailPage('/user/status/12345/photo/1')).toBe(true)
    expect(isTweetDetailPage('/i/status/999999')).toBe(true)
  })

  it('accepts single article read pages and rejects articles list pages', () => {
    // 列表页必须拒绝
    expect(isTweetDetailPage('/elonmusk/articles')).toBe(false)
    expect(isTweetDetailPage('/i/articles')).toBe(false)

    // 单篇长文章阅读页必须支持
    expect(isTweetDetailPage('/i/article/12345')).toBe(true)
    expect(isTweetDetailPage('/user/article/12345')).toBe(true)

    document.body.innerHTML = '<div data-testid="twitterArticleReadView"></div>'
    expect(isTweetDetailPage('/user/status/12345')).toBe(true)
    document.body.innerHTML = ''
  })

  it('rejects analytics, quotes, retweets, likes subpages', () => {
    expect(isTweetDetailPage('/elonmusk/status/12345/analytics')).toBe(false)
    expect(isTweetDetailPage('/elonmusk/status/12345/quotes')).toBe(false)
    expect(isTweetDetailPage('/elonmusk/status/12345/retweets')).toBe(false)
    expect(isTweetDetailPage('/elonmusk/status/12345/likes')).toBe(false)
  })

  it('rejects timeline and home feeds', () => {
    expect(isTweetDetailPage('/home')).toBe(false)
    expect(isTweetDetailPage('/explore')).toBe(false)
    expect(isTweetDetailPage('/notifications')).toBe(false)
    expect(isTweetDetailPage('/elonmusk')).toBe(false)
  })
})

describe('ReplyAssistant', () => {
  let assistant: ReplyAssistant

  beforeEach(() => {
    document.body.innerHTML = ''
    assistant = ReplyAssistant.getInstance()
    assistant.destroy()
    vi.restoreAllMocks()
  })

  it('correctly identifies main tweet and reply target element', () => {
    document.body.innerHTML = `
      <div id="stream">
        ${mockTweetCell('main', '2026-09-20T10:00:00.000Z')}
        ${mockTweetCell('', '', true)}
        ${mockTweetCell('reply1', '2026-09-21T10:00:00.000Z')}
        ${mockTweetCell('reply2', '2026-09-22T10:00:00.000Z')}
      </div>
    `

    const mainTweet = assistant.getMainTweetElement()
    expect(mainTweet).not.toBeNull()
    expect(mainTweet?.id).toBe('tweet-main')

    const replyTarget = assistant.getReplyTargetElement()
    expect(replyTarget).not.toBeNull()
    expect(replyTarget?.querySelector('[data-testid="tweetTextarea_0"]')).not.toBeNull()
  })

  it('cleans up legacy sort bar and contaminated flex styles', () => {
    document.body.innerHTML = `
      <div id="stream" style="display: flex; flex-direction: column;">
        <div class="xf-reply-sort-bar">评论排序</div>
        <div data-testid="cellInnerDiv" id="cell-1" style="order: -999999999;">
          <span class="xf-recent-reply-tag">最新</span>
        </div>
      </div>
    `

    assistant.destroy()

    expect(document.querySelector('.xf-reply-sort-bar')).toBeNull()
    expect(document.querySelector('.xf-recent-reply-tag')).toBeNull()

    const cell = document.getElementById('cell-1')!
    expect(cell.style.order).toBe('')

    const stream = document.getElementById('stream')!
    expect(stream.style.display).toBe('')
    expect(stream.style.flexDirection).toBe('')
  })

  it('never injects sort bar into timeline or tweet list', async () => {
    document.body.innerHTML = `
      <div id="stream">
        ${mockTweetCell('main', '2026-09-20T10:00:00.000Z')}
      </div>
    `

    await assistant.update()
    expect(document.querySelector('.xf-reply-sort-bar')).toBeNull()
    const stream = document.getElementById('stream')!
    expect(stream.style.display).toBe('')
  })

  it('correctly identifies main content element in article read view', () => {
    document.body.innerHTML = `
      <div id="container">
        <div data-testid="twitterArticleReadView" id="article-reader">
          <h1>长文章主标题</h1>
        </div>
        <div data-testid="cellInnerDiv">
          <div data-testid="tweetTextarea_0"></div>
        </div>
      </div>
    `

    const mainEl = assistant.getMainTweetElement()
    expect(mainEl).not.toBeNull()
    expect(mainEl?.id).toBe('article-reader')

    const replyTarget = assistant.getReplyTargetElement()
    expect(replyTarget).not.toBeNull()
    expect(replyTarget?.querySelector('[data-testid="tweetTextarea_0"]')).not.toBeNull()
  })

  it('scrolls directly across long article container in scrollToReplies', () => {
    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})

    document.body.innerHTML = `
      <div data-testid="twitterArticleReadView" id="article-reader">
        <h1>长文章</h1>
      </div>
    `
    const reader = document.getElementById('article-reader')!
    vi.spyOn(reader, 'getBoundingClientRect').mockReturnValue({
      top: 0,
      bottom: 4500,
      left: 0,
      right: 800,
      width: 800,
      height: 4500,
      x: 0,
      y: 0,
      toJSON: () => {},
    })

    assistant.scrollToReplies()

    expect(scrollToSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        top: 4460, // 4500 - 40
        behavior: 'smooth',
      })
    )
  })
})
