import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KeyQuickInteraction, KeyQuickInteractionDock } from '../../storage-keys'
import {
  QuickInteractionManager,
  isTweetDetailPage,
  isEditableElement,
  getMainTweetElement,
  triggerReply,
  triggerQuote,
  triggerLike,
  triggerBookmark,
  getInteractionStatus,
} from '../../content-scripts/features/quick-interaction'

describe('quick-interaction: isTweetDetailPage', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('correctly matches status URLs and photo status URLs', () => {
    expect(isTweetDetailPage('/elonmusk/status/123456789')).toBe(true)
    expect(isTweetDetailPage('/x/status/987654321/photo/1')).toBe(true)
    expect(isTweetDetailPage('/i/status/1122334455')).toBe(true)
  })

  it('correctly matches article reading URLs or article DOM view', () => {
    expect(isTweetDetailPage('/i/article/12345')).toBe(true)
    expect(isTweetDetailPage('/user/article/67890')).toBe(true)

    document.body.innerHTML = '<div data-testid="twitterArticleReadView"></div>'
    expect(isTweetDetailPage('/custom/page')).toBe(true)
  })

  it('rejects subpages and non-detail streams', () => {
    expect(isTweetDetailPage('/elonmusk/status/123/analytics')).toBe(false)
    expect(isTweetDetailPage('/elonmusk/status/123/retweets')).toBe(false)
    expect(isTweetDetailPage('/elonmusk/status/123/likes')).toBe(false)
    expect(isTweetDetailPage('/elonmusk/status/123/quotes')).toBe(false)
    expect(isTweetDetailPage('/user/articles')).toBe(false)
    expect(isTweetDetailPage('/home')).toBe(false)
    expect(isTweetDetailPage('/explore')).toBe(false)
    expect(isTweetDetailPage('/notifications')).toBe(false)
  })

  it('accepts home or stream if tweet dialog modal is active', () => {
    expect(isTweetDetailPage('/home')).toBe(false)
    document.body.innerHTML = `
      <div role="dialog">
        <article data-testid="tweet">Modal Tweet</article>
      </div>
    `
    expect(isTweetDetailPage('/home')).toBe(true)
  })
})

describe('quick-interaction: isEditableElement', () => {
  it('identifies standard input and textarea as editable', () => {
    const input = document.createElement('input')
    const textarea = document.createElement('textarea')
    const select = document.createElement('select')
    const div = document.createElement('div')

    expect(isEditableElement(input)).toBe(true)
    expect(isEditableElement(textarea)).toBe(true)
    expect(isEditableElement(select)).toBe(true)
    expect(isEditableElement(div)).toBe(false)
    expect(isEditableElement(null)).toBe(false)
  })

  it('identifies contenteditable and role=textbox as editable', () => {
    const editableDiv = document.createElement('div')
    editableDiv.contentEditable = 'true'
    expect(isEditableElement(editableDiv)).toBe(true)

    const childSpan = document.createElement('span')
    editableDiv.appendChild(childSpan)
    expect(isEditableElement(childSpan)).toBe(true)

    const roleBox = document.createElement('div')
    roleBox.setAttribute('role', 'textbox')
    expect(isEditableElement(roleBox)).toBe(true)
  })

  it('identifies Twitter specific composers as editable', () => {
    document.body.innerHTML = `
      <div data-testid="tweetTextarea_0">
        <div class="DraftEditor-editorContainer">
          <span id="target">Typing here...</span>
        </div>
      </div>
    `
    const target = document.getElementById('target')
    expect(isEditableElement(target)).toBe(true)
  })
})

describe('quick-interaction: getMainTweetElement', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('prioritizes dialog tweet when modal is open', () => {
    document.body.innerHTML = `
      <div id="background">
        <article data-testid="tweet" id="bg-tweet">Background</article>
      </div>
      <div role="dialog">
        <article data-testid="tweet" id="modal-tweet">Modal</article>
      </div>
    `
    const main = getMainTweetElement()
    expect(main?.id).toBe('modal-tweet')
  })

  it('matches statusId from URL when on status page', () => {
    window.history.replaceState({}, '', '/user/status/999')
    document.body.innerHTML = `
      <div id="thread">
        <article data-testid="tweet" id="tweet-parent">
          <a href="/user/status/888">parent</a>
        </article>
        <article data-testid="tweet" id="tweet-target">
          <a href="/user/status/999">target</a>
        </article>
      </div>
    `
    const main = getMainTweetElement()
    expect(main?.id).toBe('tweet-target')
  })
})

