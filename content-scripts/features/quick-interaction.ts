import { KeyQuickInteraction, KeyQuickInteractionDock } from '../../storage-keys'
import { getStorage, setStorage } from '../utilities/storage'
import addStyles from '../utilities/addStyles'

const QUICK_INTERACTION_STYLES = `
/* 快捷互动悬浮胶囊入口 */
.xf-quick-interaction-dock {
  position: fixed !important;
  bottom: 24px !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  z-index: 99990 !important;
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 5px 8px !important;
  border-radius: 9999px !important;
  border: 1px solid rgba(128, 128, 128, 0.25) !important;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.08) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  background: rgba(255, 255, 255, 0.88) !important;
  color: #0f1419 !important;
  user-select: none !important;
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
}

.xf-quick-interaction-dock:hover {
  box-shadow: 0 10px 36px rgba(0, 0, 0, 0.2), 0 3px 8px rgba(0, 0, 0, 0.1) !important;
}

.xf-qi-divider {
  width: 1px !important;
  height: 16px !important;
  background-color: rgba(128, 128, 128, 0.25) !important;
  margin: 0 1px !important;
}

.xf-qi-btn {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 6px 10px !important;
  border-radius: 9999px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  cursor: pointer !important;
  background: transparent !important;
  color: inherit !important;
  border: none !important;
  outline: none !important;
  transition: background-color 0.15s ease, transform 0.12s cubic-bezier(0.2, 0, 0, 1), color 0.15s ease !important;
}

.xf-qi-btn:hover {
  background-color: rgba(128, 128, 128, 0.12) !important;
}

/* 各按钮颜色照搬 X 操作按钮：回复、收藏是固定蓝（blue500），不随强调色变 */
.xf-qi-btn.xf-qi-btn-reply:hover {
  background-color: rgba(29, 155, 240, 0.12) !important;
  color: #1d9bf0 !important;
}

.xf-qi-btn.xf-qi-btn-quote:hover {
  background-color: rgba(0, 186, 124, 0.12) !important;
  color: #00ba7c !important;
}

.xf-qi-btn.xf-qi-btn-like:hover {
  background-color: rgba(249, 24, 128, 0.12) !important;
  color: #f91880 !important;
}

.xf-qi-btn.xf-qi-btn-bookmark:hover {
  background-color: rgba(29, 155, 240, 0.12) !important;
  color: #1d9bf0 !important;
}

.xf-qi-btn.xf-qi-btn-close {
  padding: 6px !important;
  border-radius: 9999px !important;
  color: rgba(128, 128, 128, 0.75) !important;
  opacity: 0.8 !important;
  transition: opacity 0.15s ease, background-color 0.15s ease, color 0.15s ease !important;
}

.xf-qi-btn.xf-qi-btn-close:hover {
  opacity: 1 !important;
  color: inherit !important;
  background-color: rgba(128, 128, 128, 0.18) !important;
}

.xf-qi-btn:active,
.xf-qi-btn.xf-qi-active-press {
  transform: scale(0.92) !important;
}

/* 按键角标 */
.xf-qi-kbd {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  min-width: 17px !important;
  height: 17px !important;
  padding: 0 4px !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  line-height: 1 !important;
  border-radius: 4px !important;
  background: rgba(128, 128, 128, 0.18) !important;
  color: inherit !important;
  border: 1px solid rgba(128, 128, 128, 0.28) !important;
}

/* 图标与文本 */
.xf-qi-btn svg {
  width: 16px !important;
  height: 16px !important;
  flex-shrink: 0 !important;
  transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
}

.xf-qi-btn:hover svg {
  transform: scale(1.1) !important;
}

.xf-qi-label {
  font-size: 12.5px !important;
  letter-spacing: 0.2px !important;
}

/* 已点赞激活态 */
.xf-qi-btn.xf-liked {
  color: #f91880 !important;
}
.xf-qi-btn.xf-liked svg {
  fill: #f91880 !important;
}
.xf-qi-btn.xf-liked .xf-qi-kbd {
  border-color: rgba(249, 24, 128, 0.4) !important;
  background: rgba(249, 24, 128, 0.14) !important;
  color: #f91880 !important;
}

/* 已收藏激活态 */
.xf-qi-btn.xf-bookmarked {
  color: #1d9bf0 !important;
}
.xf-qi-btn.xf-bookmarked svg {
  fill: #1d9bf0 !important;
}
.xf-qi-btn.xf-bookmarked .xf-qi-kbd {
  border-color: rgba(29, 155, 240, 0.4) !important;
  background: rgba(29, 155, 240, 0.14) !important;
  color: #1d9bf0 !important;
}

/* 深色模式适配 */
@media (prefers-color-scheme: dark) {
  .xf-quick-interaction-dock {
    background: rgba(21, 32, 43, 0.9) !important;
    color: #f7f9f9 !important;
    border-color: rgba(255, 255, 255, 0.16) !important;
    box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45) !important;
  }
  .xf-qi-kbd {
    background: rgba(255, 255, 255, 0.12) !important;
    border-color: rgba(255, 255, 255, 0.22) !important;
  }
}

body[style*="background-color: rgb(0, 0, 0)"] .xf-quick-interaction-dock {
  background: rgba(0, 0, 0, 0.88) !important;
  color: #e7e9ea !important;
  border-color: rgba(255, 255, 255, 0.2) !important;
}
body[style*="background-color: rgb(0, 0, 0)"] .xf-qi-kbd {
  background: rgba(255, 255, 255, 0.12) !important;
  border-color: rgba(255, 255, 255, 0.2) !important;
}

body[style*="background-color: rgb(21, 32, 43)"] .xf-quick-interaction-dock {
  background: rgba(21, 32, 43, 0.92) !important;
  color: #f7f9f9 !important;
  border-color: rgba(255, 255, 255, 0.16) !important;
}
body[style*="background-color: rgb(21, 32, 43)"] .xf-qi-kbd {
  background: rgba(255, 255, 255, 0.12) !important;
  border-color: rgba(255, 255, 255, 0.2) !important;
}
`

