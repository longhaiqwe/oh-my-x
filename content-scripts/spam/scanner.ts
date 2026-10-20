import { t } from '../../shared/i18n'
import { evaluateSpam } from '../../shared/spam-rules'
import { recordIntercept } from '../../shared/spam-logger'
import {
  extractAuthorNameElement,
  extractAuthorVerified,
  extractTweetId,
  extractTweetInfo,
  extractTweetTime,
  type TweetInfo,
} from '../../shared/parse-tweet'
import type { SpamEvaluation, SpamRuleId } from '../../shared/spam-types'
import { replyDelaySeconds } from '../../shared/ai-reply-score'
import { getOwnHandle } from '../../shared/own-posts'
import { knownFollowerCount } from '../features/user-followers'
import { aiScorer, type AiDisplay } from './ai-scorer'
import { injectKeywordButton } from './keyword-picker'
import { applyAllow, applyHideDirect, resetArticleSpamState } from './article-state'
import { getSpamConfig, invalidateSpamConfigCache } from './config'
import {
  cleanupDebugBars,
  ensureBar,
  getDebugConfigKey,
  installScrollStabilityStyles,
  isInsideDialog,
  removeDebugBar,
  removeScrollStabilityStyles,
} from './debug-bar'
import { AI_VERSION_ATTR, DEBUG_BAR_ID, DEBUG_BAR_VERSION, DEBUG_CONFIG_ATTR, PROCESSED_ATTR, SCORE_ATTR, STATE_ATTR, XF_SELF_SELECTOR } from './dom-attrs'
import type { SpamConfig } from './types'

export { applyReplace } from './article-state'
export { buildDebugBar } from './debug-bar'
export { buildPlaceholder } from './placeholder'

// 缓存上次的评估输入指纹，用于增量评估短路（见 processArticle）
const SPAM_FP_ATTR = 'data-xf-spam-fp'

// 配置版本：每次 invalidate 自增，使文本指纹失效、强制重评。
// 黑/白名单、阈值、启用规则的变更都走 invalidateSpamConfig，从而触发重算。
let spamConfigVersion = 0

/** 一段对话的主帖：作为 AI 打分的上下文 */
interface ThreadInfo {
  id: string
  author: string
  text: string
  time: number | null
}

function threadOf(article: HTMLElement): ThreadInfo | null {
  const id = extractTweetId(article)
  if (!id) return null
  const info = extractTweetInfo(document, article)
  return { id, author: info?.authorHandle ?? '', text: info?.text ?? '', time: extractTweetTime(article) }
}

/** 调试条加上当前的 AI 结果版本，扫描时据此判断要不要重画 */
function showDebugBar(article: HTMLElement, evaluation: SpamEvaluation, config: SpamConfig, ai?: AiDisplay) {
  ensureBar(article, evaluation, config, ai)
  article.querySelector(`#${DEBUG_BAR_ID}`)?.setAttribute(AI_VERSION_ATTR, String(aiScorer.version()))
}

/**
 * 这条回复的 AI 判断状态；不送模型时返回 undefined。
 * 第 1 步只在调试模式下判断和显示（docs/plans/ai-reply-scoring.md 第 6 节）。
 */
function aiDisplayFor(
  article: HTMLElement,
  info: TweetInfo,
  evaluation: SpamEvaluation,
  config: SpamConfig,
  thread: ThreadInfo | null,
): AiDisplay | undefined {
  if (!config.ai || !config.debug || !thread) return undefined
  // 规则已经会隐藏的不送模型；没有正文（纯图片）的也不送
  if (evaluation.score >= config.threshold || !info.text) return undefined
  const id = extractTweetId(article)
  if (!id || id === thread.id) return undefined
  const own = getOwnHandle()?.toLowerCase() || ''
  if (own && info.authorHandle.toLowerCase() === own) return undefined
  const auto =
    config.ai.autoScope === 'all' ||
    (config.ai.autoScope === 'own' && Boolean(own) && thread.author.toLowerCase() === own)
  return aiScorer.request(
    {
      id,
      author: info.authorHandle,
      text: info.text,
      delaySeconds: replyDelaySeconds(thread.time, extractTweetTime(article)),
      followers: knownFollowerCount(info.authorHandle, extractAuthorNameElement(article)),
      verified: extractAuthorVerified(article),
    },
    { id: thread.id, author: thread.author, text: thread.text },
    auto,
  )
}

