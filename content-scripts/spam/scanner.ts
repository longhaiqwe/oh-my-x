import { describeAiError } from '../../shared/ai-error'
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
import { REPLY_SCORE_BATCH_SIZE, replyDelaySeconds, type ReplyScoreItem, type ReplyScoreParent, type ReplyScoreTarget } from '../../shared/ai-reply-score'
import { OPEN_SETTINGS, REPLY_SCORE_FOLDED } from '../../shared/ai-request'
import { readConversationId, readReplyTarget, REPLY_TARGET_EVENT, REPLY_TO_ATTR } from '../../shared/reply-target'
import { errorText } from '../../shared/errors'
import { getOwnHandle } from '../../shared/own-posts'
import { knownFollowerCount } from '../features/user-followers'
import { aiScorer, type AiDisplay } from './ai-scorer'
import { buildFoldBar, ensureAiPill, ensureScoreTag, findHeaderRow, foldBarKey, removeAiBadges, type AiPillState } from './ai-badge'
import type { ReplyLabel } from '../../shared/reply-score-db'
import { injectKeywordButton } from './keyword-picker'
import { applyAllow, applyHideDirect, applyReplace, resetArticleSpamState } from './article-state'
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
import {
  AI_VERSION_ATTR,
  DEBUG_BAR_ID,
  DEBUG_BAR_VERSION,
  DEBUG_CONFIG_ATTR,
  HIDDEN_BY_ATTR,
  PROCESSED_ATTR,
  SCORE_ATTR,
  STATE_ATTR,
  XF_SELF_SELECTOR,
} from './dom-attrs'
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
  /** 主帖所在对话的 ID（拦截脚本写在主帖上）；还不知道时为空 */
  conversationId: string
}

function threadOf(article: HTMLElement): ThreadInfo | null {
  const id = extractTweetId(article)
  if (!id) return null
  const info = extractTweetInfo(document, article)
  return { id, author: info?.authorHandle ?? '', text: info?.text ?? '', time: extractTweetTime(article), conversationId: readConversationId(article, id) }
}

/**
 * 不在这段对话里的推文：帖子页底部「发现更多」推荐的帖子，对话 ID 和主帖的不同。
 * 按主帖处理（不评分、不送 AI），同时从标题栏按钮的计数里去掉。
 */
function outsideThread(article: HTMLElement, thread: ThreadInfo | null): boolean {
  if (!thread?.conversationId) return false
  const id = extractTweetId(article)
  const conversation = id ? readConversationId(article, id) : ''
  if (!conversation || conversation === thread.conversationId) return false
  pageAiItems.delete(id!)
  return true
}

// 被回复推文的 ID 由拦截脚本晚一步写上；写上以后这条回复要重新处理，送模型的内容才带得上被回复的评论
const REPLY_KEY_ATTR = 'data-xf-reply-key'

function replyKey(article: HTMLElement): string {
  return article.getAttribute(REPLY_TO_ATTR) ?? '?'
}

/** 调试条加上当前的 AI 结果版本和被回复推文，扫描时据此判断要不要重画 */
function showDebugBar(article: HTMLElement, evaluation: SpamEvaluation, config: SpamConfig, ai?: AiDisplay) {
  ensureBar(article, evaluation, config, ai)
  const bar = article.querySelector(`#${DEBUG_BAR_ID}`)
  bar?.setAttribute(AI_VERSION_ATTR, String(aiScorer.version()))
  bar?.setAttribute(REPLY_KEY_ATTR, replyKey(article))
}

// ---------- AI 判断：本页状态 ----------

interface PageAiItem {
  item: ReplyScoreItem
  parent: ReplyScoreParent
}

/** 本页（按地址）见过的、可以送 AI 判断的回复：标题栏按钮的计数和手动判断都用它 */
const pageAiItems = new Map<string, PageAiItem>()
/** 本页见过的评论正文，按推文 ID：回复别人评论的回复，要把那条评论一起送给模型 */
const pageComments = new Map<string, ReplyScoreTarget>()
/** 本页点过「展开」的回复，不再折叠 */
const expandedIds = new Set<string>()
/** 已经计过折叠数的回复，同一条只算一次 */
const foldReported = new Set<string>()
let pageAiPath = ''
let expandVersion = 0

