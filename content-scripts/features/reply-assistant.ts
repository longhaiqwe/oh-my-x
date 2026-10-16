import { KeyJumpToReplies } from '../../storage-keys'
import { getStorage } from '../utilities/storage'
import addStyles from '../utilities/addStyles'
import debounce from '../utilities/debounce'

const REPLY_ASSISTANT_STYLES = `
/* 浮动直达回复按钮 */
.xf-jump-replies-btn {
  position: fixed !important;
  right: 24px !important;
  bottom: 84px !important;
  z-index: 99998 !important;
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 8px 14px !important;
  border-radius: 9999px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
  cursor: pointer !important;
  border: 1px solid rgba(128, 128, 128, 0.25) !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12) !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  background: rgba(255, 255, 255, 0.9) !important;
  color: #0f1419 !important;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, background 0.2s ease !important;
  user-select: none !important;
}

.xf-jump-replies-btn:hover {
  transform: translateY(-2px) scale(1.03) !important;
  box-shadow: 0 6px 20px rgba(29, 155, 240, 0.28) !important;
  border-color: rgba(29, 155, 240, 0.5) !important;
}

.xf-jump-replies-btn svg {
  width: 16px !important;
  height: 16px !important;
  flex-shrink: 0 !important;
  transition: transform 0.2s ease !important;
}

@media (prefers-color-scheme: dark) {
  .xf-jump-replies-btn {
    background: rgba(21, 32, 43, 0.88) !important;
    color: #f7f9f9 !important;
    border-color: rgba(255, 255, 255, 0.16) !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4) !important;
  }
}
body[style*="background-color: rgb(0, 0, 0)"] .xf-jump-replies-btn {
  background: rgba(0, 0, 0, 0.88) !important;
  color: #e7e9ea !important;
  border-color: rgba(255, 255, 255, 0.2) !important;
}
body[style*="background-color: rgb(21, 32, 43)"] .xf-jump-replies-btn {
  background: rgba(21, 32, 43, 0.92) !important;
  color: #f7f9f9 !important;
  border-color: rgba(255, 255, 255, 0.16) !important;
}
`

/**
 * 判断当前是否处于可以查看长推文/长文章及回复的单篇详情页
 */
export function isTweetDetailPage(pathname: string = window.location.pathname): boolean {
  // 严格排除推文分析、引用列表、转推列表和喜欢列表等附属页
  if (/\/(analytics|retweets|likes|quotes)$/.test(pathname)) {
    return false
  }

  // 严格排除个人主页或栏目的文章列表页 (如 /username/articles)
  if (pathname.endsWith('/articles')) {
    return false
  }

  // 严格排除信息流主页、探索、通知、书签等纯列表页
  if (/^\/(home|explore|notifications|i\/bookmarks|i\/lists)(\/|$)/.test(pathname)) {
    return false
  }

  // 支持标准单篇推文详情页 (/username/status/123456 或附带相册 /photo/1)
  if (pathname.match(/\/status\/\d+/)) {
    return true
  }

  // 支持单篇长文章阅读页 (/i/article/123456 或 /username/article/123456 或页面中已挂载文章阅读器)
  if (
    pathname.match(/\/(?:i\/)?article\/\d+/) ||
    Boolean(document.querySelector('[data-testid="twitterArticleReadView"], [data-testid="twitterArticleRichTextView"]'))
  ) {
    return true
  }

  return false
}

export class ReplyAssistant {
  private static instance: ReplyAssistant | null = null
  private stylesInjected = false
  private jumpButton: HTMLElement | null = null
  private isAtReplies = false
  private scrollListenerAttached = false
  private debouncedUpdate: () => void

  private constructor() {
    this.debouncedUpdate = debounce(() => {
      void this.update()
    }, 150)
  }

  public static getInstance(): ReplyAssistant {
    if (!ReplyAssistant.instance) {
      ReplyAssistant.instance = new ReplyAssistant()
    }
    return ReplyAssistant.instance
  }