async function processArticle(article: HTMLElement, config: SpamConfig, thread: ThreadInfo | null = null) {
  // 轻量级预指纹短路（非 debug）：
  // 在昂贵的 extractTweetInfo（TreeWalker 遍历 DOM）之前，用 textContent 长度 +
  // 首尾 16 字符 + 配置版本快速判断推文是否已变更。
  // 注意：使用 textContent 而非 innerText，因为 textContent 不会触发强制回流（reflow）。
  // 指纹匹配 → 跳过整条处理链路（含 TreeWalk + evaluateSpam），节省大量 CPU。
  if (!config.debug) {
    const rawText = article.textContent || ''
    const preFp = `${rawText.length}:${rawText.slice(0, 16)}:${rawText.slice(-16)}:v${spamConfigVersion}`
    if (article.getAttribute(PROCESSED_ATTR) === '1' && article.getAttribute(SPAM_FP_ATTR) === preFp) {
      return
    }
    article.setAttribute(SPAM_FP_ATTR, preFp)
  }

  // X 推文分阶段渲染；每轮重评估能避免初次拿到不完整 text/name。
  const info = extractTweetInfo(document, article)
  if (!info) return

  if (info.authorHandle && config.blacklist.has(info.authorHandle.toLowerCase())) {
    article.setAttribute(PROCESSED_ATTR, '1')
    const evaluation: SpamEvaluation = {
      score: 999,
      hits: [{ id: 'marketing_keyword' as SpamRuleId, label: t('spamHit.blocklist'), score: 999, detail: { blocklist: true } }],
      category: 'marketing',
      text: info.text,
      authorHandle: info.authorHandle,
    }
    article.setAttribute(SCORE_ATTR, String(evaluation.score))
    if (config.debug) {
      applyAllow(article)
      article.setAttribute(SCORE_ATTR, String(evaluation.score))
      showDebugBar(article, evaluation, config)
    } else {
      if (article.getAttribute(STATE_ATTR) !== 'hidden') {
        void recordIntercept({
          authorHandle: info.authorHandle,
          authorName: info.authorName,
          text: info.text,
          score: evaluation.score,
          category: evaluation.category,
          hits: evaluation.hits,
          action: 'filter',
        })
      }
      applyHideDirect(article)
    }
    return
  }

  if (info.authorHandle && config.whitelist.has(info.authorHandle.toLowerCase())) {
    if (article.getAttribute(STATE_ATTR)) applyAllow(article)
    article.setAttribute(PROCESSED_ATTR, '1')
    return
  }

  const evaluation = evaluateSpam({
    text: info.text,
    authorName: info.authorName,
    authorHandle: info.authorHandle,
    // 空数组表示用户明确清空了词库；只有 storage key 缺失时，getStorage 才会回退默认词库。
    keywords: config.keywords,
    normalizedKeywords: config.normalizedKeywords,
    enabledRules: config.enabledRules,
  })

  article.setAttribute(PROCESSED_ATTR, '1')
  article.setAttribute(SCORE_ATTR, String(evaluation.score))

  const shouldHide = evaluation.score >= config.threshold

  if (config.debug) {
    if (article.getAttribute(STATE_ATTR) === 'hidden') applyAllow(article)
    showDebugBar(article, evaluation, config, aiDisplayFor(article, info, evaluation, config, thread))
    return
  }

  const isHidden = article.getAttribute(STATE_ATTR) === 'hidden'
  if (shouldHide === isHidden) {
    ensureBar(article, evaluation, config)
    return
  }

  applyAllow(article)

  if (shouldHide) {
    void recordIntercept({
      authorHandle: info.authorHandle,
      authorName: info.authorName,
      text: info.text,
      score: evaluation.score,
      category: evaluation.category,
      hits: evaluation.hits,
      action: 'filter',
    })
    applyHideDirect(article)
    ensureBar(article, evaluation, config)
  }
}