function syncAiPage() {
  const path = location.pathname
  if (path === pageAiPath) return
  pageAiPath = path
  pageAiItems.clear()
  pageComments.clear()
  expandedIds.clear()
}

function rememberComment(article: HTMLElement, info: TweetInfo) {
  const id = extractTweetId(article)
  if (id && info.text) pageComments.set(id, { author: info.authorHandle, text: info.text })
}

/**
 * 这条回复回的评论；直接回主帖、或还不知道回的是哪条时返回 null。
 * 被回复的评论在页面上一般排在这条上面，已经记下了；没记下时只送作者。
 */
function replyTargetOf(article: HTMLElement, id: string, thread: ThreadInfo): ReplyScoreTarget | null {
  const target = readReplyTarget(article, id)
  if (!target || target.id === thread.id) return null
  return pageComments.get(target.id) ?? { author: target.author, text: '' }
}

function setExpanded(id: string, expanded: boolean) {
  if (expanded) expandedIds.add(id)
  else expandedIds.delete(id)
  expandVersion++
  void runScan()
}

function sendToBackground(message: Record<string, unknown>) {
  try {
    void browser.runtime.sendMessage?.(message)?.catch?.(() => {})
  } catch {
    // 插件更新后旧页面连不上后台，忽略
  }
}

/**
 * 这条回复的 AI 判断状态；不送模型时返回 undefined。
 * 规则已经会隐藏的、主帖、主帖作者的回复、自己的回复、纯图片回复不送。
 */
function aiDisplayFor(
  article: HTMLElement,
  info: TweetInfo,
  evaluation: SpamEvaluation,
  config: SpamConfig,
  thread: ThreadInfo | null,
): AiEntry | undefined {
  if (!config.ai || !thread) return undefined
  if (evaluation.score >= config.threshold || !info.text) return undefined
  const id = extractTweetId(article)
  if (!id || id === thread.id) return undefined
  const handle = info.authorHandle.toLowerCase()
  if (thread.author && handle === thread.author.toLowerCase()) return undefined
  const own = getOwnHandle()?.toLowerCase() || ''
  if (own && handle === own) return undefined
  const item: ReplyScoreItem = {
    id,
    author: info.authorHandle,
    text: info.text,
    delaySeconds: replyDelaySeconds(thread.time, extractTweetTime(article)),
    followers: knownFollowerCount(info.authorHandle, extractAuthorNameElement(article)),
    verified: extractAuthorVerified(article),
  }
  const replyTo = replyTargetOf(article, id, thread)
  if (replyTo) item.replyTo = replyTo
  const parent: ReplyScoreParent = { id: thread.id, author: thread.author, text: thread.text }
  // 账号标过机器人：直接折叠，不自动送模型，也不算进标题栏按钮的条数；这条单独标了真人的照常判断
  const account = isBotAccount(config, info.authorHandle) && aiScorer.label(id) !== 'human'
  if (account) pageAiItems.delete(id)
  else pageAiItems.set(id, { item, parent })
  return { id, item, parent, account, display: aiScorer.request(item, parent, !account && isAutoThread(config, thread)) }
}

interface AiEntry extends PageAiItem {
  id: string
  /** 作者是标过机器人的账号，且这条没有标真人 */
  account: boolean
  display: AiDisplay
}

function isBotAccount(config: SpamConfig, handle: string): boolean {
  return Boolean(handle && config.ai?.botAccounts.has(handle.toLowerCase()))
}

/**
 * 用户点了「机器人 / 真人」（next 为 null 是撤销）：标成机器人时清掉这条的「展开」状态，让它马上折叠。
 * own 是这条自己的标注，shown 是按钮上亮着的（只因账号折叠时是 bot）。
 * 账号跟着「机器人」走：标机器人时记下账号；撤销亮着的「机器人」，或把这条的机器人改成真人时移出。
 * 只因账号折叠的那条标真人，只放出这一条，账号不变。
 * 本页先改，后台写好列表后其他页面跟着重扫。
 */
