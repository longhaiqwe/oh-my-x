import { sendAiRequest } from '../../shared/ai-request'
import {
  KeyAiRepostApiKey,
  KeyAiRepostBaseUrl,
  KeyAiRepostEnabled,
  KeyAiRepostModel,
  defaultPreferences,
} from '../../storage-keys'
import { collectVisibleText } from '../../shared/parse-tweet'
import type { AiRepostOptionsResult, RepostSourceInput } from '../../shared/ai-repost'
import selectors from '../selectors'
import { getPrecomposeUrl } from '../options/precompose'
import addStyles from '../utilities/addStyles'
import { ACCENT, ACCENT_TEXT, accentAlpha } from '../utilities/colors'
import { getStorage, setStorage } from '../utilities/storage'
import { getLocale, t } from '../../shared/i18n'
import { errorText, type TransferableError } from '../../shared/errors'

const STYLE_ID = 'xf-ai-repost-styles'

const AI_REPOST_STYLES = `
.xf-ai-repost-trigger {
  display: inline-flex !important;
  align-items: center !important;
  gap: 4px !important;
  height: 24px !important;
  padding: 0 10px !important;
  margin-left: 8px !important;
  border-radius: 9999px !important;
  border: 1px solid ${accentAlpha(0.45)} !important;
  background: ${accentAlpha(0.08)} !important;
  color: ${ACCENT} !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  line-height: 1 !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
  cursor: pointer !important;
  user-select: none !important;
  transition: background 0.15s ease, border-color 0.15s ease !important;
  vertical-align: middle !important;
  flex-shrink: 0 !important;
}
.xf-ai-repost-trigger:hover {
  background: ${accentAlpha(0.16)} !important;
  border-color: ${ACCENT} !important;
}
.xf-ai-repost-trigger:disabled {
  opacity: 0.6 !important;
  cursor: wait !important;
}
.xf-ai-repost-trigger svg {
  width: 13px !important;
  height: 13px !important;
  flex-shrink: 0 !important;
}
.xf-ai-repost-audience-row {
  display: inline-flex !important;
  flex-direction: row !important;
  align-items: center !important;
  flex-wrap: nowrap !important;
  gap: 8px !important;
  width: auto !important;
  height: auto !important;
  vertical-align: middle !important;
}
.xf-ai-repost-audience-row > * {
  display: inline-flex !important;
  align-items: center !important;
  flex-shrink: 0 !important;
}
.xf-ai-repost-audience-row .xf-ai-repost-trigger {
  margin-left: 0 !important;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}
.xf-ai-repost-fallback-bar {
  display: flex !important;
  align-items: center !important;
  padding: 4px 0 6px 0 !important;
}
.xf-ai-repost-fallback-bar .xf-ai-repost-trigger {
  margin-left: 0 !important;
}

.xf-ai-repost-panel {
  margin: 8px 0 10px 0 !important;
  padding: 10px 12px !important;
  border-radius: 12px !important;
  border: 1px solid rgba(128, 128, 128, 0.25) !important;
  background: rgba(247, 249, 249, 0.96) !important;
  color: #0f1419 !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
  font-size: 13px !important;
  box-sizing: border-box !important;
}
@media (prefers-color-scheme: dark) {
  .xf-ai-repost-panel {
    background: rgba(22, 24, 28, 0.95) !important;
    color: #e7e9ea !important;
    border-color: rgba(255, 255, 255, 0.16) !important;
  }
}
body[style*="background-color: rgb(0, 0, 0)"] .xf-ai-repost-panel {
  background: rgba(22, 24, 28, 0.96) !important;
  color: #e7e9ea !important;
  border-color: rgba(255, 255, 255, 0.18) !important;
}
body[style*="background-color: rgb(21, 32, 43)"] .xf-ai-repost-panel {
  background: rgba(30, 39, 50, 0.96) !important;
  color: #f7f9f9 !important;
  border-color: rgba(255, 255, 255, 0.16) !important;
}

.xf-ai-repost-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  margin-bottom: 8px !important;
}
.xf-ai-repost-title {
  font-size: 12px !important;
  font-weight: 600 !important;
  opacity: 0.85 !important;
}
.xf-ai-repost-actions {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
}
.xf-ai-repost-action-btn {
  background: transparent !important;
  border: 1px solid rgba(128, 128, 128, 0.3) !important;
  border-radius: 6px !important;
  padding: 2px 8px !important;
  font-size: 11px !important;
  color: inherit !important;
  cursor: pointer !important;
  opacity: 0.85 !important;
}
.xf-ai-repost-action-btn:hover {
  opacity: 1 !important;
  border-color: ${ACCENT} !important;
  color: ${ACCENT} !important;
}

.xf-ai-repost-options {
  display: flex !important;
  flex-direction: column !important;
  gap: 8px !important;
}
.xf-ai-repost-card {
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
  padding: 8px 10px !important;
  border-radius: 8px !important;
  border: 1px solid rgba(128, 128, 128, 0.24) !important;
  background: rgba(128, 128, 128, 0.05) !important;
  cursor: pointer !important;
  text-align: left !important;
  transition: border-color 0.15s ease, background 0.15s ease !important;
}
.xf-ai-repost-card:hover {
  border-color: ${accentAlpha(0.65)} !important;
  background: ${accentAlpha(0.06)} !important;
}
.xf-ai-repost-card.is-selected {
  border-color: ${ACCENT} !important;
  background: ${accentAlpha(0.1)} !important;
}
.xf-ai-repost-card-tag {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  color: ${ACCENT} !important;
}
.xf-ai-repost-card-body {
  font-size: 13px !important;
  line-height: 1.45 !important;
  white-space: pre-wrap !important;
  word-break: break-word !important;
}
.xf-ai-repost-status {
  font-size: 12px !important;
  line-height: 1.4 !important;
  padding: 6px 2px !important;
  opacity: 0.85 !important;
}
.xf-ai-repost-error {
  color: #f4212e !important;
  opacity: 1 !important;
}

.xf-ai-repost-config {
  display: flex !important;
  flex-direction: column !important;
  gap: 6px !important;
  padding-top: 4px !important;
}
.xf-ai-repost-config-row {
  display: flex !important;
  flex-direction: column !important;
  gap: 2px !important;
}
.xf-ai-repost-config-row label {
  font-size: 11px !important;
  opacity: 0.8 !important;
}
.xf-ai-repost-input {
  width: 100% !important;
  height: 28px !important;
  padding: 0 8px !important;
  border-radius: 6px !important;
  border: 1px solid rgba(128, 128, 128, 0.35) !important;
  background: transparent !important;
  color: inherit !important;
  font-size: 12px !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace !important;
  box-sizing: border-box !important;
  outline: none !important;
}
.xf-ai-repost-input:focus {
  border-color: ${ACCENT} !important;
}
.xf-ai-repost-config-actions {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  margin-top: 4px !important;
}
.xf-ai-repost-save-btn {
  padding: 4px 12px !important;
  border-radius: 6px !important;
  border: 0 !important;
  background: ${ACCENT} !important;
  color: ${ACCENT_TEXT} !important;
  font-size: 12px !important;
  font-weight: 600 !important;
  cursor: pointer !important;
}
.xf-ai-repost-test-btn {
  padding: 4px 10px !important;
  border-radius: 6px !important;
  border: 1px solid rgba(128, 128, 128, 0.35) !important;
  background: transparent !important;
  color: inherit !important;
  font-size: 12px !important;
  cursor: pointer !important;
}
.xf-ai-repost-test-btn:hover {
  border-color: ${ACCENT} !important;
  color: ${ACCENT} !important;
}
.xf-ai-repost-test-btn:disabled, .xf-ai-repost-save-btn:disabled {
  opacity: 0.5 !important;
  cursor: wait !important;
}
.xf-ai-repost-test-feedback {
  font-size: 11px !important;
  line-height: 1.3 !important;
}
.xf-ai-repost-test-feedback.is-ok {
  color: #00ba7c !important;
}
.xf-ai-repost-test-feedback.is-err {
  color: #f4212e !important;
}
`