export function invalidateSpamConfig() {
  invalidateSpamConfigCache()
  spamConfigVersion++
  // 设置或 AI 连接改了：解除 AI 判断的暂停，失败次数清零
  aiScorer.reset()
}

let scanScheduled = false
async function scheduleScan() {
  if (scanScheduled) return
  // 非详情页且非 Deck 页面（如 /home 首页时间线）不参与评论垃圾过滤；
  // 若页面上无残留的调试条或隐藏状态，无需调度扫描，避免主页高频滚动时无谓轮询。
  const { isDetailPage } = isTweetDetailPage()
  const isDeck = isDeckPage()
  if (!isDetailPage && !isDeck && !document.querySelector(`article[${STATE_ATTR}="hidden"], #${DEBUG_BAR_ID}`)) {
    return
  }
  scanScheduled = true
  const idle = (window as any).requestIdleCallback as ((cb: () => void) => void) | undefined
  if (idle) {
    idle(() => {
      scanScheduled = false
      void runScan()
    })
  } else {
    setTimeout(() => {
      scanScheduled = false
      void runScan()
    }, 50)
  }
}

export function isTweetDetailPage(pathname: string = window.location.pathname): { isDetailPage: boolean; statusId?: string } {
  if (/\/(analytics|retweets|likes|quotes)$/.test(pathname)) {
    return { isDetailPage: false }
  }
  const match = pathname.match(/\/status\/(\d+)/)
  return { isDetailPage: Boolean(match), statusId: match?.[1] }
}

export function isDeckPage(pathname: string = window.location.pathname): boolean {
  return /^\/i\/decks(\/|$)/.test(pathname)
}

// 对话时间线的 aria-label：英文 Timeline: Conversation，中文「时间线：对话」等。
// 不能只认 /status/，pro.x.com 的 Deck 地址是 /i/decks/:id，对话栏仍用这套 DOM。
const CONVERSATION_ARIA_RE = /conversation|对话|会話|conversa|konversation/i

interface ScanScope {
  articles: HTMLElement[]
  /** 主帖和排在主帖上方的上级推文：不评分 */
  nonReplies: Set<HTMLElement>
  /** 这段对话的主帖；拿不到时为 null */
  thread: ThreadInfo | null
}

/** 详情页的主帖记忆：主帖滚出页面后，仍能认出主帖和上级推文、拿到主帖正文 */
interface ThreadMemory {
  thread: ThreadInfo | null
  nonReplyIds: Set<string>
}

const threadMemory = new Map<string, ThreadMemory>()
const THREAD_MEMORY_LIMIT = 50

function rememberThread(statusId: string, articles: HTMLElement[], mainIndex: number): ThreadMemory {
  const memory = threadMemory.get(statusId) ?? { thread: null, nonReplyIds: new Set<string>() }
  for (let i = 0; i <= mainIndex; i++) {
    const id = extractTweetId(articles[i])
    if (id) memory.nonReplyIds.add(id)
  }
  // 主帖正文取到一次就够了；正文为空时（页面还没渲染完）再取
  if (!memory.thread?.text) memory.thread = threadOf(articles[mainIndex]) ?? memory.thread
  threadMemory.delete(statusId)
  threadMemory.set(statusId, memory)
  if (threadMemory.size > THREAD_MEMORY_LIMIT) threadMemory.delete(threadMemory.keys().next().value as string)
  return memory
}

