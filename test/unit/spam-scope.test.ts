import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  collectConversationRoots,
  invalidateSpamConfig,
  isDeckPage,
  isTweetDetailPage,
  runScan,
} from '../../content-scripts/spam/scanner'
import {
  KeySpamBlacklist,
  KeySpamDebugMode,
  KeySpamFilterEnabled,
  KeySpamKeywordList,
  KeySpamRulesEnabled,
  KeySpamThreshold,
  KeySpamWhitelist,
} from '../../storage-keys'

function mockSpamConfig({ debug = false, threshold = 40, keywords = '点击主页' } = {}) {
  ;(globalThis as any).browser.runtime.id = 'test-runtime'
  ;(globalThis as any).browser.storage.local.get = async () => ({
    [KeySpamFilterEnabled]: 'on',
    [KeySpamThreshold]: threshold,
    [KeySpamDebugMode]: debug ? 'on' : 'off',
    [KeySpamKeywordList]: keywords,
    [KeySpamRulesEnabled]:
      'marketing_nickname:off,emoji_ratio:off,short_text:off,random_username:off,marketing_keyword:on,pure_emoji:off,decorated_nickname:off,repeated_chars:off',
    [KeySpamWhitelist]: '',
    [KeySpamBlacklist]: 'spammer',
  })
}

describe('isTweetDetailPage URL matching', () => {
  it('identifies tweet detail page correctly', () => {
    expect(isTweetDetailPage('/elonmusk/status/1888888888888')).toEqual({
      isDetailPage: true,
      statusId: '1888888888888',
    })
    expect(isTweetDetailPage('/i/status/999999')).toEqual({
      isDetailPage: true,
      statusId: '999999',
    })
    expect(isTweetDetailPage('/user/status/12345/photo/1')).toEqual({
      isDetailPage: true,
      statusId: '12345',
    })
  })

  it('rejects non-detail pages like /home, /explore, profile, analytics, quotes', () => {
    expect(isTweetDetailPage('/home')).toEqual({ isDetailPage: false })
    expect(isTweetDetailPage('/explore')).toEqual({ isDetailPage: false })
    expect(isTweetDetailPage('/notifications')).toEqual({ isDetailPage: false })
    expect(isTweetDetailPage('/i/bookmarks')).toEqual({ isDetailPage: false })
    expect(isTweetDetailPage('/elonmusk')).toEqual({ isDetailPage: false })
    expect(isTweetDetailPage('/elonmusk/status/12345/analytics')).toEqual({ isDetailPage: false })
    expect(isTweetDetailPage('/elonmusk/status/12345/quotes')).toEqual({ isDetailPage: false })
    expect(isTweetDetailPage('/elonmusk/status/12345/retweets')).toEqual({ isDetailPage: false })
    expect(isTweetDetailPage('/elonmusk/status/12345/likes')).toEqual({ isDetailPage: false })
    expect(isTweetDetailPage('/i/decks/2097239772783837235')).toEqual({ isDetailPage: false })
  })
})

describe('isDeckPage URL matching', () => {
  it('identifies X Pro deck routes', () => {
    expect(isDeckPage('/i/decks/2097239772783837235')).toBe(true)
    expect(isDeckPage('/i/decks')).toBe(true)
    expect(isDeckPage('/i/decks/')).toBe(true)
  })

  it('rejects non-deck routes', () => {
    expect(isDeckPage('/home')).toBe(false)
    expect(isDeckPage('/i/bookmarks')).toBe(false)
    expect(isDeckPage('/alice/status/12345')).toBe(false)
    expect(isDeckPage('/i/decksfoo/1')).toBe(false)
  })
})