interface CachedClickedTweet {
  tweetId?: string
  authorName?: string
  authorHandle?: string
  title?: string
  text: string
  timestamp: number
}

let lastInteractedTweet: CachedClickedTweet | null = null
let clickCaptureInstalled = false
let stylesAdded = false

function ensureStyles() {
  if (!stylesAdded) {
    addStyles(STYLE_ID, AI_REPOST_STYLES)
    stylesAdded = true
  }
}

/**
 * 提取链接中的 statusId 或 articleId
 */
export function extractTweetIdFromUrl(urlStr: string | null | undefined): string | null {
  if (!urlStr) return null
  const m = urlStr.match(/\/(?:status|article)\/(\d+)/)
  return m?.[1] || null
}

/**
 * 从页面上的 article[data-testid="tweet"] 提取推文快照
 */
export function extractTweetSnapshotFromArticle(article: HTMLElement): CachedClickedTweet | null {
  const doc = article.ownerDocument || document
  let tweetId: string | undefined
  const timeLink = article.querySelector('time')?.closest<HTMLAnchorElement>('a')
  if (timeLink) {
    tweetId = extractTweetIdFromUrl(timeLink.getAttribute('href')) || undefined
  }
  if (!tweetId) {
    const links = Array.from(
      article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"], a[href*="/article/"]'),
    )
    for (const a of links) {
      const id = extractTweetIdFromUrl(a.getAttribute('href'))
      if (id) {
        tweetId = id
        break
      }
    }
  }

  const userNameEl = article.querySelector<HTMLElement>('[data-testid="User-Name"]')
  const authorName = collectVisibleText(doc, userNameEl)
  let authorHandle = ''
  if (userNameEl) {
    const handleMatch = userNameEl.textContent?.match(/@([A-Za-z0-9_]{1,15})/)
    if (handleMatch?.[1]) authorHandle = handleMatch[1]
  }

  const titleEl = article.querySelector<HTMLElement>('[data-testid="twitter-article-title"]')
  const title = collectVisibleText(doc, titleEl) || undefined

  const textEls = Array.from(article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]'))
  const textParts = textEls.map((el) => collectVisibleText(doc, el)).filter(Boolean)

  const articleBodyEl =
    article.querySelector<HTMLElement>('[data-testid="twitterArticleRichTextView"]') ||
    article.querySelector<HTMLElement>('[data-testid="twitterArticleReadView"]')
  const articleBody = collectVisibleText(doc, articleBodyEl)
  if (articleBody) textParts.push(articleBody)

  const combinedText = textParts.join('\n\n').trim()
  if (!combinedText && !title && !tweetId) return null

  return {
    tweetId,
    authorName: authorName || undefined,
    authorHandle: authorHandle || undefined,
    title,
    text: combinedText || title || '',
    timestamp: Date.now(),
  }
}