function isConversationLabel(label: string): boolean {
  return CONVERSATION_ARIA_RE.test(label)
}

function tweetsIn(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'))
}

function nearestTweetAncestor(start: Element | null): HTMLElement | null {
  let el = start?.parentElement ?? null
  while (el) {
    if (el.querySelector('article[data-testid="tweet"]')) return el
    el = el.parentElement
  }
  return null
}

/** 去掉互相嵌套的根：保留最内层，避免同一批评论被扫两遍、或误把整页多栏当成一栏。 */
function innermostRoots(roots: Iterable<HTMLElement>): HTMLElement[] {
  const arr = Array.from(roots)
  return arr.filter((el) => !arr.some((other) => other !== el && el.contains(other)))
}

/**
 * 找出页面上的「对话栏」根节点。
 * 信号（语言无关优先）：Conversation aria-label、栏头返回按钮、主贴下方的行内回复框。
 */
export function collectConversationRoots(root: ParentNode = document): HTMLElement[] {
  const found = new Set<HTMLElement>()

  for (const el of root.querySelectorAll<HTMLElement>('[aria-label]')) {
    if (!isConversationLabel(el.getAttribute('aria-label') || '')) continue
    if (el.querySelector('article[data-testid="tweet"]')) found.add(el)
  }

  for (const back of root.querySelectorAll('[data-testid="app-bar-back"]')) {
    const column = nearestTweetAncestor(back)
    if (column) found.add(column)
  }

  for (const reply of root.querySelectorAll('[data-testid="inline_reply_offscreen"]')) {
    const column = nearestTweetAncestor(reply)
    if (column) found.add(column)
  }

  return innermostRoots(found)
}

/** 主帖在 articles 里的位置；主帖和行内回复框都不在页面上时返回 -1 */
function findMainTweetIndex(scopeRoot: HTMLElement, articles: HTMLElement[], statusId?: string): number {
  if (statusId) {
    const matched = articles.findIndex((art) => art.querySelector(`a[href*="/status/${statusId}"]`))
    if (matched !== -1) return matched
  }

  const composer = scopeRoot.querySelector('[data-testid="inline_reply_offscreen"]')
  if (composer) {
    let lastBefore = -1
    for (let i = 0; i < articles.length; i++) {
      const pos = articles[i].compareDocumentPosition(composer)
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) lastBefore = i
    }
    if (lastBefore >= 0) return lastBefore
  }

  return -1
}

function collectStatusPageScope(statusId?: string): ScanScope | null {
  const articles = tweetsIn(document)
  if (!articles.length) return null
  const mainIndex = findMainTweetIndex(document.body, articles, statusId)
  if (mainIndex >= 0) {
    const memory = statusId ? rememberThread(statusId, articles, mainIndex) : null
    return {
      articles,
      nonReplies: new Set(articles.slice(0, mainIndex + 1)),
      thread: memory ? memory.thread : threadOf(articles[mainIndex]),
    }
  }
  // 往下翻评论时 X 会把主帖和行内回复框移出页面：按记住的 ID 认主帖和上级推文，其余都是回复
  const memory = statusId ? threadMemory.get(statusId) : undefined
  if (memory) {
    const nonReplies = new Set(articles.filter((article) => {
      const id = extractTweetId(article)
      return id !== null && memory.nonReplyIds.has(id)
    }))
    return { articles, nonReplies, thread: memory.thread }
  }
  // 没见过主帖（页面刚打开、还没渲染完）：把第一条当主帖
  return { articles, nonReplies: new Set(articles.slice(0, 1)), thread: threadOf(articles[0]) }
}

function collectDeckConversationScopes(): ScanScope[] {
  return collectConversationRoots(document)
    .map((root) => {
      const articles = tweetsIn(root)
      if (!articles.length) return null
      const mainIndex = Math.max(0, findMainTweetIndex(root, articles))
      return {
        articles,
        nonReplies: new Set(articles.slice(0, mainIndex + 1)),
        thread: threadOf(articles[mainIndex]),
      }
    })
    .filter((scope): scope is ScanScope => scope !== null)
}

