import { KeyAutoLikeOnReply } from '../../storage-keys'
import { getStorage } from '../utilities/storage'
import { XF_BRIDGE_MARKER, REPLY_POSTED_TYPE } from '../../shared/bridge'

export interface PendingReplyTarget {
  element?: HTMLElement | null
  tweetId?: string | null
  authorHandle?: string | null
  timestamp: number
}

const NAVIGATION_HANDLES = new Set([
  'home',
  'explore',
  'notifications',
  'messages',
  'bookmarks',
  'profile',
  'i',
  'compose',
  'search',
  'settings',
])

/**
 * 获取当前登录用户的 @handle（小写）
 */
export function getCurrentUserHandle(): string | null {
  const profileLink = document.querySelector<HTMLAnchorElement>('a[data-testid="AppTabBar_Profile_Link"]')
  if (profileLink) {
    const href = profileLink.getAttribute('href') || ''
    const match = href.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/)
    if (match && !NAVIGATION_HANDLES.has(match[1].toLowerCase())) {
      return match[1].toLowerCase()
    }
  }

  const accountBtn = document.querySelector<HTMLElement>('[data-testid="SideNav_AccountSwitcher_Button"]')
  if (accountBtn) {
    const text = accountBtn.textContent || ''
    const match = text.match(/@([A-Za-z0-9_]{1,15})/)
    if (match) {
      return match[1].toLowerCase()
    }
  }

  return null
}

/**
 * 从推文 article 元素中提取作者的 @handle
 * 严格优先从 User-Name 容器提取，避免提取到推文正文里的 @提及 用户
 */
export function getTweetAuthorHandle(article: HTMLElement): string | null {
  const userNameEl = article.querySelector('[data-testid="User-Name"]')
  if (userNameEl) {
    const links = userNameEl.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')
    for (const a of Array.from(links)) {
      const m = a.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/)
      if (m && m[1] && !NAVIGATION_HANDLES.has(m[1].toLowerCase())) {
        return m[1].toLowerCase()
      }
    }
  }

  // 从 status 链接提取作者 handle（例如 /author/status/12345678）
  const statusLinks = article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')
  for (const a of Array.from(statusLinks)) {
    if (a.closest('[data-testid="quoteTweet"]')) continue
    const href = a.getAttribute('href') || ''
    const m = href.match(/^\/([A-Za-z0-9_]{1,15})\/status\/\d+/)
    if (m && m[1] && !NAVIGATION_HANDLES.has(m[1].toLowerCase())) {
      return m[1].toLowerCase()
    }
  }

  const handleLinks = article.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')
  for (const a of Array.from(handleLinks)) {
    // 排除引用推文与正文中的提及链接
    if (a.closest('[data-testid="quoteTweet"], [data-testid="tweetText"]')) continue
    const m = a.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/)
    if (m && m[1] && !NAVIGATION_HANDLES.has(m[1].toLowerCase())) {
      return m[1].toLowerCase()
    }
  }
  return null
}

/**
 * 从推文 article 元素中提取推文 Snowflake ID
 */
export function extractTweetIdFromArticle(article: HTMLElement): string | null {
  // 优先从 time 标签包裹或相邻的链接提取
  const timeLink = article.querySelector('time')?.closest<HTMLAnchorElement>('a')
  if (timeLink) {
    const href = timeLink.getAttribute('href') || ''
    const m = href.match(/\/status\/(\d+)/)
    if (m && m[1]) return m[1]
  }

  const links = article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')
  for (const a of Array.from(links)) {
    if (a.closest('[data-testid="quoteTweet"]')) continue
    const href = a.getAttribute('href') || ''
    const m = href.match(/\/status\/(\d+)/)
    if (m && m[1]) return m[1]
  }
  return null
}

/**
 * 判断指定推文卡片是否对应给定的推文 ID
 */
export function isArticleMatchingTweetId(art: HTMLElement, tweetId: string): boolean {
  if (!art || !tweetId) return false

  // 1. 直接检查卡片内部是否包含指向该 status ID 的非引用链接
  const links = art.querySelectorAll<HTMLAnchorElement>(`a[href*="/status/${tweetId}"]`)
  for (const a of Array.from(links)) {
    if (!a.closest('[data-testid="quoteTweet"]')) return true
  }

  // 2. 检查解析出的 ID
  return extractTweetIdFromArticle(art) === tweetId
}

/**
 * 在页面中查找指定 ID 的推文 article 节点
 */