/**
 * 监听用户在页面上点击推文区域的动作（例如点击转发 -> 引用），
 * 以便弹窗打开时能关联到刚才点击的原推文。
 */
export function attachRepostSourceCapture() {
  if (clickCaptureInstalled || typeof document === 'undefined') return
  clickCaptureInstalled = true

  document.addEventListener(
    'click',
    (ev) => {
      try {
        const target = ev.target as HTMLElement | null
        if (!target) return
        if (target.closest('[role="dialog"]')) return

        const article = target.closest<HTMLElement>('article[data-testid="tweet"]')
        if (article) {
          const snap = extractTweetSnapshotFromArticle(article)
          if (snap) {
            lastInteractedTweet = snap
          }
        }
      } catch {
        // ignore
      }
    },
    true,
  )
}

/**
 * 在发帖/引用弹窗中查找编辑器元素
 */
export function findComposeEditor(modalEl: HTMLElement): HTMLElement | null {
  const localDraft = modalEl.querySelector<HTMLElement>(
    '.DraftEditor-editorContainer [contenteditable="true"]',
  )
  if (localDraft) return localDraft

  const testEditor = modalEl.querySelector<HTMLElement>(
    '[data-testid^="tweetTextarea"][contenteditable="true"], [data-testid^="tweetTextarea"] [contenteditable="true"], [data-testid^="tweetTextarea"]',
  )
  return testEditor || null
}

/**
 * 在弹窗内定位受众选择按钮（即附图中的「每个人 ∨」/「Everyone ∨」），
 * 以便将 AI 总结按钮紧贴其右侧（附图红框位置）注入。
 */
export function findAudienceButtonInModal(modalEl: HTMLElement): HTMLElement | null {
  const editor = findComposeEditor(modalEl)
  const buttons = Array.from(
    modalEl.querySelectorAll<HTMLElement>('button, [role="button"]'),
  )

  const AUDIENCE_TEXT_RE =
    /^(每个人|所有人|Everyone|All|Circle|圈子|订阅者|Subscribers|仅自己)/i

  for (const btn of buttons) {
    if (btn.classList.contains('xf-ai-repost-trigger')) continue
    if (btn.closest('.xf-ai-repost-panel')) continue

    // 排除顶栏的关闭按钮与草稿按钮
    const testId = btn.getAttribute('data-testid') || ''
    if (
      testId === 'app-bar-close' ||
      testId === 'unsentButton' ||
      testId === 'tweetButton' ||
      testId === 'tweetButtonInline'
    ) {
      continue
    }

    // 受众按钮必须在编辑器之前出现（DOM 顺序位于编辑器上方）
    if (
      editor &&
      Boolean(btn.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_PRECEDING)
    ) {
      continue
    }

    const label = (btn.getAttribute('aria-label') || '').trim()
    const text = (btn.textContent || '').trim()
    const hasMenuPopup = btn.getAttribute('aria-haspopup') === 'menu' || btn.getAttribute('aria-haspopup') === 'listbox'

    if (
      AUDIENCE_TEXT_RE.test(text) ||
      /audience|受众|谁可以/i.test(label) ||
      (hasMenuPopup && text.length > 0 && text.length <= 16)
    ) {
      return btn
    }
  }

  return null
}

/**
 * 从当前发帖弹窗、当前详情页以及历史点击快照中提取被转发的原文信息
 */