  private ensureStyles() {
    if (!this.stylesInjected) {
      addStyles('reply-assistant', REPLY_ASSISTANT_STYLES)
      this.stylesInjected = true
    }
  }

  /**
   * 判断当前是否处于标准推文/文章详情页面
   */
  public isTweetDetailPage(pathname: string = window.location.pathname): boolean {
    return isTweetDetailPage(pathname)
  }

  /**
   * 获取详情页中的主内容元素（支持普通推文主贴与长文章阅读视图）
   */
  public getMainTweetElement(): HTMLElement | null {
    // 优先：长文章阅读视图
    const articleView = document.querySelector<HTMLElement>(
      '[data-testid="twitterArticleReadView"], [data-testid="twitterArticleRichTextView"]'
    )
    if (articleView) {
      return articleView
    }

    // 次优：普通推文主贴
    const articles = Array.from(document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'))
    return articles[0] || null
  }

  /**
   * 获取回复区域/回复输入框目标元素
   */
  public getReplyTargetElement(): HTMLElement | null {
    // 优先：主内容下方真正的回复输入框（严格排除侧边栏发帖按钮 [data-testid="composer"]）
    const composer = document.querySelector<HTMLElement>(
      '[data-testid="tweetTextarea_0"], [data-testid="inlineReplyComposer"]'
    )
    if (composer) {
      return composer.closest('[data-testid="cellInnerDiv"]') || composer
    }

    // 次优：对话时间线内的首条回复
    const conversationTimeline = document.querySelector<HTMLElement>(
      '[aria-label*="对话"], [aria-label*="Conversation"], [aria-label*="会話"]'
    )
    if (conversationTimeline) {
      const firstReply = conversationTimeline.querySelector<HTMLElement>('article[data-testid="tweet"]')
      if (firstReply) {
        return firstReply.closest('[data-testid="cellInnerDiv"]') || firstReply
      }
    }

    return null
  }

  /**
   * 平滑滚动到回复区
   */
  public scrollToReplies() {
    // 1. 如果当前页面属于长文章阅读页，长文章可能长达数千像素，底部评论在视口外尚未渲染进 DOM
    const articleView = document.querySelector<HTMLElement>(
      '[data-testid="twitterArticleReadView"], [data-testid="twitterArticleRichTextView"]'
    )
    if (articleView) {
      const rect = articleView.getBoundingClientRect()
      // 计算长文章底部的绝对文档坐标
      const targetTop = window.scrollY + rect.bottom - 40
      window.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth',
      })

      // 视口到达文章末尾后，虚拟列表会立即挂载评论与输入框，做一次平滑微调对齐
      setTimeout(() => {
        const composer = document.querySelector<HTMLElement>(
          '[data-testid="tweetTextarea_0"], [data-testid="inlineReplyComposer"]'
        )
        if (composer) {
          composer.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }, 400)
      return
    }

    // 2. 普通单推详情页：若已经存在明确的回复输入框或对话时间线
    const target = this.getReplyTargetElement()
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }

    // 3. 兜底：若未找到具体回复节点，根据主推文卡片的绝对底部进行精准滚动
    const mainEl = this.getMainTweetElement()
    if (mainEl) {
      const rect = mainEl.getBoundingClientRect()
      const targetTop = window.scrollY + rect.bottom - 40
      window.scrollTo({
        top: Math.max(0, targetTop),
        behavior: 'smooth',
      })
    }
  }

  /**
   * 平滑滚动回正文顶部
   */
  public scrollToMainTweet() {
    // 优先：长文章大标题
    const articleTitle = document.querySelector<HTMLElement>(
      '[data-testid="twitter-article-title"], [data-testid="twitterArticleReadView"] h1'
    )
    if (articleTitle) {
      articleTitle.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    const mainEl = this.getMainTweetElement()
    if (mainEl) {
      mainEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  /**
   * 主更新循环（由 dynamicFeatures / observer 驱动）
   */
  public async update() {
    // 优先执行遗留 DOM 污染清理，保证非详情页恢复原生排版
    this.cleanupCorruptedDOM()

    if (!this.isTweetDetailPage()) {
      this.destroy()
      return
    }

    const jumpEnabledStored = await getStorage(KeyJumpToReplies)
    const jumpEnabled = jumpEnabledStored !== 'off'

    if (!jumpEnabled) {
      this.destroy()
      return
    }

    this.ensureStyles()
    this.updateJumpButton()
  }

  /**
   * 清除之前任何可能残留的排序控制条及被污染的 Flexbox 样式
   */
  private cleanupCorruptedDOM() {
    document.querySelectorAll('.xf-reply-sort-bar').forEach((el) => el.remove())
    document.querySelectorAll('.xf-recent-reply-tag').forEach((el) => el.remove())

    // 还原任何被设置了 order 的 cellInnerDiv 以及被改动为 flex 的容器
    const corruptedCells = document.querySelectorAll<HTMLElement>('div[data-testid="cellInnerDiv"][style*="order"]')
    corruptedCells.forEach((cell) => {
      cell.style.removeProperty('order')
      const parent = cell.parentElement
      if (parent && parent.style.display === 'flex') {
        parent.style.removeProperty('display')
        parent.style.removeProperty('flex-direction')
      }
    })
  }

  /**
   * 更新右下角浮动直达按钮
   */
  private updateJumpButton() {
    const mainEl = this.getMainTweetElement()
    if (!mainEl) {
      this.removeJumpButton()
      return
    }

    // 主内容篇幅较长（高度大于 380px）时展示直达回复胶囊按钮
    const rect = mainEl.getBoundingClientRect()
    const isLongPost = rect.height > 380
    if (!isLongPost) {
      this.removeJumpButton()
      return
    }

    if (!this.jumpButton) {
      const btn = document.createElement('div')
      btn.className = 'xf-jump-replies-btn'
      btn.setAttribute('role', 'button')
      btn.setAttribute('tabindex', '0')
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          <path d="M12 8v6"></path>
          <path d="M9 11l3 3 3-3"></path>
        </svg>
        <span class="xf-jump-text">直达回复</span>
      `
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (this.isAtReplies) {
          this.scrollToMainTweet()
        } else {
          this.scrollToReplies()
        }
      })
      document.body.appendChild(btn)
      this.jumpButton = btn
    }

    this.attachScrollListener()
    this.refreshJumpButtonState()
  }

  private attachScrollListener() {
    if (this.scrollListenerAttached) return
    this.scrollListenerAttached = true

    window.addEventListener(
      'scroll',
      debounce(() => {
        this.refreshJumpButtonState()
      }, 100),
      { passive: true }
    )
  }

  private refreshJumpButtonState() {
    if (!this.jumpButton) return
    const mainEl = this.getMainTweetElement()
    if (!mainEl) return

    const rect = mainEl.getBoundingClientRect()
    // 当主正文底部滚动到了视口顶部附近（或以上），判定为进入回复区
    const pastMain = rect.bottom < 150
    this.isAtReplies = pastMain

    const textEl = this.jumpButton.querySelector('.xf-jump-text')
    const svgEl = this.jumpButton.querySelector('svg')
    if (this.isAtReplies) {
      if (textEl) textEl.textContent = '回到正文'
      if (svgEl) {
        svgEl.innerHTML = `
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          <path d="M12 14V8"></path>
          <path d="M9 11l3-3 3 3"></path>
        `
      }
    } else {
      if (textEl) textEl.textContent = '直达回复'
      if (svgEl) {
        svgEl.innerHTML = `
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          <path d="M12 8v6"></path>
          <path d="M9 11l3 3 3-3"></path>
        `
      }
    }
  }

  private removeJumpButton() {
    if (this.jumpButton) {
      this.jumpButton.remove()
      this.jumpButton = null
    }
  }

  public destroy() {
    this.removeJumpButton()
    this.cleanupCorruptedDOM()
  }
}

export function updateReplyAssistant() {
  ReplyAssistant.getInstance().update()
}