export function findTweetElementById(tweetId: string): HTMLElement | null {
  if (!tweetId) return null

  const allArticles = Array.from(
    document.querySelectorAll<HTMLElement>('article[data-testid="tweet"], [data-testid="tweet"]')
  )

  // 1. 优先查找时间线中（非处于弹窗内）的对应推文节点
  const timelineMatch = allArticles.find((art) => {
    if (art.closest('div[role="dialog"]')) return false
    return isArticleMatchingTweetId(art, tweetId)
  })
  if (timelineMatch) return timelineMatch

  // 2. 次优：在所有推文（含弹窗内）中查找
  const anyMatch = allArticles.find((art) => isArticleMatchingTweetId(art, tweetId))
  if (anyMatch) return anyMatch

  // 3. 兜底：如果当前页面就是该推文的详情页，主推文卡片即为目标
  const match = window.location.pathname.match(/\/status\/(\d+)/)
  if (match && match[1] === tweetId) {
    const mainTweet = document.querySelector<HTMLElement>('article[data-testid="tweet"], [data-testid="tweet"]')
    if (mainTweet && !mainTweet.closest('div[role="dialog"]')) {
      return mainTweet
    }
  }

  return null
}

/**
 * 检查推文当前是否已经处于点赞状态
 */
export function isTweetLiked(article: HTMLElement): boolean {
  if (!article) return false
  return Boolean(
    article.querySelector('button[data-testid="unlike"], [data-testid="unlike"]') ||
      article.querySelector('[data-testid="like"][aria-label*="Unlike"]') ||
      article.querySelector('[data-testid="like"][aria-label*="取消喜欢"]') ||
      article.querySelector('[data-testid="like"][aria-label*="已赞"]')
  )
}

/**
 * 在推文卡片中查找真实的点赞按钮（自动排除引用卡片内部的点赞按钮）
 */
export function findLikeButton(article: HTMLElement): HTMLElement | null {
  if (!article) return null
  const likeButtons = Array.from(
    article.querySelectorAll<HTMLElement>(
      'button[data-testid="like"], [data-testid="like"], [role="button"][data-testid="like"]'
    )
  )
  return likeButtons.find((btn) => !btn.closest('[data-testid="quoteTweet"]')) || likeButtons[0] || null
}

/**
 * 等待页面上的弹窗关闭（避免弹窗未关闭时点击打在遮罩层上被拦截）
 */
export function waitForDialogClose(maxWaitMs = 2500): Promise<void> {
  if (!document.querySelector('div[role="dialog"]')) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    let resolved = false
    const finish = () => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      observer.disconnect()
      resolve()
    }

    const timer = setTimeout(finish, maxWaitMs)
    const observer = new MutationObserver(() => {
      if (!document.querySelector('div[role="dialog"]')) {
        finish()
      }
    })

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true })
    } else {
      finish()
    }
  })
}

/**
 * 生成拟人化随机延迟
 * 默认优化为 300ms ~ 700ms（平均约 500ms）：
 * 既避开了 0ms 瞬间请求的机械风控特征，又能在用户滚动滑走前稳健完成点赞
 */
export function getRandomLikeDelay(minMs = 300, maxMs = 700): number {
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs
}

export class AutoLikeReplyManager {
  private static instance: AutoLikeReplyManager | null = null
  private pendingTarget: PendingReplyTarget | null = null
  private isInitialized = false
  private completedLikes = new Set<string>()
  private delayRange: [number, number] = [300, 700]

  private constructor() {
    this.handleClick = this.handleClick.bind(this)
    this.handleKeyDown = this.handleKeyDown.bind(this)
    this.handleMessage = this.handleMessage.bind(this)
  }

  public static getInstance(): AutoLikeReplyManager {
    if (!AutoLikeReplyManager.instance) {
      AutoLikeReplyManager.instance = new AutoLikeReplyManager()
    }
    return AutoLikeReplyManager.instance
  }

  public setDelayRange(range: [number, number]) {
    this.delayRange = range
  }

  public init() {
    if (this.isInitialized) return
    this.isInitialized = true

    document.addEventListener('click', this.handleClick, true)
    document.addEventListener('keydown', this.handleKeyDown, true)
    window.addEventListener('message', this.handleMessage)
  }

  public destroy() {
    document.removeEventListener('click', this.handleClick, true)
    document.removeEventListener('keydown', this.handleKeyDown, true)
    window.removeEventListener('message', this.handleMessage)
    this.pendingTarget = null
    this.completedLikes.clear()
    this.isInitialized = false
  }

  public getPendingTarget(): PendingReplyTarget | null {
    return this.pendingTarget
  }