export function extractLocalRepostSource(modalEl: HTMLElement): {
  source: RepostSourceInput | null
  tweetId: string | null
} {
  const doc = modalEl.ownerDocument || document
  const editor = findComposeEditor(modalEl)
  const editorRoot =
    editor?.closest('[data-testid="tweetTextarea_0_label"]') ||
    editor?.closest('.DraftEditor-root') ||
    editor

  // 1. 扫描弹窗内部被引用的推文卡片（排除编辑器自身和插件面板）
  const modalTweetTexts = Array.from(
    modalEl.querySelectorAll<HTMLElement>(
      '[data-testid="tweetText"], [data-testid="twitter-article-title"], [data-testid="card.wrapper"]',
    ),
  ).filter((el) => {
    if (el.closest('.xf-ai-repost-panel')) return false
    if (editorRoot && editorRoot.contains(el)) return false
    return true
  })

  const modalUserNames = Array.from(
    modalEl.querySelectorAll<HTMLElement>('[data-testid="User-Name"]'),
  ).filter((el) => !el.closest('.xf-ai-repost-panel'))

  let quotedText = modalTweetTexts
    .map((el) => collectVisibleText(doc, el))
    .filter(Boolean)
    .join('\n\n')
    .trim()

  // 如果引用卡片没有使用 data-testid="tweetText"（例如部分 Quote 卡片使用角色容器包裹 User-Name 和正文）
  if (!quotedText && modalUserNames.length > 0) {
    const quoteUserEl = modalUserNames[0]
    // 向上找到引用卡片容器（不含编辑器的独立子树）
    let cardContainer: HTMLElement | null = quoteUserEl.parentElement
    while (
      cardContainer &&
      cardContainer !== modalEl &&
      (!editorRoot || !cardContainer.contains(editorRoot))
    ) {
      if (
        cardContainer.getAttribute('role') === 'link' ||
        cardContainer.parentElement?.contains(editorRoot || null)
      ) {
        break
      }
      cardContainer = cardContainer.parentElement
    }
    if (cardContainer && cardContainer !== modalEl) {
      const fullCardText = collectVisibleText(doc, cardContainer)
      const userHeaderText = collectVisibleText(doc, quoteUserEl)
      quotedText = fullCardText.replace(userHeaderText, '').trim()
    }
  }

  let authorName = ''
  let authorHandle = ''
  if (modalUserNames.length > 0) {
    authorName = collectVisibleText(doc, modalUserNames[0])
    const m = modalUserNames[0].textContent?.match(/@([A-Za-z0-9_]{1,15})/)
    if (m?.[1]) authorHandle = m[1]
  }

  // 提取弹窗内可能包含的 status/article ID
  let tweetId: string | null = modalEl.getAttribute('data-xf-quoted-tweet-id')
  if (!tweetId) {
    const modalLinks = Array.from(
      modalEl.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"], a[href*="/article/"]'),
    )
    for (const a of modalLinks) {
      const id = extractTweetIdFromUrl(a.getAttribute('href'))
      if (id) {
        tweetId = id
        break
      }
    }
  }

  // 检查编辑器里是否已经粘贴了推文链接
  if (!tweetId && editor) {
    const editorText = editor.innerText || editor.textContent || ''
    tweetId = extractTweetIdFromUrl(editorText)
  }

  // 2. 检查当前页面是否正处于长文阅读页或推文详情页
  let pageTitle = ''
  let pageBody = ''
  const articleTitleEl = doc.querySelector<HTMLElement>(
    '[data-testid="twitter-article-title"], [data-testid="twitterArticleReadView"] h1',
  )
  const articleViewEl = doc.querySelector<HTMLElement>(
    '[data-testid="twitterArticleRichTextView"], [data-testid="twitterArticleReadView"]',
  )
  if (articleTitleEl) pageTitle = collectVisibleText(doc, articleTitleEl)
  if (articleViewEl) pageBody = collectVisibleText(doc, articleViewEl)

  if (!pageBody) {
    const mainArticle = doc.querySelector<HTMLElement>('article[data-testid="tweet"]')
    if (mainArticle && !modalEl.contains(mainArticle)) {
      const snap = extractTweetSnapshotFromArticle(mainArticle)
      if (snap && isTweetDetailUrl(window.location.href)) {
        pageTitle = pageTitle || snap.title || ''
        pageBody = snap.text
        if (!authorName && snap.authorName) authorName = snap.authorName
        if (!authorHandle && snap.authorHandle) authorHandle = snap.authorHandle
        if (!tweetId && snap.tweetId) tweetId = snap.tweetId
      }
    }
  }

  // 3. 结合刚点击的推文快照（5 分钟内有效）
  if (
    lastInteractedTweet &&
    Date.now() - lastInteractedTweet.timestamp < 5 * 60 * 1000
  ) {
    if (!tweetId && lastInteractedTweet.tweetId) {
      tweetId = lastInteractedTweet.tweetId
    }
    if (
      lastInteractedTweet.text &&
      lastInteractedTweet.text.length > quotedText.length &&
      (!authorHandle ||
        !lastInteractedTweet.authorHandle ||
        authorHandle.toLowerCase() === lastInteractedTweet.authorHandle.toLowerCase())
    ) {
      quotedText = lastInteractedTweet.text
      authorName = authorName || lastInteractedTweet.authorName || ''
      authorHandle = authorHandle || lastInteractedTweet.authorHandle || ''
      pageTitle = pageTitle || lastInteractedTweet.title || ''
    }
  }

  // 4. 结合 precompose URL 捕获到的推文 ID
  if (!tweetId) {
    tweetId =
      extractTweetIdFromUrl(window.location.href) ||
      extractTweetIdFromUrl(getPrecomposeUrl())
  }

  // 如果当前详情页长文比弹窗截断预览更长，优先采用完整长文
  const bestText =
    pageBody.length > quotedText.length ? pageBody : quotedText

  if (!bestText && !pageTitle) {
    return { source: null, tweetId }
  }

  return {
    source: {
      authorName: authorName || undefined,
      authorHandle: authorHandle || undefined,
      title: pageTitle || undefined,
      text: bestText || pageTitle,
    },
    tweetId,
  }
}

function isTweetDetailUrl(urlStr: string): boolean {
  return /\/(?:status|article)\/\d+/.test(urlStr)
}

/**
 * 将生成的文案直接替换进 X 的 DraftJS 编辑器中（支持多次点击在不同选项间切换预览）
 */