function resetSpamArtifactsOutside(keep: Set<HTMLElement>) {
  document.querySelectorAll<HTMLElement>(`article[${STATE_ATTR}="hidden"], article[${PROCESSED_ATTR}]`).forEach((el) => {
    if (keep.has(el)) return
    applyAllow(el)
    el.removeAttribute(PROCESSED_ATTR)
    el.removeAttribute(SCORE_ATTR)
  })
}

function clearPageSpamState() {
  cleanupDebugBars()
  removeScrollStabilityStyles()
  cleanupOrphanReplacements()
  resetSpamArtifactsOutside(new Set())
}

function scanScope(scope: ScanScope, config: SpamConfig, force: boolean, debugConfigKey: string) {
  const aiVersion = String(aiScorer.version())
  for (const article of scope.articles) {
    if (article.closest('[data-xf-spam-hidden-replacement]')) continue
    if (config.debug && isInsideDialog(article)) removeDebugBar(article)

    // 主贴（及主贴前置上下文）：不进入评分体系、不展示调试条
    if (scope.nonReplies.has(article)) {
      removeDebugBar(article)
      if (article.getAttribute(STATE_ATTR) === 'hidden') applyAllow(article)
      article.removeAttribute(PROCESSED_ATTR)
      article.removeAttribute(SCORE_ATTR)
      injectKeywordButton(article)
      continue
    }

    // 评论推文：进入评分体系
    if (!force && config.debug && article.getAttribute(PROCESSED_ATTR)) {
      const bar = article.querySelector<HTMLElement>(`#${DEBUG_BAR_ID}`)
      if (
        bar?.getAttribute('data-xf-score-key') &&
        bar.getAttribute('data-xf-debug-version') === DEBUG_BAR_VERSION &&
        bar.getAttribute(DEBUG_CONFIG_ATTR) === debugConfigKey &&
        bar.getAttribute(AI_VERSION_ATTR) === aiVersion
      ) {
        injectKeywordButton(article)
        continue
      }
    }

    void processArticle(article, config, scope.thread)
    injectKeywordButton(article)
  }
}

export async function runScan(force = false) {
  const config = await getSpamConfig()
  if (!config) {
    cleanupDebugBars()
    removeScrollStabilityStyles()
    document.querySelectorAll<HTMLElement>(`article[${PROCESSED_ATTR}]`).forEach((el) => {
      applyAllow(el)
      el.removeAttribute(PROCESSED_ATTR)
    })
    cleanupOrphanReplacements()
    return
  }

  // AI 判断没开（或不在调试模式）时清掉排队中的请求
  if (!config.ai || !config.debug) aiScorer.stop()

  const { isDetailPage, statusId } = isTweetDetailPage()

  // 评分范围：
  // - /username/status/:id 详情页：整页按主贴/评论切分（原逻辑）
  // - /i/decks/:id 专业版：只扫对话栏里的评论，时间线栏不评分
  // - 其它页面（/home 等）：不评分，并清掉残留隐藏状态
  let scopes: ScanScope[] = []
  if (isDetailPage) {
    const scope = collectStatusPageScope(statusId)
    if (!scope) return
    scopes = [scope]
  } else if (isDeckPage()) {
    scopes = collectDeckConversationScopes()
    if (!scopes.length) {
      clearPageSpamState()
      return
    }
  } else {
    clearPageSpamState()
    return
  }

  installScrollStabilityStyles()
  if (!config.debug) cleanupDebugBars()
  cleanupOrphanReplacements()

  const inScope = new Set<HTMLElement>()
  for (const scope of scopes) {
    for (const article of scope.articles) inScope.add(article)
  }
  resetSpamArtifactsOutside(inScope)

  const debugConfigKey = config.debug ? getDebugConfigKey(config) : ''
  for (const scope of scopes) {
    scanScope(scope, config, force, debugConfigKey)
  }
}