  public setPendingTarget(target: PendingReplyTarget | null) {
    this.pendingTarget = target
  }

  /**
   * 监听点击事件：
   * 1. 点击评论的「回复」按钮时，记录目标评论信息
   * 2. 点击「发送回复」按钮时，触发调度点赞
   */
  private handleClick(e: MouseEvent) {
    const target = e.target as Element | null
    if (!target) return

    // 1. 捕获点击「回复」按钮
    const replyBtn = target.closest<HTMLElement>(
      'button[data-testid="reply"], [data-testid="reply"], [role="button"][data-testid="reply"]'
    )
    if (replyBtn) {
      const article = replyBtn.closest<HTMLElement>('article[data-testid="tweet"], [data-testid="tweet"]')
      if (article) {
        const tweetId = extractTweetIdFromArticle(article)
        const authorHandle = getTweetAuthorHandle(article)
        this.pendingTarget = {
          element: article,
          tweetId,
          authorHandle,
          timestamp: Date.now(),
        }
      }
      return
    }

    // 2. 捕获点击「发送回复」按钮
    const submitBtn = target.closest<HTMLElement>(
      'button[data-testid="tweetButton"], button[data-testid="tweetButtonInline"], [data-testid="tweetButton"], [data-testid="tweetButtonInline"]'
    )
    if (submitBtn) {
      this.handleReplySubmitted()
    }
  }