export function replaceComposeEditorText(modalEl: HTMLElement, text: string): boolean {
  const editor = findComposeEditor(modalEl)
  if (!editor) return false

  editor.focus()

  const sel = window.getSelection()
  if (sel) {
    const range = document.createRange()
    range.selectNodeContents(editor)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  try {
    document.execCommand('selectAll', false)
  } catch {
    // ignore
  }

  // 1. 优先派发标准 ClipboardEvent('paste')，让 DraftJS 原生 editOnPaste 接管并替换当前全选内容
  try {
    if (typeof DataTransfer !== 'undefined' && typeof ClipboardEvent !== 'undefined') {
      const dataTransfer = new DataTransfer()
      dataTransfer.setData('text/plain', text)
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: dataTransfer,
        bubbles: true,
        cancelable: true,
        composed: true,
      })
      const handledByDraftJS = !editor.dispatchEvent(pasteEvent)
      if (handledByDraftJS) {
        return true
      }
    }
  } catch {
    // ignore
  }

  // 2. 次优：execCommand('insertText') 替换全选选区
  try {
    const worked = document.execCommand('insertText', false, text)
    if (worked) {
      return true
    }
  } catch {
    // ignore
  }

  // 3. 兜底（非 DraftJS 或测试环境 jsdom）：直接替换文本节点并派发 input 事件
  editor.textContent = text
  editor.dispatchEvent(
    new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }),
  )
  return true
}

/**
 * 解析最终用于 AI 总结的完整原文（本地 DOM + 后台 GraphQL 全文补全）
 */
async function resolveFullRepostSource(modalEl: HTMLElement, signal: AbortSignal): Promise<RepostSourceInput> {
  const { source: localSource, tweetId } = extractLocalRepostSource(modalEl)

  // 当有 tweetId 且本地文本不存在或较短（< 600 字符，可能是引用卡片截断预览）时，尝试从后台 GraphQL 获取全文
  if (tweetId && (!localSource || localSource.text.length < 600)) {
    try {
      const res = (await sendAiRequest({
        type: 'XF_FETCH_TWEET_FULL_TEXT',
        tweetId,
      }, signal)) as { ok?: boolean; source?: RepostSourceInput } | undefined

      if (res?.ok && res.source?.text) {
        if (!localSource || res.source.text.length >= localSource.text.length) {
          return {
            authorName: res.source.authorName || localSource?.authorName,
            authorHandle: res.source.authorHandle || localSource?.authorHandle,
            title: res.source.title || localSource?.title,
            text: res.source.text,
          }
        }
      }
    } catch {
      // ignore and use localSource
    }
  }

  signal.throwIfAborted()
  if (localSource && localSource.text.trim()) {
    return localSource
  }

  throw new Error(t('aiPage.sourceMissing'))
}

/**
 * 在发帖弹窗内渲染或更新双选项面板
 */