describe('quick-interaction: Action triggers', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('triggerReply clicks reply button and attempts to focus composer', () => {
    document.body.innerHTML = `
      <article data-testid="tweet" id="main-tweet">
        <button data-testid="reply" id="reply-btn">Reply</button>
      </article>
      <div data-testid="tweetTextarea_0" tabindex="0"></div>
    `
    const replyBtn = document.getElementById('reply-btn') as HTMLButtonElement
    const clickSpy = vi.spyOn(replyBtn, 'click')

    const success = triggerReply()
    expect(success).toBe(true)
    expect(clickSpy).toHaveBeenCalled()
  })

  it('triggerLike clicks like or unlike button', () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <button data-testid="like" id="like-btn">Like</button>
      </article>
    `
    const likeBtn = document.getElementById('like-btn') as HTMLButtonElement
    const clickSpy = vi.spyOn(likeBtn, 'click')

    const success = triggerLike()
    expect(success).toBe(true)
    expect(clickSpy).toHaveBeenCalled()
  })

  it('triggerBookmark clicks bookmark or removeBookmark button', () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <button data-testid="bookmark" id="bm-btn">Bookmark</button>
      </article>
    `
    const bmBtn = document.getElementById('bm-btn') as HTMLButtonElement
    const clickSpy = vi.spyOn(bmBtn, 'click')

    const success = triggerBookmark()
    expect(success).toBe(true)
    expect(clickSpy).toHaveBeenCalled()
  })

  it('triggerQuote clicks retweet button and finds quote menuitem', () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <button data-testid="retweet" id="retweet-btn">Retweet</button>
      </article>
      <div data-testid="Dropdown" role="menu">
        <div role="menuitem" data-testid="retweetConfirm">Repost</div>
        <a role="menuitem" href="/compose/post" id="quote-item">Quote</a>
      </div>
    `
    const retweetBtn = document.getElementById('retweet-btn') as HTMLButtonElement
    const quoteItem = document.getElementById('quote-item') as HTMLElement
    const quoteClickSpy = vi.spyOn(quoteItem, 'click')

    const success = triggerQuote()
    expect(success).toBe(true)
  })

  it('getInteractionStatus correctly detects liked and bookmarked states', () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <button data-testid="unlike">Liked</button>
        <button data-testid="removeBookmark">Bookmarked</button>
      </article>
    `
    const status = getInteractionStatus()
    expect(status.isLiked).toBe(true)
    expect(status.isBookmarked).toBe(true)

    document.body.innerHTML = `
      <article data-testid="tweet">
        <button data-testid="like">Like</button>
        <button data-testid="bookmark">Bookmark</button>
      </article>
    `
    const status2 = getInteractionStatus()
    expect(status2.isLiked).toBe(false)
    expect(status2.isBookmarked).toBe(false)
  })
})