  /**
   * 监听快捷键 Cmd + Enter / Ctrl + Enter 发送回复
   */
  private handleKeyDown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      const activeEl = document.activeElement
      if (
        activeEl &&
        (activeEl.closest('[data-testid*="tweetTextarea"]') ||
          activeEl.closest('[role="textbox"]') ||
          activeEl.closest('[data-testid="inlineReplyComposer"]'))
      ) {
        this.handleReplySubmitted()
      }
    }
  }

  /**
   * 安排一次拟人化的随机延迟点赞任务
   * 若页面存在弹窗，先等待弹窗正常退场再执行延迟与点赞，确保时间线卡片已恢复可交互状态
   */
  public async scheduleAutoLike(
    tweetId?: string,
    element?: HTMLElement,
    authorHandle?: string,
    customDelayMs?: number,
  ) {
    if (tweetId && this.completedLikes.has(tweetId)) return

    // 如果处于弹窗中，先等待弹窗关闭，防止点击打在遮罩层上
    if (document.querySelector('div[role="dialog"]')) {
      await waitForDialogClose(2500)
    }

    if (tweetId && this.completedLikes.has(tweetId)) return

    const delay =
      typeof customDelayMs === 'number'
        ? customDelayMs
        : (this.delayRange[1] === 0 ? 0 : getRandomLikeDelay(this.delayRange[0], this.delayRange[1]))

    setTimeout(() => {
      this.autoLikeWithRetry(tweetId, element, authorHandle)
    }, delay)
  }

  /**
   * 处理回复提交动作（DOM 触发调度）
   */
  public handleReplySubmitted() {
    // 检查并提取弹窗中的目标推文（如果有打开的弹窗）
    const dialog = document.querySelector('div[role="dialog"]')
    let dialogTweetId: string | null = null
    let dialogAuthorHandle: string | null = null

    if (dialog) {
      const dialogArticle = dialog.querySelector<HTMLElement>('article[data-testid="tweet"], [data-testid="tweet"]')
      if (dialogArticle) {
        dialogTweetId = extractTweetIdFromArticle(dialogArticle)
        dialogAuthorHandle = getTweetAuthorHandle(dialogArticle)
      }
    }

    // 若无弹窗且未捕获到评论回复按钮，支持单贴详情页顶部 inline composer 回复主贴
    let inlineMainTweetId: string | null = null
    let inlineMainAuthorHandle: string | null = null
    if (!dialogTweetId && !this.pendingTarget?.tweetId) {
      const match = window.location.pathname.match(/\/status\/(\d+)/)
      if (match && match[1]) {
        inlineMainTweetId = match[1]
        const mainTweet = document.querySelector<HTMLElement>('article[data-testid="tweet"], [data-testid="tweet"]')
        if (mainTweet) {
          inlineMainAuthorHandle = getTweetAuthorHandle(mainTweet)
        }
      }
    }

    // 检查暂存目标是否有效（60 秒内）
    const validPendingTarget =
      this.pendingTarget && Date.now() - this.pendingTarget.timestamp < 60000
        ? this.pendingTarget
        : null

    const targetTweetId = dialogTweetId || validPendingTarget?.tweetId || inlineMainTweetId
    const targetAuthorHandle = dialogAuthorHandle || validPendingTarget?.authorHandle || inlineMainAuthorHandle
    const targetElement = validPendingTarget?.element

    if (targetTweetId || targetElement) {
      void this.scheduleAutoLike(targetTweetId || undefined, targetElement || undefined, targetAuthorHandle || undefined)
    }

    // 发送后重置暂存目标，避免后续不同推文操作混淆
    this.pendingTarget = null
  }

  /**
   * 监听 MAIN world 拦截器广播的回复成功消息
   */
  private handleMessage(event: MessageEvent) {
    if (event.source !== window) return
    const data = event.data
    if (
      data &&
      typeof data === 'object' &&
      data.__xf === XF_BRIDGE_MARKER &&
      data.type === REPLY_POSTED_TYPE
    ) {
      const inReplyToTweetId = data.payload?.inReplyToTweetId
      if (typeof inReplyToTweetId === 'string' && inReplyToTweetId) {
        // 如果该推文尚未成功点赞，执行 API 兜底调度
        if (!this.completedLikes.has(inReplyToTweetId)) {
          // 由于接口响应已经历天然的网络耗时（300ms~1000ms），此处仅需轻量微抖动即可
          const fallbackDelay = this.delayRange[1] === 0 ? 0 : getRandomLikeDelay(150, 400)
          setTimeout(() => {
            if (!this.completedLikes.has(inReplyToTweetId)) {
              this.autoLikeWithRetry(inReplyToTweetId)
            }
          }, fallbackDelay)
        }
      }
    }
  }

  /**
   * 执行自动点赞操作（单一目标）
   * @returns true 表示点赞成功或已经处于点赞状态；false 表示未找到点赞按钮或被跳过
   */
  public async autoLike(
    tweetId?: string,
    element?: HTMLElement,
    authorHandle?: string,
  ): Promise<boolean> {
    const isEnabled = (await getStorage(KeyAutoLikeOnReply)) !== 'off'
    if (!isEnabled) return false

    if (tweetId && this.completedLikes.has(tweetId)) return true

    let targetArticle: HTMLElement | null = element || null

    // 1. 若传入的 element 位于弹窗内部，弹窗内卡片无点赞按钮，必须在背景时间线中寻址
    if (targetArticle && targetArticle.closest('div[role="dialog"]') && tweetId) {
      targetArticle = findTweetElementById(tweetId)
    }

    // 2. 若 element 为空、已从 DOM 脱落、或找不到点赞按钮，重新按 ID 全局寻址
    if ((!targetArticle || !targetArticle.isConnected || !findLikeButton(targetArticle)) && tweetId) {
      const reFound = findTweetElementById(tweetId)
      if (reFound) targetArticle = reFound
    }

    if (!targetArticle) return false

    // 3. 检查是否为当前登录用户自己的推文（串楼/写 Thread 时不给自己点赞）
    const currentUser = getCurrentUserHandle()
    const targetAuthor = authorHandle || getTweetAuthorHandle(targetArticle)
    if (currentUser && targetAuthor && currentUser.toLowerCase() === targetAuthor.toLowerCase()) {
      return false
    }

    // 4. 检查是否已点赞（幂等性保护：若已赞则直接标记完成，绝对不重复点击避免取消点赞）
    if (isTweetLiked(targetArticle)) {
      if (tweetId) this.completedLikes.add(tweetId)
      return true
    }

    // 5. 在推文底部查找真实的点赞按钮（已排除引用卡片内部）
    const likeBtn = findLikeButton(targetArticle)
    if (likeBtn) {
      likeBtn.click()
      if (tweetId) this.completedLikes.add(tweetId)
      return true
    }

    return false
  }

  /**
   * 带重试机制的自动点赞（应对弹窗正在关闭、虚拟列表延迟渲染等场景）
   */
  public autoLikeWithRetry(
    tweetId?: string,
    element?: HTMLElement,
    authorHandle?: string,
    maxAttempts = 10,
    intervalMs = 250,
  ) {
    if (tweetId && this.completedLikes.has(tweetId)) return

    let attempts = 0

    const execute = async () => {
      attempts++
      const done = await this.autoLike(tweetId, element, authorHandle)
      if (done && tweetId) {
        this.completedLikes.add(tweetId)
        return
      }
      if (!done && attempts < maxAttempts) {
        setTimeout(execute, intervalMs)
      }
    }

    void execute()
  }
}

export function initAutoLikeOnReply() {
  AutoLikeReplyManager.getInstance().init()
}