function applyLabel(ai: AiEntry, next: ReplyLabel | null, own: ReplyLabel | undefined, shown: ReplyLabel | undefined, config: SpamConfig) {
  if (next === 'bot' && expandedIds.delete(ai.id)) expandVersion++
  const botAccount = next === 'bot' ? true
    : (next === null ? shown === 'bot' : own === 'bot') ? false
    : undefined
  const handle = ai.item.author.toLowerCase()
  if (botAccount === true) config.ai?.botAccounts.add(handle)
  if (botAccount === false) config.ai?.botAccounts.delete(handle)
  const done = ai.display.status === 'done' ? ai.display : undefined
  aiScorer.setLabel({
    id: ai.id,
    label: next,
    item: ai.item,
    parent: ai.parent,
    ai: done ? { score: done.score, signals: done.signals, reason: done.reason } : null,
    ...(botAccount === undefined ? {} : { botAccount }),
  })
  void runScan()
}

/** 这段对话在不在自动判断范围内 */
function isAutoThread(config: SpamConfig, thread: ThreadInfo | null): boolean {
  if (!config.ai || !thread) return false
  if (config.ai.autoScope === 'all') return true
  const own = getOwnHandle()?.toLowerCase() || ''
  return config.ai.autoScope === 'own' && Boolean(own) && thread.author.toLowerCase() === own
}

function hiddenState(article: HTMLElement): 'rule' | 'ai' | 'show' {
  if (article.getAttribute(STATE_ATTR) !== 'hidden') return 'show'
  return article.getAttribute(HIDDEN_BY_ATTR) === 'ai' ? 'ai' : 'rule'
}

/** AI 折叠的回复前面应该有折叠条；X 重绘时可能把它弄丢 */
function foldBarMissing(article: HTMLElement): boolean {
  return hiddenState(article) === 'ai' && !article.previousElementSibling?.matches?.('[data-xf-spam-hidden-replacement]')
}

async function processArticle(article: HTMLElement, config: SpamConfig, thread: ThreadInfo | null = null) {
  // 轻量级预指纹短路（非 debug）：
  // 在昂贵的 extractTweetInfo（TreeWalker 遍历 DOM）之前，用 textContent 长度 +
  // 首尾 16 字符 + 配置版本快速判断推文是否已变更。
  // 注意：使用 textContent 而非 innerText，因为 textContent 不会触发强制回流（reflow）。
  // 指纹匹配 → 跳过整条处理链路（含 TreeWalk + evaluateSpam），节省大量 CPU。
  // AI 结果、展开状态、被回复推文变了也要重新处理。
  if (!config.debug) {
    const rawText = article.textContent || ''
    const aiKey = config.ai ? `:a${aiScorer.version()}:e${expandVersion}:r${replyKey(article)}` : ''
    const preFp = `${rawText.length}:${rawText.slice(0, 16)}:${rawText.slice(-16)}:v${spamConfigVersion}${aiKey}`
    if (article.getAttribute(PROCESSED_ATTR) === '1' && article.getAttribute(SPAM_FP_ATTR) === preFp && !foldBarMissing(article)) {
      return
    }
    article.setAttribute(SPAM_FP_ATTR, preFp)
  }

  // X 推文分阶段渲染；每轮重评估能避免初次拿到不完整 text/name。
  const info = extractTweetInfo(document, article)
  if (!info) return
  if (config.ai) rememberComment(article, info)

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
          source: 'rule',
        })
      }
      applyHideDirect(article)
      article.setAttribute(HIDDEN_BY_ATTR, 'rule')
      ensureScoreTag(article, undefined)
    }
    return
  }

  if (info.authorHandle && config.whitelist.has(info.authorHandle.toLowerCase())) {
    if (article.getAttribute(STATE_ATTR)) applyAllow(article)
    ensureScoreTag(article, undefined)
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
  const ai = aiDisplayFor(article, info, evaluation, config, thread)

  // 调试模式：只画调试条，不隐藏、不折叠
  if (config.debug) {
    if (article.getAttribute(STATE_ATTR) === 'hidden') applyAllow(article)
    ensureScoreTag(article, undefined)
    showDebugBar(article, evaluation, config, ai?.display)
    return
  }

  // 规则分数达到阈值：直接隐藏；否则 AI 分数达到阈值：折叠（点过「展开」的除外）
  // 用户标注优先：标了「真人」不折叠，标了「机器人」直接折叠（没有分数也折叠）
  // 账号标过机器人、这条没有单独标注：按标了「机器人」处理
  const done = ai?.display.status === 'done' ? ai.display : undefined
  const ownLabel = ai ? aiScorer.label(ai.id) : undefined
  const byAccount = Boolean(ai?.account && ownLabel === undefined)
  const label = ownLabel ?? (byAccount ? 'bot' : undefined)
  const wouldFold = Boolean(ai && config.ai && (label === 'bot' || (label !== 'human' && done && done.score >= config.ai.threshold)))
  const expanded = wouldFold && expandedIds.has(ai!.id)
  const want = shouldHide ? 'rule' : wouldFold && !expanded ? 'ai' : 'show'
  const current = hiddenState(article)
  const foldKey = want === 'ai' ? foldBarKey(done, label, byAccount) : ''
  const staleFold = want === 'ai' && current === 'ai' && article.previousElementSibling?.getAttribute('data-xf-fold-key') !== foldKey
  const onLabel = ai ? (next: ReplyLabel | null) => applyLabel(ai, next, ownLabel, label, config) : undefined

  if (want !== current || foldBarMissing(article) || staleFold) {
    applyAllow(article)
    if (want === 'rule') {
      void recordIntercept({
        authorHandle: info.authorHandle,
        authorName: info.authorName,
        text: info.text,
        score: evaluation.score,
        category: evaluation.category,
        hits: evaluation.hits,
        action: 'filter',
        source: 'rule',
      })
      applyHideDirect(article)
      article.setAttribute(HIDDEN_BY_ATTR, 'rule')
    } else if (want === 'ai' && ai) {
      if (current !== 'ai') {
        void recordIntercept({
          authorHandle: info.authorHandle,
          authorName: info.authorName,
          text: info.text,
          score: evaluation.score,
          category: 'ai',
          hits: [],
          action: 'filter',
          source: 'ai',
          ai: { score: done?.score ?? null, signals: done?.signals ?? [], reason: done?.reason ?? '', label, ...(byAccount ? { account: true } : {}) },
        })
        if (!foldReported.has(ai.id)) {
          foldReported.add(ai.id)
          sendToBackground({ type: REPLY_SCORE_FOLDED })
        }
      }
      applyReplace(article, buildFoldBar({ display: done, handle: info.authorHandle, label, account: byAccount, onExpand: () => setExpanded(ai.id, true), onLabel }))
      article.previousElementSibling?.setAttribute('data-xf-fold-key', foldKey)
      article.setAttribute(HIDDEN_BY_ATTR, 'ai')
    }
  }

  // 显示出来的回复带分数标签和标注按钮；展开过的折叠回复后面加「收起」
  ensureScoreTag(article, want === 'show' ? ai?.display : undefined, {
    label,
    account: byAccount,
    onLabel,
    onCollapse: expanded ? () => setExpanded(ai!.id, false) : undefined,
  })
}