describe('quick-interaction: QuickInteractionManager & keyboard events', () => {
  let manager: QuickInteractionManager
  const storageGet = vi.fn<() => Promise<Record<string, unknown>>>()
  const storageSet = vi.fn<() => Promise<void>>()

  beforeEach(() => {
    document.body.innerHTML = ''
    manager = QuickInteractionManager.getInstance()
    manager.destroy()
    vi.restoreAllMocks()
    window.history.replaceState({}, '', '/user/status/123456')
    storageGet.mockReset().mockResolvedValue({})
    storageSet.mockReset().mockResolvedValue(undefined)
    vi.stubGlobal('browser', {
      runtime: { id: 'test-extension' },
      storage: { local: { get: storageGet, set: storageSet } },
    })
  })

  afterEach(() => {
    manager.destroy()
    vi.unstubAllGlobals()
  })

  it('renders dock on update when on detail page with close button', async () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <a href="/user/status/123456">status</a>
        <button data-testid="like">Like</button>
        <button data-testid="bookmark">Bookmark</button>
      </article>
    `
    await manager.update()

    const dock = document.querySelector('.xf-quick-interaction-dock')
    expect(dock).not.toBeNull()
    // 4 个操作按钮 + 1 个关闭按钮
    expect(dock?.querySelectorAll('.xf-qi-btn').length).toBe(5)
    expect(dock?.querySelector('.xf-qi-btn-close')).not.toBeNull()

    // 点击关闭按钮后，悬浮条立即移除
    const closeBtn = dock?.querySelector('.xf-qi-btn-close') as HTMLElement
    closeBtn.click()
    expect(document.querySelector('.xf-quick-interaction-dock')).toBeNull()
  })

  it('keeps keydown shortcuts working even when dock is hidden', async () => {
    // 模拟用户在设置中关闭了悬浮条，但开启了快捷键
    storageGet.mockResolvedValue({
      [KeyQuickInteraction]: 'on',
      [KeyQuickInteractionDock]: 'off',
    })

    document.body.innerHTML = `
      <article data-testid="tweet">
        <a href="/user/status/123456">status</a>
        <button data-testid="like" id="like-btn">Like</button>
      </article>
    `
    await manager.update()

    // 悬浮条不渲染，无遮挡
    expect(document.querySelector('.xf-quick-interaction-dock')).toBeNull()

    // 键盘按键 3 依然触发点赞
    const likeBtn = document.getElementById('like-btn') as HTMLElement
    const likeSpy = vi.spyOn(likeBtn, 'click')
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: '3', bubbles: true, cancelable: true }),
    )
    expect(likeSpy).toHaveBeenCalled()
  })

  it('does not reopen a disabled dock when storage becomes unavailable', async () => {
    storageGet.mockResolvedValue({ [KeyQuickInteractionDock]: 'off' })
    await manager.update()
    expect(document.querySelector('.xf-quick-interaction-dock')).toBeNull()

    storageGet.mockRejectedValue(new Error('Extension context invalidated.'))
    await manager.update()
    expect(document.querySelector('.xf-quick-interaction-dock')).toBeNull()
  })

  it('removes the dock when the extension context is invalidated', async () => {
    await manager.update()
    expect(document.querySelector('.xf-quick-interaction-dock')).not.toBeNull()
    vi.stubGlobal('browser', { ...browser, runtime: {} })
    await manager.update()
    expect(document.querySelector('.xf-quick-interaction-dock')).toBeNull()
  })

  it('ignores an older enabled read that finishes after a disabled read', async () => {
    const oldRead = Promise.withResolvers<Record<string, unknown>>()
    storageGet.mockReturnValueOnce(oldRead.promise)
    const oldUpdate = manager.update()
    storageGet.mockResolvedValue({ [KeyQuickInteractionDock]: 'off' })
    await manager.update()
    oldRead.resolve({ [KeyQuickInteractionDock]: 'on' })
    await oldUpdate
    expect(document.querySelector('.xf-quick-interaction-dock')).toBeNull()
  })

  it('keeps the dock closed during a pending save and ignores earlier reads', async () => {
    await manager.update()
    const oldRead = Promise.withResolvers<Record<string, unknown>>()
    storageGet.mockReturnValueOnce(oldRead.promise)
    const oldUpdate = manager.update()
    const save = Promise.withResolvers<void>()
    storageSet.mockReturnValueOnce(save.promise)
    document.querySelector<HTMLElement>('.xf-qi-btn-close')!.click()
    expect(browser.storage.local.set).toHaveBeenCalledWith({ [KeyQuickInteractionDock]: 'off' })

    await manager.update()
    oldRead.resolve({ [KeyQuickInteractionDock]: 'on' })
    await oldUpdate
    const dockDuringSave = document.querySelector('.xf-quick-interaction-dock')
    save.resolve()
    await save.promise
    expect(dockDuringSave).toBeNull()
  })

  it('does not recreate the dock after destroy while a read is pending', async () => {
    const read = Promise.withResolvers<Record<string, unknown>>()
    storageGet.mockReturnValueOnce(read.promise)
    const update = manager.update()
    manager.destroy()
    read.resolve({ [KeyQuickInteractionDock]: 'on' })
    await update
    expect(document.querySelector('.xf-quick-interaction-dock')).toBeNull()
  })

  it('allows the dock to be enabled again after closing and saving', async () => {
    await manager.update()
    document.querySelector<HTMLElement>('.xf-qi-btn-close')!.click()
    await vi.waitFor(() => expect(storageSet).toHaveResolved())
    storageGet.mockResolvedValue({ [KeyQuickInteractionDock]: 'off' })
    await manager.update()
    expect(document.querySelector('.xf-quick-interaction-dock')).toBeNull()
    storageGet.mockResolvedValue({ [KeyQuickInteractionDock]: 'on' })
    await manager.update()
    expect(document.querySelector('.xf-quick-interaction-dock')).not.toBeNull()
  })

  it('handles keydown 1, 2, 3, 4 properly', async () => {
    document.body.innerHTML = `
      <article data-testid="tweet">
        <a href="/user/status/123456">status</a>
        <button data-testid="reply" id="reply-btn">Reply</button>
        <button data-testid="like" id="like-btn">Like</button>
        <button data-testid="bookmark" id="bm-btn">Bookmark</button>
      </article>
    `
    await manager.update()

    const likeBtn = document.getElementById('like-btn') as HTMLElement
    const likeSpy = vi.spyOn(likeBtn, 'click')

    // Press '3' to like
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: '3', bubbles: true, cancelable: true }),
    )
    expect(likeSpy).toHaveBeenCalled()

    // Press 'Cmd+3' should be ignored (tab switching)
    likeSpy.mockClear()
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: '3', metaKey: true, bubbles: true, cancelable: true }),
    )
    expect(likeSpy).not.toHaveBeenCalled()
  })

  it('ignores keydown when focused inside an input', async () => {
    document.body.innerHTML = `
      <input type="text" id="my-input" />
      <article data-testid="tweet">
        <a href="/user/status/123456">status</a>
        <button data-testid="like" id="like-btn">Like</button>
      </article>
    `
    await manager.update()

    const input = document.getElementById('my-input') as HTMLInputElement
    input.focus()

    const likeBtn = document.getElementById('like-btn') as HTMLElement
    const likeSpy = vi.spyOn(likeBtn, 'click')

    // Press '3' while focused on input
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: '3', bubbles: true, cancelable: true }),
    )
    expect(likeSpy).not.toHaveBeenCalled()
  })
})