function openOrUpdateRepostPanel(
  modalEl: HTMLElement,
  anchorRow: HTMLElement,
  triggerBtn: HTMLButtonElement,
) {
  modalEl.querySelector('.xf-ai-repost-panel')?.dispatchEvent(new Event('xf-ai-close'))
  const panel = document.createElement('div')
  panel.className = 'xf-ai-repost-panel'
  panel.setAttribute('data-testid', 'xf-ai-repost-panel')
  anchorRow.insertAdjacentElement('afterend', panel)
  let closed = false
  let activeRequest: AbortController | undefined
  const beginRequest = () => {
    activeRequest?.abort()
    activeRequest = new AbortController()
    return activeRequest
  }
  const isCurrent = (request: AbortController) => !closed && panel.isConnected && activeRequest === request && !request.signal.aborted
  const closePanel = () => {
    if (closed) return
    closed = true
    activeRequest?.abort()
    triggerBtn.disabled = false
    observer.disconnect()
    window.removeEventListener('pagehide', closePanel)
    panel.remove()
  }
  const observer = new MutationObserver(() => { if (!panel.isConnected) closePanel() })
  observer.observe(document.documentElement, { childList: true, subtree: true })
  panel.addEventListener('xf-ai-close', closePanel)
  window.addEventListener('pagehide', closePanel)

  const renderConfigView = async (errorNotice?: string) => {
    activeRequest?.abort()
    triggerBtn.disabled = false
    const stored = await getStorage([
      KeyAiRepostBaseUrl,
      KeyAiRepostApiKey,
      KeyAiRepostModel,
    ])
    const baseUrl = String(
      stored[KeyAiRepostBaseUrl] || defaultPreferences[KeyAiRepostBaseUrl],
    )
    const apiKey = String(stored[KeyAiRepostApiKey] || '')
    const model = String(
      stored[KeyAiRepostModel] || defaultPreferences[KeyAiRepostModel],
    )

    if (closed || !panel.isConnected) return
    panel.innerHTML = `
      <div class="xf-ai-repost-header">
        <span class="xf-ai-repost-title">${t('aiPage.configTitle')}</span>
        <div class="xf-ai-repost-actions">
          <button type="button" class="xf-ai-repost-action-btn" data-action="close">${t('aiPage.close')}</button>
        </div>
      </div>
      ${errorNotice ? `<div class="xf-ai-repost-status xf-ai-repost-error">${escapeHtml(errorNotice)}</div>` : ''}
      <div class="xf-ai-repost-status">${t('aiPage.privacy')}</div>
      <div class="xf-ai-repost-config">
        <div class="xf-ai-repost-config-row">
          <label>Base URL</label>
          <input type="text" class="xf-ai-repost-input" data-field="baseUrl" value="${escapeHtml(baseUrl)}" placeholder="https://api.openai.com/v1" />
        </div>
        <div class="xf-ai-repost-config-row">
          <label>API Key</label>
          <input type="password" class="xf-ai-repost-input" data-field="apiKey" value="${escapeHtml(apiKey)}" placeholder="sk-..." />
        </div>
        <div class="xf-ai-repost-config-row">
          <label>Model</label>
          <input type="text" class="xf-ai-repost-input" data-field="model" value="${escapeHtml(model)}" placeholder="gpt-4o-mini / deepseek-chat" />
        </div>
        <div class="xf-ai-repost-config-actions">
          <button type="button" class="xf-ai-repost-save-btn" data-action="save-and-run">${t('aiPage.saveAndRun')}</button>
          <button type="button" class="xf-ai-repost-test-btn" data-action="test-connection">${t('aiPage.test')}</button>
        </div>
        <div class="xf-ai-repost-test-feedback" data-field="test-feedback"></div>
      </div>
    `

    panel.querySelector('[data-action="close"]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      closePanel()
    })

    const feedbackEl = panel.querySelector<HTMLElement>('[data-field="test-feedback"]')
    const testBtn = panel.querySelector<HTMLButtonElement>('[data-action="test-connection"]')

    testBtn?.addEventListener('click', async (e) => {
      e.stopPropagation()
      const testBaseUrl =
        panel?.querySelector<HTMLInputElement>('[data-field="baseUrl"]')?.value.trim() ||
        String(defaultPreferences[KeyAiRepostBaseUrl])
      const testApiKey =
        panel?.querySelector<HTMLInputElement>('[data-field="apiKey"]')?.value.trim() || ''
      const testModel =
        panel?.querySelector<HTMLInputElement>('[data-field="model"]')?.value.trim() ||
        String(defaultPreferences[KeyAiRepostModel])

      if (!testApiKey) {
        if (feedbackEl) {
          feedbackEl.className = 'xf-ai-repost-test-feedback is-err'
          feedbackEl.textContent = t('aiPage.needKey')
        }
        return
      }

      if (testBtn) testBtn.disabled = true
      if (feedbackEl) {
        feedbackEl.className = 'xf-ai-repost-test-feedback'
        feedbackEl.textContent = t('aiPage.testing')
      }

      const request = beginRequest()
      try {
        const res = (await sendAiRequest({
          type: 'XF_TEST_AI_CONNECTION',
          config: {
            baseUrl: testBaseUrl,
            apiKey: testApiKey,
            model: testModel,
          },
        }, request.signal)) as { ok?: boolean; error?: TransferableError; model?: string } | undefined
        if (!isCurrent(request)) return

        if (res?.ok) {
          if (feedbackEl) {
            feedbackEl.className = 'xf-ai-repost-test-feedback is-ok'
            feedbackEl.textContent = t('aiPage.connected', { model: res.model || testModel })
          }
        } else {
          if (feedbackEl) {
            feedbackEl.className = 'xf-ai-repost-test-feedback is-err'
            feedbackEl.textContent = t('aiPage.connectFailed', { reason: errorText(res?.error) || t('aiPage.noResponseCheck') })
          }
        }
      } catch (err: any) {
        if (!isCurrent(request)) return
        if (feedbackEl) {
          feedbackEl.className = 'xf-ai-repost-test-feedback is-err'
          feedbackEl.textContent = t('aiPage.exception', { reason: errorText(err) || String(err) })
        }
      } finally {
        if (isCurrent(request) && testBtn) testBtn.disabled = false
      }
    })

    panel.querySelector('[data-action="save-and-run"]')?.addEventListener('click', async (e) => {
      e.stopPropagation()
      const newBaseUrl =
        panel?.querySelector<HTMLInputElement>('[data-field="baseUrl"]')?.value.trim() ||
        String(defaultPreferences[KeyAiRepostBaseUrl])
      const newApiKey =
        panel?.querySelector<HTMLInputElement>('[data-field="apiKey"]')?.value.trim() || ''
      const newModel =
        panel?.querySelector<HTMLInputElement>('[data-field="model"]')?.value.trim() ||
        String(defaultPreferences[KeyAiRepostModel])

      if (!newApiKey) {
        void renderConfigView(t('aiPage.validKey'))
        return
      }

      await setStorage({
        [KeyAiRepostBaseUrl]: newBaseUrl,
        [KeyAiRepostApiKey]: newApiKey,
        [KeyAiRepostModel]: newModel,
      })

      if (closed || !panel.isConnected) return
      void runGeneration({
        baseUrl: newBaseUrl,
        apiKey: newApiKey,
        model: newModel,
      })
    })
  }

  const renderOptionsView = (options: AiRepostOptionsResult) => {
    if (closed || !panel.isConnected) return
    panel.innerHTML = `
      <div class="xf-ai-repost-header">
        <span class="xf-ai-repost-title">${t('aiPage.pickTitle')}</span>
        <div class="xf-ai-repost-actions">
          <button type="button" class="xf-ai-repost-action-btn" data-action="regenerate">${t('aiPage.rewrite')}</button>
          <button type="button" class="xf-ai-repost-action-btn" data-action="config">${t('aiPage.settings')}</button>
          <button type="button" class="xf-ai-repost-action-btn" data-action="close">${t('aiPage.close')}</button>
        </div>
      </div>
      <div class="xf-ai-repost-options">
        <div class="xf-ai-repost-card" data-option="A" role="button" tabindex="0">
          <div class="xf-ai-repost-card-tag">
            <span>${t('aiPage.optionA')}</span>
            <span class="xf-ai-repost-pick-hint">${t('aiPage.pick')}</span>
          </div>
          <div class="xf-ai-repost-card-body">${escapeHtml(options.optionA)}</div>
        </div>
        <div class="xf-ai-repost-card" data-option="B" role="button" tabindex="0">
          <div class="xf-ai-repost-card-tag">
            <span>${t('aiPage.optionB')}</span>
            <span class="xf-ai-repost-pick-hint">${t('aiPage.pick')}</span>
          </div>
          <div class="xf-ai-repost-card-body">${escapeHtml(options.optionB)}</div>
        </div>
      </div>
    `

    const cards = Array.from(panel.querySelectorAll<HTMLElement>('.xf-ai-repost-card'))
    cards.forEach((card) => {
      card.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        const optKey = card.getAttribute('data-option')
        const chosenText = optKey === 'A' ? options.optionA : options.optionB
        replaceComposeEditorText(modalEl, chosenText)

        cards.forEach((c) => {
          const isCurrent = c === card
          c.classList.toggle('is-selected', isCurrent)
          const hint = c.querySelector('.xf-ai-repost-pick-hint')
          if (hint) hint.textContent = isCurrent ? t('aiPage.picked') : t('aiPage.pick')
        })
      })
    })

    panel.querySelector('[data-action="regenerate"]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      void runGeneration()
    })
    panel.querySelector('[data-action="config"]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      void renderConfigView()
    })
    panel.querySelector('[data-action="close"]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      closePanel()
    })
  }

  const runGeneration = async (overrideConfig?: {
    baseUrl?: string
    apiKey?: string
    model?: string
  }) => {
    if (closed || !panel.isConnected) return

    const request = beginRequest()
    triggerBtn.disabled = true
    const stored = await getStorage([KeyAiRepostApiKey])
    if (!isCurrent(request)) return
    const currentKey = overrideConfig?.apiKey ?? String(stored[KeyAiRepostApiKey] || '').trim()
    if (!currentKey) {
      await renderConfigView(t('aiPage.firstUse'))
      return
    }

    triggerBtn.disabled = true
    panel.innerHTML = `
      <div class="xf-ai-repost-header">
        <span class="xf-ai-repost-title">${t('aiPage.generatingTitle')}</span>
        <div class="xf-ai-repost-actions">
          <button type="button" class="xf-ai-repost-action-btn" data-action="close">${t('aiPage.cancel')}</button>
        </div>
      </div>
      <div class="xf-ai-repost-status">${t('aiPage.generatingStatus')}</div>
    `
    panel.querySelector('[data-action="close"]')?.addEventListener('click', (e) => {
      e.stopPropagation()
      closePanel()
    })

    try {
      const source = await resolveFullRepostSource(modalEl, request.signal)
      if (!isCurrent(request)) return
      console.info('[oh-my-x AI Repost] 准备调用接口生成总结:', {
        textLength: source.text?.length,
        hasTitle: Boolean(source.title),
        author: source.authorHandle || source.authorName,
      })

      const response = (await sendAiRequest({
        type: 'XF_GENERATE_REPOST_OPTIONS',
        source,
        overrideConfig,
        locale: getLocale(),
      }, request.signal)) as ({ ok?: boolean; error?: TransferableError } & Partial<AiRepostOptionsResult>) | undefined
      if (!isCurrent(request)) return

      if (response === undefined) {
        throw new Error(t('aiPage.noBackground'))
      }

      if (!response.ok) {
        throw new Error(errorText(response.error) || t('aiPage.callFailed'))
      }

      if (!response.optionA || !response.optionB) {
        throw new Error(t('aiPage.incomplete'))
      }

      renderOptionsView({
        optionA: response.optionA,
        optionB: response.optionB,
      })
    } catch (err: any) {
      if (!isCurrent(request)) return
      const errMsg = errorText(err) || String(err)
      console.error('[oh-my-x AI Repost] 生成出错:', err)
      if (closed || !panel.isConnected) return
      panel.innerHTML = `
        <div class="xf-ai-repost-header">
          <span class="xf-ai-repost-title">${t('aiPage.notFinished')}</span>
          <div class="xf-ai-repost-actions">
            <button type="button" class="xf-ai-repost-action-btn" data-action="retry">${t('aiPage.retry')}</button>
            <button type="button" class="xf-ai-repost-action-btn" data-action="config">${t('aiPage.serviceSettings')}</button>
            <button type="button" class="xf-ai-repost-action-btn" data-action="close">${t('aiPage.close')}</button>
          </div>
        </div>
        <div class="xf-ai-repost-status xf-ai-repost-error">${escapeHtml(errMsg)}</div>
      `
      panel.querySelector('[data-action="retry"]')?.addEventListener('click', (e) => {
        e.stopPropagation()
        void runGeneration()
      })
      panel.querySelector('[data-action="config"]')?.addEventListener('click', (e) => {
        e.stopPropagation()
        void renderConfigView()
      })
      panel.querySelector('[data-action="close"]')?.addEventListener('click', (e) => {
        e.stopPropagation()
        closePanel()
      })
    } finally {
      if (isCurrent(request)) triggerBtn.disabled = false
    }
  }

  void runGeneration()
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function applyAudienceRowStyle(parentEl: HTMLElement) {
  parentEl.classList.add('xf-ai-repost-audience-row')
  parentEl.style.setProperty('display', 'inline-flex', 'important')
  parentEl.style.setProperty('flex-direction', 'row', 'important')
  parentEl.style.setProperty('align-items', 'center', 'important')
  parentEl.style.setProperty('flex-wrap', 'nowrap', 'important')
  parentEl.style.setProperty('gap', '8px', 'important')
  parentEl.style.setProperty('width', 'auto', 'important')
  parentEl.style.setProperty('height', 'auto', 'important')
  parentEl.style.setProperty('vertical-align', 'middle', 'important')
}