export function invalidateSpamConfig(options: { keepAiPause?: boolean } = {}) {
  invalidateSpamConfigCache()
  spamConfigVersion++
  // 设置或 AI 连接改了：解除 AI 判断的暂停，失败次数清零（只是机器人账号列表变了时不用）
  if (!options.keepAiPause) aiScorer.reset()
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
  const idle = (window as any).requestIdleCallback as ((cb: () => void, options: { timeout: number }) => void) | undefined
  if (idle) {
    idle(() => {
      scanScheduled = false
      void runScan()
    }, { timeout: 200 })
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
  // 主帖正文取到一次就够了；正文为空时（页面还没渲染完）再取。对话 ID 由拦截脚本晚一步写上，没有时再读
  const main = articles[mainIndex]
  if (!memory.thread?.text) memory.thread = threadOf(main) ?? memory.thread
  else if (!memory.thread.conversationId) memory.thread.conversationId = readConversationId(main, memory.thread.id)
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
    ensureScoreTag(el, undefined)
    el.removeAttribute(PROCESSED_ATTR)
    el.removeAttribute(SCORE_ATTR)
  })
}

function clearPageSpamState() {
  cleanupDebugBars()
  removeScrollStabilityStyles()
  cleanupOrphanReplacements()
  resetSpamArtifactsOutside(new Set())
  removeAiBadges()
}

function openAiSettings() {
  sendToBackground({ type: OPEN_SETTINGS, module: 'settings' })
}

/**
 * 帖子页标题栏上的 AI 按钮：显示本页判断了多少条、暂停原因；
 * 不在自动范围内（或今天的自动额度用完）时，点一下手动判断本页还没判断的回复。
 */