/**
 * 判断当前是否处于可以快捷互动的单篇推文详情页或弹窗
 */
export function isTweetDetailPage(pathname: string = window.location.pathname): boolean {
  // 排除推文分析、引用列表、转推列表和喜欢列表等附属页
  if (/\/(analytics|retweets|likes|quotes)$/.test(pathname)) {
    return false
  }

  // 排除个人主页或文章列表页
  if (pathname.endsWith('/articles')) {
    return false
  }

  // 排除信息流主页、探索、通知、书签等纯列表页（除非页面内有活动弹窗）
  if (/^\/(home|explore|notifications|i\/bookmarks|i\/lists)(\/|$)/.test(pathname)) {
    return Boolean(document.querySelector('div[role="dialog"] article[data-testid="tweet"]'))
  }

  // 支持标准单篇推文详情页 (/username/status/123456 或附带相册 /photo/1)
  if (pathname.match(/\/status\/\d+/)) {
    return true
  }

  // 支持单篇长文章阅读页 (/i/article/123456 或 /username/article/123456)
  if (
    pathname.match(/\/(?:i\/)?article\/\d+/) ||
    Boolean(document.querySelector('[data-testid="twitterArticleReadView"], [data-testid="twitterArticleRichTextView"]'))
  ) {
    return true
  }

  // 弹窗对话框内展示了推文
  if (document.querySelector('div[role="dialog"] article[data-testid="tweet"]')) {
    return true
  }

  return false
}

/**
 * 判断当前节点是否属于输入型节点（输入框、富文本编辑器、搜索栏等），避免快捷键误触打字
 */
export function isEditableElement(el: EventTarget | Element | null): boolean {
  if (!el || !(el instanceof Element)) return false

  const tagName = el.tagName?.toLowerCase()
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true
  }

  // 向上检查当前节点及所有祖先是否声明了 contenteditable 或具备 isContentEditable
  let curr: Element | null = el
  while (curr) {
    if (
      Boolean((curr as HTMLElement).isContentEditable) ||
      (curr as HTMLElement).contentEditable === 'true' ||
      curr.getAttribute('contenteditable') === 'true' ||
      curr.getAttribute('contenteditable') === ''
    ) {
      return true
    }
    curr = curr.parentElement
  }

  if (
    el.closest(
      '[role="textbox"], [data-testid*="tweetTextarea"], [data-testid="SearchBox_Search_Input"], [data-testid="composer"]',
    )
  ) {
    return true
  }

  return false
}

/**
 * 获取当前页面所打开的主推文节点
 */