/**
 * 向发帖/Repost 弹窗注入「AI 总结」按钮（位于受众选择按钮「每个人 ∨」右侧水平并排）
 */
export async function updateAiRepostComposerButton() {
  try {
    attachRepostSourceCapture()

    const enabledVal = await getStorage(KeyAiRepostEnabled)
    if (enabledVal === 'off') {
      document.querySelectorAll('.xf-ai-repost-trigger, .xf-ai-repost-panel, .xf-ai-repost-fallback-bar').forEach((el) => el.remove())
      return
    }

    const modals = Array.from(
      document.querySelectorAll<HTMLElement>(selectors.modalWrapper),
    )

    modals.forEach((modalEl) => {
      const editor = findComposeEditor(modalEl)
      if (!editor) return

      const existingBtn = modalEl.querySelector<HTMLButtonElement>('.xf-ai-repost-trigger')
      if (existingBtn) {
        const audienceBtn = findAudienceButtonInModal(modalEl)
        if (audienceBtn && audienceBtn.parentElement) {
          const parentEl = audienceBtn.parentElement
          if (!editor || !parentEl.contains(editor)) {
            applyAudienceRowStyle(parentEl)
            if (audienceBtn.nextElementSibling !== existingBtn) {
              audienceBtn.insertAdjacentElement('afterend', existingBtn)
            }
          }
        }
        const fallbackParent = existingBtn.closest('.xf-ai-repost-fallback-bar')
        if (fallbackParent) fallbackParent.remove()
        return
      }

      ensureStyles()

      const triggerBtn = document.createElement('button')
      triggerBtn.type = 'button'
      triggerBtn.className = 'xf-ai-repost-trigger'
      triggerBtn.setAttribute('data-testid', 'xf-ai-repost-trigger')
      triggerBtn.setAttribute('aria-label', t('aiPage.triggerLabel'))
      triggerBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3L12 3z"></path>
        </svg>
        <span>${t('aiPage.trigger')}</span>
      `

      const audienceBtn = findAudienceButtonInModal(modalEl)
      let anchorRow: HTMLElement

      if (audienceBtn && audienceBtn.parentElement) {
        const parentEl = audienceBtn.parentElement
        const containsEditor = editor ? parentEl.contains(editor) : false

        if (!containsEditor) {
          applyAudienceRowStyle(parentEl)
          audienceBtn.insertAdjacentElement('afterend', triggerBtn)
          anchorRow = parentEl
        } else {
          // 兜底防御：若 parentEl 包含编辑器，则在 audienceBtn 旁边插入专用的水平 row 容器
          let rowContainer = modalEl.querySelector<HTMLElement>('.xf-ai-repost-audience-row')
          if (!rowContainer) {
            rowContainer = document.createElement('div')
            rowContainer.className = 'xf-ai-repost-audience-row'
            audienceBtn.insertAdjacentElement('afterend', rowContainer)
          }
          rowContainer.appendChild(triggerBtn)
          anchorRow = rowContainer
        }
      } else {
        // 兜底：若弹窗内尚未渲染受众胶囊（如先点击编辑器后才挂载受众按钮），在编辑器容器上方插入一行
        const fallbackBar = document.createElement('div')
        fallbackBar.className = 'xf-ai-repost-fallback-bar'
        fallbackBar.appendChild(triggerBtn)
        const editorContainer =
          editor.closest('[data-testid="tweetTextarea_0_label"]') ||
          editor.closest('.DraftEditor-root') ||
          editor
        editorContainer.insertAdjacentElement('beforebegin', fallbackBar)
        anchorRow = fallbackBar
      }

      triggerBtn.addEventListener('mousedown', (ev) => {
        ev.preventDefault()
      })

      triggerBtn.addEventListener('click', (ev) => {
        ev.preventDefault()
        ev.stopPropagation()
        const currentAnchor = triggerBtn.parentElement || anchorRow
        openOrUpdateRepostPanel(modalEl, currentAnchor, triggerBtn)
      })
    })
  } catch {
    // ignore
  }
}