function updateAiPill(config: SpamConfig, thread: ThreadInfo | null) {
  const row = config.ai ? findHeaderRow() : null
  if (!row || !config.ai) {
    ensureAiPill(null, null, () => {})
    return
  }
  let done = 0
  let pending = 0
  const waiting: PageAiItem[] = []
  for (const entry of pageAiItems.values()) {
    const state = aiScorer.peek(entry.item.id)
    if (state === 'done') done += 1
    else if (state === 'pending') pending += 1
    else waiting.push(entry)
  }
  const { paused, busy } = aiScorer.status()
  const auto = isAutoThread(config, thread)
  const next = Math.min(waiting.length, REPLY_SCORE_BATCH_SIZE)
  const judgeWaiting = () => {
    if (aiScorer.manual(waiting)) void runScan()
  }

  let state: AiPillState | null
  let onClick = judgeWaiting
  if (busy || pending) {
    state = { text: t('spamPage.aiPillBusy', { done, total: done + pending }), title: t('spamPage.aiPillBusyHint', { done, pending }), busy: true, clickable: false }
  } else if (paused?.reason === 'needsConfig') {
    state = { text: t('spamPage.aiPillNeedsConfig'), title: errorText(paused.error, 'error.aiFailed'), tone: 'warn', clickable: true }
    onClick = openAiSettings
  } else if (paused?.reason === 'error') {
    const error = describeAiError(paused.error)
    state = { text: t('aiError.pill', { reason: error.summary }), title: `${error.guidance}\n${error.detail}`, error, tone: 'warn', clickable: true }
    onClick = error.action === 'refresh' ? () => location.reload()
      : error.action === 'settings' ? openAiSettings : judgeWaiting
  } else if (next && paused?.reason === 'limit') {
    state = { text: t('spamPage.aiPillLimit', { count: next }), clickable: true }
  } else if (next && !auto) {
    state = { text: t('spamPage.aiPillManual', { count: next }), clickable: true }
  } else if (next) {
    // 自动范围内还剩没结果的：试过 2 次都失败的
    state = { text: t('spamPage.aiPillRetry', { done, count: next }), clickable: true }
  } else if (done) {
    state = { text: t('spamPage.aiPillDone', { done }), clickable: false }
  } else {
    state = auto ? { text: t('spamPage.aiPillAuto'), clickable: false } : null
  }
  ensureAiPill(row, state, onClick)
}

function scanScope(scope: ScanScope, config: SpamConfig, force: boolean, debugConfigKey: string) {
  const aiVersion = String(aiScorer.version())
  for (const article of scope.articles) {
    if (article.closest('[data-xf-spam-hidden-replacement]')) continue
    if (config.debug && isInsideDialog(article)) removeDebugBar(article)

    // 主贴（及主贴前置上下文）、不在这段对话里的推文（「发现更多」）：不进入评分体系、不展示调试条
    if (scope.nonReplies.has(article) || outsideThread(article, scope.thread)) {
      removeDebugBar(article)
      ensureScoreTag(article, undefined)
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
        bar.getAttribute(AI_VERSION_ATTR) === aiVersion &&
        bar.getAttribute(REPLY_KEY_ATTR) === replyKey(article)
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
    removeAiBadges()
    return
  }

  // AI 判断没开时清掉排队中的请求和页面上的 AI 标签
  if (!config.ai) {
    aiScorer.stop()
    removeAiBadges()
  }
  syncAiPage()

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

  // 标题栏按钮只放在帖子详情页（Deck 对话栏里照常自动判断，但没有这个按钮）
  if (isDetailPage) updateAiPill(config, scopes[0]?.thread ?? null)
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
  removeAiBadges()
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
let replyTargetListener: (() => void) | null = null
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

  // 拦截脚本写上被回复推文后重扫（属性变化不触发上面的监听）
  if (!replyTargetListener && typeof window !== 'undefined') {
    replyTargetListener = () => void scheduleScan()
    window.addEventListener(REPLY_TARGET_EVENT, replyTargetListener)
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
  if (replyTargetListener && typeof window !== 'undefined') {
    window.removeEventListener(REPLY_TARGET_EVENT, replyTargetListener)
    replyTargetListener = null
  }
  stopAiListener?.()
  stopAiListener = null
  aiScorer.stop()
  removeScrollStabilityStyles()
}