describe('spam filter page scoping', () => {
  afterEach(() => {
    window.history.pushState({}, '', '/')
    document.body.innerHTML = ''
    delete (globalThis as any).browser.runtime.id
    ;(globalThis as any).browser.storage.local.get = async () => ({})
    invalidateSpamConfig()
  })

  describe('on https://x.com/home', () => {
    beforeEach(() => {
      window.history.pushState({}, '', '/home')
      invalidateSpamConfig()
    })

    it('does NOT score timeline tweets and does NOT inject debug bars even with debug mode on', async () => {
      mockSpamConfig({ debug: true })
      document.body.innerHTML = `
        <article data-testid="tweet" id="tweet-1">
          <a href="/spammer" role="link">@spammer</a>
          <div data-testid="User-Name">Spam Guy</div>
          <div data-testid="tweetText">点击主页查看更多促销</div>
        </article>
      `

      await runScan(true)

      const tweet = document.querySelector<HTMLElement>('#tweet-1')!
      expect(tweet.querySelector('#x-focus-spam-debug-bar')).toBeNull()
      expect(tweet.hasAttribute('data-xf-spam-score')).toBe(false)
      expect(tweet.hasAttribute('data-xf-spam-processed')).toBe(false)
      expect(tweet.style.display).not.toBe('none')
    })

    it('does NOT hide marketing or blacklisted tweets on /home', async () => {
      mockSpamConfig({ debug: false, threshold: 30 })
      document.body.innerHTML = `
        <article data-testid="tweet" id="tweet-spam">
          <a href="/spammer" role="link">@spammer</a>
          <div data-testid="User-Name">Spam Guy</div>
          <div data-testid="tweetText">点击主页购买优惠商品</div>
        </article>
      `

      await runScan(true)

      const tweet = document.querySelector<HTMLElement>('#tweet-spam')!
      expect(tweet.getAttribute('data-xf-spam-state')).toBeNull()
      expect(tweet.style.display).not.toBe('none')
    })

    it('cleans up stale debug bars and hidden state when returning to /home', async () => {
      mockSpamConfig({ debug: true })
      document.body.innerHTML = `
        <article data-testid="tweet" id="tweet-stale" data-xf-spam-processed="1" data-xf-spam-state="hidden" style="display: none;">
          <a href="/bob" role="link">@bob</a>
          <div id="x-focus-spam-debug-bar">old debug bar</div>
        </article>
      `

      await runScan(true)

      const tweet = document.querySelector<HTMLElement>('#tweet-stale')!
      expect(tweet.querySelector('#x-focus-spam-debug-bar')).toBeNull()
      expect(tweet.hasAttribute('data-xf-spam-state')).toBe(false)
      expect(tweet.hasAttribute('data-xf-spam-processed')).toBe(false)
    })
  })

  describe('on tweet detail page (/username/status/12345)', () => {
    beforeEach(() => {
      window.history.pushState({}, '', '/alice/status/12345')
      invalidateSpamConfig()
    })

    it('does NOT score or show debug bar on the main tweet, only on comments', async () => {
      mockSpamConfig({ debug: true, threshold: 30 })
      document.body.innerHTML = `
        <!-- 主贴：包含 status/12345 链接，内容含营销词但绝不评分 -->
        <article data-testid="tweet" id="main-tweet">
          <a href="/alice/status/12345">Timestamp</a>
          <a href="/alice" role="link">@alice</a>
          <div data-testid="User-Name">Alice</div>
          <div data-testid="tweetText">点击主页这是主贴内容</div>
        </article>

        <!-- 评论1：正常评论，无违规 -->
        <article data-testid="tweet" id="comment-clean">
          <a href="/alice/status/99999">Timestamp</a>
          <a href="/charlie" role="link">@charlie</a>
          <div data-testid="User-Name">Charlie</div>
          <div data-testid="tweetText">非常赞同这个观点！</div>
        </article>

        <!-- 评论2：垃圾营销评论 -->
        <article data-testid="tweet" id="comment-spam">
          <a href="/alice/status/99998">Timestamp</a>
          <a href="/spammer" role="link">@spammer</a>
          <div data-testid="User-Name">Spam Guy</div>
          <div data-testid="tweetText">点击主页领取免费福利</div>
        </article>
      `

      await runScan(true)

      const mainTweet = document.querySelector<HTMLElement>('#main-tweet')!
      const commentClean = document.querySelector<HTMLElement>('#comment-clean')!
      const commentSpam = document.querySelector<HTMLElement>('#comment-spam')!

      // 主贴：未被评分、没有调试条
      expect(mainTweet.querySelector('#x-focus-spam-debug-bar')).toBeNull()
      expect(mainTweet.hasAttribute('data-xf-spam-score')).toBe(false)
      expect(mainTweet.hasAttribute('data-xf-spam-processed')).toBe(false)

      // 评论1（干净）：有调试条、有评分
      expect(commentClean.querySelector('#x-focus-spam-debug-bar')).not.toBeNull()
      expect(commentClean.getAttribute('data-xf-spam-score')).toBe('0')

      // 评论2（垃圾）：有调试条、有高评分
      expect(commentSpam.querySelector('#x-focus-spam-debug-bar')).not.toBeNull()
      expect(Number(commentSpam.getAttribute('data-xf-spam-score'))).toBeGreaterThanOrEqual(40)
    })

    it('filters spam comments in non-debug mode while preserving main tweet', async () => {
      mockSpamConfig({ debug: false, threshold: 30 })
      document.body.innerHTML = `
        <article data-testid="tweet" id="main-tweet">
          <a href="/alice/status/12345">Timestamp</a>
          <div data-testid="tweetText">点击主页这是主贴</div>
        </article>
        <article data-testid="tweet" id="comment-spam">
          <a href="/spammer" role="link">@spammer</a>
          <div data-testid="User-Name">Spam Guy</div>
          <div data-testid="tweetText">点击主页查看更多促销</div>
        </article>
      `

      await runScan(true)

      const mainTweet = document.querySelector<HTMLElement>('#main-tweet')!
      const commentSpam = document.querySelector<HTMLElement>('#comment-spam')!

      // 主贴保持可见
      expect(mainTweet.style.display).not.toBe('none')
      expect(mainTweet.getAttribute('data-xf-spam-state')).toBeNull()

      // 评论被隐藏
      expect(commentSpam.style.display).toBe('none')
      expect(commentSpam.getAttribute('data-xf-spam-state')).toBe('hidden')
    })

    it('correctly protects thread context posts prior to the main focal tweet', async () => {
      // 访问 /alice/status/22222，上面有父推文 status/11111
      window.history.pushState({}, '', '/alice/status/22222')
      mockSpamConfig({ debug: true, threshold: 30 })
      document.body.innerHTML = `
        <!-- 上文父推文：index=0 -->
        <article data-testid="tweet" id="parent-tweet">
          <a href="/someone/status/11111">Parent</a>
          <div data-testid="tweetText">点击主页父推文内容</div>
        </article>

        <!-- 当前主贴：index=1 -->
        <article data-testid="tweet" id="focal-tweet">
          <a href="/alice/status/22222">Focal</a>
          <div data-testid="tweetText">点击主页当前推文内容</div>
        </article>

        <!-- 评论：index=2 -->
        <article data-testid="tweet" id="comment-tweet">
          <a href="/charlie" role="link">@charlie</a>
          <div data-testid="tweetText">评论内容</div>
        </article>
      `

      await runScan(true)

      const parentTweet = document.querySelector<HTMLElement>('#parent-tweet')!
      const focalTweet = document.querySelector<HTMLElement>('#focal-tweet')!
      const commentTweet = document.querySelector<HTMLElement>('#comment-tweet')!

      // 父推文和主贴均不评分、不显示调试条
      expect(parentTweet.querySelector('#x-focus-spam-debug-bar')).toBeNull()
      expect(focalTweet.querySelector('#x-focus-spam-debug-bar')).toBeNull()

      // 评论显示调试条
      expect(commentTweet.querySelector('#x-focus-spam-debug-bar')).not.toBeNull()
    })
  })

  describe('on X Pro deck page (/i/decks/:id)', () => {
    beforeEach(() => {
      window.history.pushState({}, '', '/i/decks/2097239772783837235')
      invalidateSpamConfig()
    })

    function tweet({
      id,
      handle,
      href,
      text,
    }: {
      id: string
      handle: string
      href: string
      text: string
    }) {
      return `
        <article data-testid="tweet" id="${id}">
          <a href="${href}">Timestamp</a>
          <a href="/${handle}" role="link">@${handle}</a>
          <div data-testid="User-Name">${handle}</div>
          <div data-testid="tweetText">${text}</div>
        </article>
      `
    }

    it('filters spam comments inside an English conversation column and leaves Home tweets alone', async () => {
      mockSpamConfig({ debug: false, threshold: 30 })
      document.body.innerHTML = `
        <div id="home-column">
          <div aria-label="Timeline: Your Home Timeline">
            ${tweet({ id: 'home-spam', handle: 'spammer', href: '/spammer/status/1', text: '点击主页购买优惠商品' })}
          </div>
        </div>
        <div id="conversation-column">
          <div aria-label="Timeline: Conversation">
            ${tweet({ id: 'deck-main', handle: 'vista8', href: '/vista8/status/2098107889428857080', text: '应该没人比我玩的开了吧' })}
            ${tweet({ id: 'deck-spam', handle: 'spammer', href: '/spammer/status/2', text: '点击主页领取免费福利' })}
            ${tweet({ id: 'deck-clean', handle: 'charlie', href: '/charlie/status/3', text: '非常赞同这个观点！' })}
          </div>
        </div>
      `

      await runScan(true)

      expect(document.querySelector<HTMLElement>('#home-spam')!.style.display).not.toBe('none')
      expect(document.querySelector('#home-spam')!.getAttribute('data-xf-spam-state')).toBeNull()

      expect(document.querySelector<HTMLElement>('#deck-main')!.style.display).not.toBe('none')
      expect(document.querySelector('#deck-main')!.getAttribute('data-xf-spam-state')).toBeNull()

      expect(document.querySelector<HTMLElement>('#deck-spam')!.style.display).toBe('none')
      expect(document.querySelector('#deck-spam')!.getAttribute('data-xf-spam-state')).toBe('hidden')

      expect(document.querySelector<HTMLElement>('#deck-clean')!.style.display).not.toBe('none')
    })

    it('recognizes Chinese conversation timeline labels', async () => {
      mockSpamConfig({ debug: false, threshold: 30 })
      document.body.innerHTML = `
        <div aria-label="时间线：对话">
          ${tweet({ id: 'zh-main', handle: 'vista8', href: '/vista8/status/100', text: '主贴内容' })}
          ${tweet({ id: 'zh-spam', handle: 'spammer', href: '/spammer/status/101', text: '点击主页领取免费福利' })}
        </div>
      `

      await runScan(true)

      expect(document.querySelector<HTMLElement>('#zh-main')!.style.display).not.toBe('none')
      expect(document.querySelector<HTMLElement>('#zh-spam')!.style.display).toBe('none')
    })

    it('treats a column with a back button as a conversation even without aria-label', async () => {
      mockSpamConfig({ debug: false, threshold: 30 })
      document.body.innerHTML = `
        <div id="opened-tweet-column">
          <button data-testid="app-bar-back">Back</button>
          ${tweet({ id: 'back-main', handle: 'vista8', href: '/vista8/status/100', text: '主贴内容' })}
          ${tweet({ id: 'back-spam', handle: 'spammer', href: '/spammer/status/101', text: '点击主页领取免费福利' })}
        </div>
      `

      await runScan(true)

      expect(collectConversationRoots()).toHaveLength(1)
      expect(document.querySelector<HTMLElement>('#back-main')!.style.display).not.toBe('none')
      expect(document.querySelector<HTMLElement>('#back-spam')!.style.display).toBe('none')
    })

    it('does not score tweets when the deck has only timeline columns', async () => {
      mockSpamConfig({ debug: true, threshold: 30 })
      document.body.innerHTML = `
        <div aria-label="Timeline: Your Home Timeline">
          ${tweet({ id: 'timeline-spam', handle: 'spammer', href: '/spammer/status/1', text: '点击主页购买优惠商品' })}
        </div>
      `

      await runScan(true)

      const tweetEl = document.querySelector<HTMLElement>('#timeline-spam')!
      expect(tweetEl.querySelector('#x-focus-spam-debug-bar')).toBeNull()
      expect(tweetEl.hasAttribute('data-xf-spam-score')).toBe(false)
      expect(tweetEl.style.display).not.toBe('none')
    })

    it('uses the inline reply box to keep ancestor tweets unscored', async () => {
      mockSpamConfig({ debug: true, threshold: 30 })
      document.body.innerHTML = `
        <div aria-label="Timeline: Conversation">
          ${tweet({ id: 'ancestor', handle: 'someone', href: '/someone/status/111', text: '点击主页父推文内容' })}
          ${tweet({ id: 'focal', handle: 'vista8', href: '/vista8/status/222', text: '点击主页当前推文内容' })}
          <div data-testid="inline_reply_offscreen"></div>
          ${tweet({ id: 'reply-spam', handle: 'spammer', href: '/spammer/status/333', text: '点击主页领取免费福利' })}
        </div>
      `

      await runScan(true)

      expect(document.querySelector('#ancestor')!.querySelector('#x-focus-spam-debug-bar')).toBeNull()
      expect(document.querySelector('#focal')!.querySelector('#x-focus-spam-debug-bar')).toBeNull()
      expect(document.querySelector('#reply-spam')!.querySelector('#x-focus-spam-debug-bar')).not.toBeNull()
    })
  })
})