export function getMainTweetElement(): HTMLElement | null {
  // 1. 若处于弹窗中，优先使用弹窗中的推文
  const dialogTweet = document.querySelector<HTMLElement>('div[role="dialog"] article[data-testid="tweet"]')
  if (dialogTweet) {
    return dialogTweet
  }

  // 2. 长文章阅读视图
  const articleView = document.querySelector<HTMLElement>(
    '[data-testid="twitterArticleReadView"], [data-testid="twitterArticleRichTextView"]',
  )
  if (articleView) {
    return articleView
  }

  // 3. 单推详情页，按 URL statusId 准确定位主贴
  const match = window.location.pathname.match(/\/status\/(\d+)/)
  const statusId = match?.[1]
  const articles = Array.from(document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'))
  if (statusId && articles.length > 0) {
    const matched = articles.find((art) => art.querySelector(`a[href*="/status/${statusId}"]`))
    if (matched) {
      return matched
    }
  }

  // 4. 兜底返回第一条推文
  return articles[0] || null
}

/**
 * 触发动作 1：评论 (Reply)
 */
export function triggerReply(): boolean {
  const mainTweet = getMainTweetElement()
  if (!mainTweet) return false

  const replyBtn = mainTweet.querySelector<HTMLElement>(
    'button[data-testid="reply"], [data-testid="reply"]',
  )
  if (replyBtn) {
    replyBtn.click()
  }

  // 顺畅滚动并聚焦到回复输入框
  setTimeout(() => {
    const composer = document.querySelector<HTMLElement>(
      '[data-testid="tweetTextarea_0"], [data-testid="inlineReplyComposer"] [role="textbox"], div[role="dialog"] [role="textbox"]',
    )
    if (composer) {
      composer.scrollIntoView({ behavior: 'smooth', block: 'center' })
      composer.focus()
    }
  }, 60)

  return true
}

/**
 * 触发动作 2：引用 (Quote)
 */
export function triggerQuote(): boolean {
  const mainTweet = getMainTweetElement()
  if (!mainTweet) return false

  const retweetBtn = mainTweet.querySelector<HTMLElement>(
    'button[data-testid="retweet"], button[data-testid="unretweet"], [data-testid="retweet"], [data-testid="unretweet"]',
  )
  if (!retweetBtn) return false

  // 如果菜单未展开，先点击转推按钮展开菜单
  const existingMenu = document.querySelector('[data-testid="Dropdown"], [role="menu"]')
  if (!existingMenu) {
    retweetBtn.click()
  }

  // 捕获并点击「引用 (Quote)」菜单项
  const startTime = Date.now()
  const findQuoteItem = () => {
    const menu = document.querySelector('[data-testid="Dropdown"], [role="menu"]')
    if (menu) {
      const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'))
      const quoteItem =
        items.find((item) => {
          const href = item.getAttribute('href') || item.querySelector('a')?.getAttribute('href') || ''
          if (href.includes('/compose/post') || href.includes('/compose/tweet')) return true
          const text = (item.textContent || '').trim()
          return /quote|引用/i.test(text)
        }) || (items.length >= 2 ? items[1] : null)

      if (quoteItem) {
        quoteItem.click()
        return
      }
    }

    if (Date.now() - startTime < 600) {
      requestAnimationFrame(findQuoteItem)
    }
  }

  requestAnimationFrame(findQuoteItem)
  return true
}

/**
 * 触发动作 3：点赞 (Like)
 */
export function triggerLike(): boolean {
  const mainTweet = getMainTweetElement()
  if (!mainTweet) return false

  const likeBtn = mainTweet.querySelector<HTMLElement>(
    'button[data-testid="like"], button[data-testid="unlike"], [data-testid="like"], [data-testid="unlike"]',
  )
  if (likeBtn) {
    likeBtn.click()
    return true
  }
  return false
}

/**
 * 触发动作 4：收藏 (Bookmark)
 */
export function triggerBookmark(): boolean {
  const mainTweet = getMainTweetElement()
  if (!mainTweet) return false

  const bookmarkBtn = mainTweet.querySelector<HTMLElement>(
    'button[data-testid="bookmark"], button[data-testid="removeBookmark"], [data-testid="bookmark"], [data-testid="removeBookmark"]',
  )
  if (bookmarkBtn) {
    bookmarkBtn.click()
    return true
  }

  // 兜底：若窄屏下收藏被折叠进分享菜单
  const shareBtn = mainTweet.querySelector<HTMLElement>(
    'button[data-testid="share"], [data-testid="share"]',
  )
  if (shareBtn) {
    shareBtn.click()
    const startTime = Date.now()
    const findBookmarkMenuItem = () => {
      const menu = document.querySelector('[data-testid="Dropdown"], [role="menu"]')
      if (menu) {
        const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'))
        const item = items.find((el) => {
          const text = (el.textContent || '').trim()
          return /bookmark|收藏|书签/i.test(text)
        })
        if (item) {
          item.click()
          return
        }
      }
      if (Date.now() - startTime < 600) {
        requestAnimationFrame(findBookmarkMenuItem)
      }
    }
    requestAnimationFrame(findBookmarkMenuItem)
    return true
  }

  return false
}

/**
 * 查询主贴当前点赞与收藏状态
 */
export function getInteractionStatus(): { isLiked: boolean; isBookmarked: boolean } {
  const mainTweet = getMainTweetElement()
  if (!mainTweet) return { isLiked: false, isBookmarked: false }

  const isLiked = Boolean(
    mainTweet.querySelector('[data-testid="unlike"]') ||
      mainTweet.querySelector('[data-testid="like"][aria-label*="Unlike"]') ||
      mainTweet.querySelector('[data-testid="like"][aria-label*="取消喜欢"]'),
  )

  const isBookmarked = Boolean(
    mainTweet.querySelector('[data-testid="removeBookmark"]') ||
      mainTweet.querySelector('[data-testid="bookmark"][aria-label*="Remove"]') ||
      mainTweet.querySelector('[data-testid="bookmark"][aria-label*="取消书签"]'),
  )

  return { isLiked, isBookmarked }
}

const SVG_ICONS = {
  reply: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"></path></svg>`,
  quote: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 3.88C3.67 3.88 3 4.55 3 5.38V8c0 .83.67 1.5 1.5 1.5h2.25c-.21 1.72-1.28 3.18-2.81 3.86-.41.18-.65.62-.57 1.06.07.44.44.76.89.76.08 0 .17-.01.25-.04 2.45-1.09 4.14-3.55 4.24-6.38V5.38c0-.83-.67-1.5-1.5-1.5H4.5zm9 0c-.83 0-1.5.67-1.5 1.5V8c0 .83.67 1.5 1.5 1.5h2.25c-.21 1.72-1.28 3.18-2.81 3.86-.41.18-.65.62-.57 1.06.07.44.44.76.89.76.08 0 .17-.01.25-.04 2.45-1.09 4.14-3.55 4.24-6.38V5.38c0-.83-.67-1.5-1.5-1.5h-2.25z"></path></svg>`,
  likeOutline: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-2.415.11-4.3 2.11-4.3 4.6 0 3.39 3.01 6.51 8.196 10.74l.8.65.802-.65C17.989 16.61 21 13.49 21 10.1c0-2.49-1.886-4.49-4.303-4.6zm-4.704 13.02c-4.81-3.98-7.493-6.8-7.493-9.52 0-1.63 1.18-3.08 2.825-3.15 1.022-.05 2.04.47 2.675 1.34l1.993 2.7 1.993-2.7c.635-.87 1.653-1.39 2.675-1.34 1.645.07 2.825 1.52 2.825 3.15 0 2.72-2.683 5.54-7.493 9.52z"></path></svg>`,
  likeFilled: `<svg viewBox="0 0 24 24" fill="#f91880"><path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 8.67l-.505.41-.505-.41C7.117 18.31 4.467 15.67 3.116 13.19 1.765 10.71 1.004 8.26 1.004 5.86c0-2.84 2.164-5.16 5.006-5.46 1.996-.21 3.992.68 5.143 2.34 1.15-1.66 3.146-2.55 5.142-2.34 2.842.3 5.006 2.62 5.006 5.46 0 2.4-.761 4.85-2.112 7.33z"></path></svg>`,
  bookmarkOutline: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"></path></svg>`,
  bookmarkFilled: `<svg viewBox="0 0 24 24" fill="#1d9bf0"><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5z"></path></svg>`,
}

export class QuickInteractionManager {
  private static instance: QuickInteractionManager | null = null
  private stylesInjected = false
  private dockElement: HTMLElement | null = null
  private keydownListenerAttached = false
  private isShortcutsEnabled = true
  private isDockEnabled = true

  private constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this)
  }

  public static getInstance(): QuickInteractionManager {
    if (!QuickInteractionManager.instance) {
      QuickInteractionManager.instance = new QuickInteractionManager()
    }
    return QuickInteractionManager.instance
  }

  private ensureStyles() {
    if (!this.stylesInjected) {
      addStyles('quick-interaction', QUICK_INTERACTION_STYLES)
      this.stylesInjected = true
    }
  }

  /**
   * 绑定全局按键监听器（仅一次）
   */
  private attachKeydownListener() {
    if (this.keydownListenerAttached) return
    this.keydownListenerAttached = true
    window.addEventListener('keydown', this.handleKeyDown, true)
  }

  private detachKeydownListener() {
    if (!this.keydownListenerAttached) return
    window.removeEventListener('keydown', this.handleKeyDown, true)
    this.keydownListenerAttached = false
  }

  /**
   * 键盘事件处理
   */
  private handleKeyDown(e: KeyboardEvent) {
    if (!this.isShortcutsEnabled) return

    // 仅响应数字键 1, 2, 3, 4
    if (!['1', '2', '3', '4'].includes(e.key)) return

    // 忽略所有组合键（Cmd+1/Ctrl+1 切换标签页、Alt、Shift 符号等）
    if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return

    // 忽略长按连击
    if (e.repeat) return

    // 忽略输入法组合中（拼音等）
    if (e.isComposing || e.keyCode === 229) return

    // 防误触：如果焦点在任何输入框或富文本编辑器内，坚决不拦截
    const activeEl = document.activeElement
    if (isEditableElement(activeEl)) return

    const targetEl = e.target as Element | null
    if (isEditableElement(targetEl)) return

    // 仅在打开推文详情页或弹窗时生效
    if (!isTweetDetailPage()) return

    e.preventDefault()
    e.stopPropagation()

    switch (e.key) {
      case '1':
        this.animateButtonPress('reply')
        triggerReply()
        break
      case '2':
        this.animateButtonPress('quote')
        triggerQuote()
        break
      case '3':
        this.animateButtonPress('like')
        triggerLike()
        setTimeout(() => this.updateDockStates(), 200)
        break
      case '4':
        this.animateButtonPress('bookmark')
        triggerBookmark()
        setTimeout(() => this.updateDockStates(), 200)
        break
    }
  }

  /**
   * 按键动效微反馈
   */
  private animateButtonPress(type: 'reply' | 'quote' | 'like' | 'bookmark') {
    if (!this.dockElement) return
    const btn = this.dockElement.querySelector(`.xf-qi-btn-${type}`)
    if (btn) {
      btn.classList.add('xf-qi-active-press')
      setTimeout(() => {
        btn.classList.remove('xf-qi-active-press')
      }, 160)
    }
  }

  /**
   * 创建或刷新悬浮工具条
   */
  private renderDock() {
    this.ensureStyles()

    if (!this.dockElement) {
      const dock = document.createElement('div')
      dock.className = 'xf-quick-interaction-dock'
      dock.setAttribute('role', 'toolbar')
      dock.setAttribute('aria-label', '快捷互动入口')

      dock.innerHTML = `
        <button type="button" class="xf-qi-btn xf-qi-btn-reply" title="按 1 评论">
          <span class="xf-qi-kbd">1</span>
          ${SVG_ICONS.reply}
          <span class="xf-qi-label">评论</span>
        </button>
        <button type="button" class="xf-qi-btn xf-qi-btn-quote" title="按 2 引用">
          <span class="xf-qi-kbd">2</span>
          ${SVG_ICONS.quote}
          <span class="xf-qi-label">引用</span>
        </button>
        <button type="button" class="xf-qi-btn xf-qi-btn-like" title="按 3 点赞">
          <span class="xf-qi-kbd">3</span>
          <span class="xf-qi-icon-like">${SVG_ICONS.likeOutline}</span>
          <span class="xf-qi-label xf-qi-label-like">点赞</span>
        </button>
        <button type="button" class="xf-qi-btn xf-qi-btn-bookmark" title="按 4 收藏">
          <span class="xf-qi-kbd">4</span>
          <span class="xf-qi-icon-bookmark">${SVG_ICONS.bookmarkOutline}</span>
          <span class="xf-qi-label xf-qi-label-bookmark">收藏</span>
        </button>
        <div class="xf-qi-divider"></div>
        <button type="button" class="xf-qi-btn xf-qi-btn-close" title="关闭悬浮条（按键 1-4 仍可使用）" aria-label="关闭悬浮条">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
            <path d="M18.3 5.71a.996.996 0 0 0-1.41 0L12 10.59 7.11 5.7A.996.996 0 1 0 5.7 7.11L10.59 12 5.7 16.89a.996.996 0 1 0 1.41 1.41L12 13.41l4.89 4.89a.996.996 0 1 0 1.41-1.41L13.41 12l4.89-4.89c.38-.38.38-1.02 0-1.4z"/>
          </svg>
        </button>
      `

      // 绑定点击事件
      dock.querySelector('.xf-qi-btn-reply')?.addEventListener('click', (e) => {
        e.stopPropagation()
        this.animateButtonPress('reply')
        triggerReply()
      })

      dock.querySelector('.xf-qi-btn-quote')?.addEventListener('click', (e) => {
        e.stopPropagation()
        this.animateButtonPress('quote')
        triggerQuote()
      })

      dock.querySelector('.xf-qi-btn-like')?.addEventListener('click', (e) => {
        e.stopPropagation()
        this.animateButtonPress('like')
        triggerLike()
        setTimeout(() => this.updateDockStates(), 200)
      })

      dock.querySelector('.xf-qi-btn-bookmark')?.addEventListener('click', (e) => {
        e.stopPropagation()
        this.animateButtonPress('bookmark')
        triggerBookmark()
        setTimeout(() => this.updateDockStates(), 200)
      })

      dock.querySelector('.xf-qi-btn-close')?.addEventListener('click', async (e) => {
        e.stopPropagation()
        this.removeDock()
        await setStorage({ [KeyQuickInteractionDock]: 'off' })
      })

      document.body.appendChild(dock)
      this.dockElement = dock
    }

    this.updateDockStates()
  }

  /**
   * 同步更新点赞与收藏激活状态
   */
  public updateDockStates() {
    if (!this.dockElement) return

    const { isLiked, isBookmarked } = getInteractionStatus()

    const likeBtn = this.dockElement.querySelector('.xf-qi-btn-like')
    const likeIconEl = this.dockElement.querySelector('.xf-qi-icon-like')
    const likeLabelEl = this.dockElement.querySelector('.xf-qi-label-like')

    if (likeBtn && likeIconEl && likeLabelEl) {
      if (isLiked) {
        likeBtn.classList.add('xf-liked')
        likeIconEl.innerHTML = SVG_ICONS.likeFilled
        likeLabelEl.textContent = '已赞'
      } else {
        likeBtn.classList.remove('xf-liked')
        likeIconEl.innerHTML = SVG_ICONS.likeOutline
        likeLabelEl.textContent = '点赞'
      }
    }

    const bookmarkBtn = this.dockElement.querySelector('.xf-qi-btn-bookmark')
    const bookmarkIconEl = this.dockElement.querySelector('.xf-qi-icon-bookmark')
    const bookmarkLabelEl = this.dockElement.querySelector('.xf-qi-label-bookmark')

    if (bookmarkBtn && bookmarkIconEl && bookmarkLabelEl) {
      if (isBookmarked) {
        bookmarkBtn.classList.add('xf-bookmarked')
        bookmarkIconEl.innerHTML = SVG_ICONS.bookmarkFilled
        bookmarkLabelEl.textContent = '已收藏'
      } else {
        bookmarkBtn.classList.remove('xf-bookmarked')
        bookmarkIconEl.innerHTML = SVG_ICONS.bookmarkOutline
        bookmarkLabelEl.textContent = '收藏'
      }
    }
  }

  private removeDock() {
    if (this.dockElement) {
      this.dockElement.remove()
      this.dockElement = null
    }
  }

  /**
   * 主更新循环（由 dynamic observer 驱动）
   */
  public async update() {
    const data = await getStorage([KeyQuickInteraction, KeyQuickInteractionDock])
    this.isShortcutsEnabled = data?.[KeyQuickInteraction] !== 'off'
    this.isDockEnabled = data?.[KeyQuickInteractionDock] !== 'off'

    if (!this.isShortcutsEnabled || !isTweetDetailPage()) {
      this.removeDock()
      this.detachKeydownListener()
      return
    }

    // 挂载按键监听器
    this.attachKeydownListener()

    // 仅在悬浮条开启时挂载，否则收起悬浮条避免遮挡
    if (this.isDockEnabled) {
      this.renderDock()
    } else {
      this.removeDock()
    }
  }

  public destroy() {
    this.removeDock()
    this.detachKeydownListener()
  }
}

export function updateQuickInteraction() {
  QuickInteractionManager.getInstance().update()
}

export function destroyQuickInteraction() {
  QuickInteractionManager.getInstance().destroy()
}