export function cleanupOrphanReplacements() {
  document.querySelectorAll<HTMLElement>('[data-xf-spam-hidden-replacement]').forEach((rep) => {
    let next = rep.nextElementSibling
    while (next && next.matches?.('[data-xf-spam-hidden-replacement]')) {
      next = next.nextElementSibling
    }
    if (!next || !next.matches?.('article[data-testid="tweet"]') || next.getAttribute(STATE_ATTR) !== 'hidden') {
      rep.remove()
    }
  })

  document.querySelectorAll<HTMLElement>(`article[data-testid="tweet"][${STATE_ATTR}="hidden"]`).forEach((article) => {
    let prev = article.previousElementSibling
    const toRemove: HTMLElement[] = []
    let kept = false
    while (prev && prev.matches?.('[data-xf-spam-hidden-replacement]')) {
      const el = prev as HTMLElement
      prev = prev.previousElementSibling
      if (kept) toRemove.push(el)
      else kept = true
    }
    toRemove.forEach((el) => el.remove())
  })
}

export function cleanupAllSpamArtifacts() {
  cleanupDebugBars()
  removeScrollStabilityStyles()
  document.querySelectorAll<HTMLElement>('[data-xf-spam-hidden-replacement]').forEach((el) => el.remove())
  document.querySelectorAll<HTMLElement>('.x-focus-spam-placeholder').forEach((el) => el.remove())
  document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]').forEach(resetArticleSpamState)
  return document.querySelectorAll('article[data-testid="tweet"]').length
}

let observer: MutationObserver | null = null

export function isOwnNode(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false
  // 使用浏览器原生 closest()（C++ 实现）替代手动 while 循环逐层上溯，
  // 在深层嵌套的 React DOM 中性能提升显著（避免 20-30 层 JS 循环）。
  return !!(node as Element).closest?.(XF_SELF_SELECTOR)
}

export function isSelfMutation(records: MutationRecord[]): boolean {
  for (const rec of records) {
    if (rec.type === 'attributes') continue
    for (const node of Array.from(rec.addedNodes)) {
      if (!isOwnNode(node)) return false
    }
    for (const node of Array.from(rec.removedNodes)) {
      if (!isOwnNode(node)) return false
    }
  }
  return true
}

let popstateListener: (() => void) | null = null
let stopAiListener: (() => void) | null = null

export function startSpamObserver() {
  if (observer) return
  installScrollStabilityStyles()
  observer = new MutationObserver((records) => {
    // 快速路径：跳过纯属性变更（spam scanner 只关心 childList 增删）
    // 以及全部为文本节点的变更（#text 不可能包含 tweet article）。
    let hasRelevant = false
    for (const rec of records) {
      if (rec.type !== 'childList') continue
      if (rec.addedNodes.length > 0 || rec.removedNodes.length > 0) {
        hasRelevant = true
        break
      }
    }
    if (!hasRelevant) return
    if (isSelfMutation(records)) return
    void scheduleScan()
  })
  observer.observe(document.body, { childList: true, subtree: true })

  if (!popstateListener && typeof window !== 'undefined') {
    popstateListener = () => void scheduleScan()
    window.addEventListener('popstate', popstateListener)
  }

  // AI 判断结果回来后重扫，调试条按新结果重画
  stopAiListener ??= aiScorer.onChange(() => void scheduleScan())

  void runScan()
}

export function stopSpamObserver() {
  observer?.disconnect()
  observer = null
  if (popstateListener && typeof window !== 'undefined') {
    window.removeEventListener('popstate', popstateListener)
    popstateListener = null
  }
  stopAiListener?.()
  stopAiListener = null
  aiScorer.stop()
  removeScrollStabilityStyles()
}
