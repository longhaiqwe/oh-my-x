import { runDynamicFeatures, type DynamicFeatureScope } from './features/dynamic'
import { applyStaticFeatures } from './features/static'
import addStyleSheet from './utilities/addStyleSheet'
import addStyles from './utilities/addStyles'
import { extractColorsAsRootVars, syncXAccentColor } from './utilities/colors'
import debounce from './utilities/debounce'
import isMutationSkippable from './utilities/isMutationSkippable'
import { getSettings } from './utilities/storage'
import { attachPrecomposeUrlCapture, savePrecomposeUrl } from './options/precompose'
import { listenForScheduledTweetsApi } from './options/scheduled-time'
import { listenForBookmarkMetricsApi } from './features/bookmark-counter'
import { initAutoLikeOnReply } from './features/auto-like-reply'
import { listenForUserFollowerMetricsApi } from './features/user-followers'
import { listenForCreatorRewardsApi } from './features/creator-rewards'

function addStylesheets() {
  addStyleSheet('main', browser.runtime.getURL('css/main.css' as any))
}

function addMutationObserver() {
  let lastPathname = window.location.pathname
  const observer = new MutationObserver((mutations) => {
    if (!mutations.length || isMutationSkippable(mutations)) return
    const scopes = getDynamicFeatureScopes(mutations)
    if (window.location.pathname !== lastPathname) {
      lastPathname = window.location.pathname
      savePrecomposeUrl()
      scopes.add('all')
    }
    if (scopes.size > 0) runDynamicFeatures(undefined, scopes)
  })

  observer.observe(document, { childList: true, subtree: true })
}

export function getDynamicFeatureScopes(mutations: MutationRecord[]): Set<DynamicFeatureScope> {
  const scopes = new Set<DynamicFeatureScope>()
  const inspect = (node: Node, includeDescendants: boolean) => {
    const el = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement
    if (!el) return
    const contains = (selector: string) => includeDescendants && Boolean(el.querySelector(selector))
    if (el.closest('article[data-testid="tweet"], [data-testid="UserCell"], [data-testid="HoverCard"]') || contains('article[data-testid="tweet"], [data-testid="UserCell"], [data-testid="HoverCard"]')) {
      scopes.add('tweet')
    }
    if (
      el.closest('[role="dialog"], [data-testid="composer"], [data-testid="composerRichTextInputContainer"], [data-testid="twitterArticleRichTextView"], [data-testid="twitterArticleReadView"]') ||
      contains('[role="dialog"], [data-testid="composer"], [data-testid="composerRichTextInputContainer"], [data-testid="twitterArticleRichTextView"], [data-testid="twitterArticleReadView"]')
    ) {
      scopes.add('composer')
      scopes.add('scheduled')
    }
    const inlineComposerSelector = '[data-xf-inline-composer], [data-testid^="tweetTextarea"], [data-testid="toolBar"], [data-testid="tweetButtonInline"], [data-testid="attachments"]'
    if (el.closest(inlineComposerSelector) || contains(inlineComposerSelector)) scopes.add('composer')
    if (el.closest('nav[role="navigation"]') || contains('nav[role="navigation"]')) {
      scopes.add('navigation')
    }
    if (el.closest('[data-testid="unsentTweet"]') || contains('[data-testid="unsentTweet"]')) {
      scopes.add('scheduled')
    }
  }

  for (const mutation of mutations) {
    // target 可能是 body/时间线根节点；只检查其祖先，避免一次无关变更因页面上
    // “存在某个 tweet/dialog”而被误判。真正变化的节点才检查自身子树。
    inspect(mutation.target, false)
    mutation.addedNodes.forEach((node) => inspect(node, true))
    mutation.removedNodes.forEach((node) => inspect(node, true))
  }
  return scopes
}

function addPageLoadListener() {
  document.addEventListener('DOMContentLoaded', () => runDynamicFeatures())
}

function addResizeListener() {
  window.addEventListener('resize', debounce(() => runDynamicFeatures(), 50))
}

export async function initializeExtension() {
  addStylesheets()
  // 先写入强调色变量（读不到就用默认蓝），后面注入的界面直接引用
  syncXAccentColor()

  // 数据监听必须最先注册：排期数据不依赖任何 DOM 操作，
  // 后续静态/动态特性即使抛错也不能影响数据持久化链路。
  listenForScheduledTweetsApi()
  listenForBookmarkMetricsApi()
  initAutoLikeOnReply()
  listenForUserFollowerMetricsApi()
  listenForCreatorRewardsApi()

  const settings = await getSettings()

  // 静态/动态特性各自隔离错误，单个特性失败不阻断初始化
  // 这里是 init 的一次性调用（非热循环），用 console.warn 把真实异常暴露出来，便于排查
  try {
    applyStaticFeatures(settings)
  } catch (e) {
    console.warn('[oh-my-x] applyStaticFeatures 初始化失败', e)
  }
  try {
    runDynamicFeatures(settings)
  } catch (e) {
    console.warn('[oh-my-x] runDynamicFeatures 初始化失败', e)
  }

  // Capture pre-compose page URL so the compose modal can insert the URL of the page
  // that opened the compose view instead of the compose route itself.
  attachPrecomposeUrlCapture()

  addMutationObserver()
  addPageLoadListener()
  addResizeListener()

  extractColorsAsRootVars()
  setTimeout(() => extractColorsAsRootVars(), 3000)
}
