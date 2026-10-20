import { getLocale, t } from '../../shared/i18n'
import { USER_METRICS_TYPE, XF_BRIDGE_MARKER } from '../../shared/bridge'
import {
  formatFollowerCount,
  formatFollowerTooltip,
  getFollowerTier,
  type UserMetrics,
} from '../../shared/user-metrics-interceptor'
import { KeyUserFollowerCount } from '../../storage-keys'
import { getStorage } from '../utilities/storage'
import type { UserFollowerCountMode } from '../../shared/settings'

export const FOLLOWER_BADGE_CLASS = 'xf-user-followers-badge'
const STYLES_INJECTED_ID = 'xf-user-followers-styles'
const BOUND_ATTR = 'data-xf-follower-bound'

/**
 * 内存缓存：handle.toLowerCase() 或 restId -> UserMetrics
 */
export const userMetricsMemory: Record<string, UserMetrics> = {}

/**
 * 已知的粉丝数：先读拦截器写在作者名区域上的值（要和 handle 对得上），再读内存缓存；都没有时返回 null。
 * 不受「粉丝数」显示开关影响，AI 打分也用它。
 */
export function knownFollowerCount(handle: string, userNameEl?: Element | null): number | null {
  const lower = handle.toLowerCase()
  if (!lower) return null
  if (userNameEl && userNameEl.getAttribute('data-xf-screen-name')?.toLowerCase() === lower) {
    const n = parseInt(userNameEl.getAttribute('data-xf-followers-count') || '', 10)
    if (!isNaN(n) && n >= 0) return n
  }
  const cached = userMetricsMemory[lower]
  return cached && cached.screenName.toLowerCase() === lower && cached.followersCount >= 0 ? cached.followersCount : null
}

/**
 * 从 sessionStorage 恢复历史缓存
 */
function restoreMetricsFromStorage() {
  try {
    const raw = sessionStorage.getItem('xf_user_metrics_last')
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        Object.assign(userMetricsMemory, parsed)
      }
    }
  } catch {
    // ignore
  }
}

restoreMetricsFromStorage()

let isListening = false

/**
 * 监听来自 MAIN world 拦截器的广播与 DOM 标记更新
 */
export function listenForUserFollowerMetricsApi() {
  if (isListening) return
  isListening = true

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    if (!event.data || event.data.type !== USER_METRICS_TYPE) return
    if (event.data.__xf !== XF_BRIDGE_MARKER) return

    try {
      const payload = event.data.payload as Record<string, UserMetrics>
      if (payload && typeof payload === 'object') {
        let changed = false
        for (const [key, metrics] of Object.entries(payload)) {
          if (!userMetricsMemory[key] || userMetricsMemory[key].followersCount !== metrics.followersCount) {
            userMetricsMemory[key] = metrics
            changed = true
          }
        }
        if (changed) {
          void updateUserFollowerBadges()
        }
      }
    } catch {
      // ignore
    }
  })

  // 监听来自 MAIN world Fiber 探针标注完成的原生事件
  window.addEventListener('xf-user-followers-updated', () => {
    void updateUserFollowerBadges()
  })
}

/**
 * 注入粉丝徽章样式表
 */
export function ensureFollowerBadgeStyles() {
  if (document.getElementById(STYLES_INJECTED_ID)) return
  const styleEl = document.createElement('style')
  styleEl.id = STYLES_INJECTED_ID
  styleEl.textContent = `
    .${FOLLOWER_BADGE_CLASS} {
      display: inline-flex !important;
      align-items: center !important;
      flex-wrap: nowrap !important;
      white-space: nowrap !important;
      flex: none !important;
      margin-left: 6px !important;
      font-size: 12px !important;
      line-height: 1 !important;
      vertical-align: middle !important;
      cursor: default !important;
      user-select: none !important;
    }
    .${FOLLOWER_BADGE_CLASS} > * {
      flex: none !important;
      white-space: nowrap !important;
    }
    .xf-user-followers-line {
      margin: 2px 0 3px !important;
      display: flex !important;
      align-items: center !important;
    }
    .xf-user-followers-line .${FOLLOWER_BADGE_CLASS} {
      margin-left: 0 !important;
    }
    .xf-follower-pill {
      padding: 2px 7px !important;
      border-radius: 999px !important;
      font-weight: 700 !important;
      font-size: 11px !important;
      line-height: 14px !important;
      display: inline-block !important;
      transition: background-color 0.15s ease, opacity 0.15s ease !important;
    }
    .xf-follower-pill.t0 {
      background-color: rgba(113, 118, 123, 0.16) !important;
      color: rgb(113, 118, 123) !important;
    }
    .xf-follower-pill.t1 {
      background-color: rgba(29, 155, 240, 0.13) !important;
      color: rgb(29, 155, 240) !important;
    }
    .xf-follower-pill.t2 {
      background-color: rgba(0, 186, 124, 0.15) !important;
      color: rgb(0, 160, 108) !important;
    }
    .xf-follower-pill.t3 {
      background-color: rgba(255, 159, 10, 0.18) !important;
      color: rgb(214, 126, 0) !important;
    }
    .xf-follower-pill.t4 {
      background: linear-gradient(135deg, rgba(249, 24, 128, 0.18), rgba(255, 159, 10, 0.18)) !important;
      color: rgb(226, 22, 116) !important;
    }
  `
  document.head.appendChild(styleEl)
}

const EXCLUDED_HANDLES = new Set([
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
  'topics',
  'lists',
])

/**
 * 从元素中获取用户 handle（不含 @，小写）
 */
export function extractHandleFromElement(container: Element): string | null {
  const links = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'))

  // 1. 优先从 @handle 链接提取（精准避开 socialContext 中推荐人/关注者的链接）
  for (const a of links) {
    if (a.closest('[data-testid="socialContext"]')) continue
    const text = a.textContent?.trim() || ''
    if (text.startsWith('@')) {
      const href = a.getAttribute('href') || ''
      const m = href.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/)
      if (m && m[1]) {
        const lower = m[1].toLowerCase()
        if (!EXCLUDED_HANDLES.has(lower)) {
          return lower
        }
      }
      const textMatch = text.match(/^@([A-Za-z0-9_]{1,15})/)
      if (textMatch && textMatch[1]) {
        const lower = textMatch[1].toLowerCase()
        if (!EXCLUDED_HANDLES.has(lower)) {
          return lower
        }
      }
    }
  }

  // 2. 从 @handle 文本正则提取
  const text = container.textContent || ''
  const textMatch = text.match(/@([A-Za-z0-9_]{1,15})/)
  if (textMatch && textMatch[1]) {
    const lower = textMatch[1].toLowerCase()
    if (!EXCLUDED_HANDLES.has(lower)) {
      return lower
    }
  }

  // 3. 兜底从普通链接提取（排除 socialContext 容器）
  for (const a of links) {
    if (a.closest('[data-testid="socialContext"]')) continue
    const href = a.getAttribute('href') || ''
    const m = href.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/)
    if (m && m[1]) {
      const lower = m[1].toLowerCase()
      if (!EXCLUDED_HANDLES.has(lower)) {
        return lower
      }
    }
  }

  return null
}

function removeBadgeElement(badge: HTMLElement) {
  const parent = badge.parentElement
  badge.remove()
  if (parent && parent.classList.contains('xf-user-followers-line')) {
    parent.remove()
  }
}

/**
 * 头部整行（名字区 + 其它插件的小标 + 菜单）。结构不符就返回 null
 */
function headerRow(un: HTMLElement): HTMLElement | null {
  const row = un.parentElement?.parentElement?.parentElement
  const host = row?.parentElement
  if (!row || !host) return null
  const rs = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(row) : null
  const hs = typeof window !== 'undefined' && window.getComputedStyle ? window.getComputedStyle(host) : null
  if (!rs || !hs) return row
  return rs.display === 'flex' && rs.flexDirection === 'row' && hs.flexDirection === 'column' ? row : null
}

/**
 * 检查名字或 @ID 是否因为空间不够被省略 (...)
 */
function crowded(un: HTMLElement, badge: HTMLElement): boolean {
  for (const n of Array.from(un.querySelectorAll<HTMLElement>('*'))) {
    if (n === badge || badge.contains(n)) continue
    if (n.clientWidth > 0 && n.scrollWidth > n.clientWidth + 1) return true
  }
  return false
}

/**
 * 将徽章放到推文头部整行下方（单独占一行），防止把博主名和时间挤截断
 */
function placeBelow(un: HTMLElement, badge: HTMLElement): HTMLElement | null {
  const row = headerRow(un)
  if (!row) return null
  const line = document.createElement('div')
  line.className = 'xf-user-followers-line'
  line.append(badge)
  row.after(line)
  return line
}

/**
 * 生成或更新单个徽章 DOM 节点（胶囊样式 + 分级配色）
 */
function createOrUpdateBadgeElement(
  targetBadge: HTMLElement | null,
  metrics: UserMetrics,
): HTMLElement {
  const badge = targetBadge || document.createElement('span')
  if (!targetBadge) {
    badge.className = FOLLOWER_BADGE_CLASS
    // 阻止鼠标事件冒泡，防止触发 X 原生的资料悬浮卡
    const stopEvents = ['mouseover', 'mouseout', 'pointerover', 'pointerout', 'mousemove', 'pointermove']
    for (const ev of stopEvents) {
      badge.addEventListener(ev, (e) => e.stopPropagation())
    }
  }

  const tier = getFollowerTier(metrics.followersCount)
  const countStr = formatFollowerCount(metrics.followersCount, getLocale())
  const tooltipText = formatFollowerTooltip(metrics, { followers: t('followersPage.followers'), following: t('followersPage.following') }, getLocale())

  badge.title = tooltipText
  badge.setAttribute('data-xf-followers-count', String(metrics.followersCount))
  if (metrics.screenName) {
    badge.setAttribute('data-xf-handle', metrics.screenName.toLowerCase())
  }

  let pill = badge.querySelector('.xf-follower-pill') as HTMLElement | null
  if (!pill) {
    pill = document.createElement('span')
    badge.append(pill)
  }
  pill.className = `xf-follower-pill t${tier}`
  pill.textContent = t('followersPage.pill', { count: countStr })

  return badge
}

/**
 * 定位 UserCell 用户卡片的第一行昵称容器（避开顶部的 socialContext 区域）
 */
function findUserCellNameRow(cell: HTMLElement, handle: string): HTMLElement | null {
  const lowerHandle = handle.toLowerCase()

  // 1. 通过 handle 精确匹配目标用户的昵称链接（排除头像与 @handle 链接）
  // 杜绝误匹配卡片顶部可能出现的社交证明人（如“纸予 及另外 9 人关注”或“XDash 关注”）
  const userLinks = Array.from(cell.querySelectorAll<HTMLAnchorElement>('a[href^="/"]'))
  const candidateLinks = userLinks.filter((a) => {
    if (a.closest('[data-testid="socialContext"]')) return false
    const href = a.getAttribute('href')?.toLowerCase() || ''
    const m = href.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/)
    return m && m[1] === lowerHandle
  })

  const nameLink = candidateLinks.find((a) => {
    const text = a.textContent?.trim() || ''
    return text.length > 0 && !text.startsWith('@') && !a.querySelector('img')
  })

  if (!nameLink) return null

  // 辅助函数：判断容器是否包含第二行的 @handle 链接
  const containsHandle = (el: HTMLElement) => {
    return Array.from(el.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')).some((a) => {
      if (a === nameLink) return false
      return a.textContent?.trim().startsWith('@')
    })
  }

  // 寻找真实蓝 V（必须在 nameLink 内部，或者与 nameLink 在同一第一行内）
  const verified = cell.querySelector('[data-testid="icon-verified"]')
  let validVerified: HTMLElement | null = null
  if (verified && !verified.closest('[data-testid="socialContext"]')) {
    validVerified = verified as HTMLElement
  }

  let targetRow: HTMLElement | null = null

  // 1. 蓝 V 在 nameLink 内部（X 官方标准结构）
  if (validVerified && nameLink.contains(validVerified)) {
    // 优先寻找 nameLink 内部包含蓝 V 的横向行（带有 r-18u37iz 或是 nameLink 的直接子容器）
    const innerFlexRow = nameLink.querySelector<HTMLElement>('.r-18u37iz')
    if (innerFlexRow && innerFlexRow.contains(validVerified) && !containsHandle(innerFlexRow)) {
      targetRow = innerFlexRow
    } else if (nameLink.firstElementChild && !containsHandle(nameLink.firstElementChild as HTMLElement)) {
      targetRow = nameLink.firstElementChild as HTMLElement
    } else {
      targetRow = nameLink
    }
  }

  // 2. 蓝 V 在 nameLink 外部（如与 nameLink 同级）
  if (!targetRow && validVerified) {
    let curr: HTMLElement | null = validVerified.parentElement
    while (curr && curr !== cell) {
      if (containsHandle(curr)) break
      if (curr.contains(nameLink)) {
        targetRow = curr
        break
      }
      curr = curr.parentElement
    }
  }

  // 3. 无蓝 V（如 MinervaDB）：在 nameLink 内部寻找横向 flex-row（r-18u37iz）或直接子容器
  if (!targetRow) {
    const innerFlexRow = nameLink.querySelector<HTMLElement>('.r-18u37iz')
    if (innerFlexRow && !containsHandle(innerFlexRow)) {
      targetRow = innerFlexRow
    } else if (
      nameLink.firstElementChild &&
      !containsHandle(nameLink.firstElementChild as HTMLElement) &&
      (nameLink.firstElementChild as HTMLElement).tagName.toLowerCase() === 'div'
    ) {
      targetRow = nameLink.firstElementChild as HTMLElement
    }
  }

  // 4. 简化 mock DOM 兜底
  if (!targetRow) {
    if (nameLink.parentElement && nameLink.parentElement !== cell && !containsHandle(nameLink.parentElement)) {
      targetRow = nameLink.parentElement
    } else {
      targetRow = nameLink
    }
  }

  return targetRow
}

/**
 * 为 UserCell 用户列表卡片渲染徽章（第一行昵称/蓝V后放置胶囊，第二行保留原生 @handle）
 */
function processUserCell(cell: HTMLElement) {
  const handle = extractHandleFromElement(cell) || ''
  if (!handle) return

  // 1. 读取 MAIN world 直接注入在 DOM 上的指标（严格校验 screenName）
  let followersCount: number | null = null
  const domHandle = cell.getAttribute('data-xf-screen-name')
  let domCountStr = cell.getAttribute('data-xf-followers-count')
  if (domHandle && domHandle.toLowerCase() !== handle.toLowerCase()) {
    domCountStr = null
  }
  if (domCountStr) {
    const parsed = parseInt(domCountStr, 10)
    if (!isNaN(parsed) && parsed >= 0) followersCount = parsed
  }

  let followingCount: number | undefined
  const domFollowingStr = cell.getAttribute('data-xf-following-count')
  if (domFollowingStr) {
    const parsed = parseInt(domFollowingStr, 10)
    if (!isNaN(parsed) && parsed >= 0) followingCount = parsed
  }

  let restId = ''
  const btn = cell.querySelector('button[data-testid$="-follow"], button[data-testid$="-unfollow"]')
  if (btn) {
    const testid = btn.getAttribute('data-testid') || ''
    const m = testid.match(/^(\d+)-(?:un)?follow$/)
    if (m && m[1]) restId = m[1]
  }

  // 2. 检查内存缓存补充（严格比对 handle）
  const cachedByHandle = userMetricsMemory[handle.toLowerCase()]
  const metricsFromCache =
    (cachedByHandle && cachedByHandle.screenName.toLowerCase() === handle.toLowerCase() ? cachedByHandle : undefined) ||
    (restId && userMetricsMemory[restId]?.screenName.toLowerCase() === handle.toLowerCase() ? userMetricsMemory[restId] : undefined)

  if (metricsFromCache) {
    if (followersCount === null) followersCount = metricsFromCache.followersCount
    if (followingCount === undefined) followingCount = metricsFromCache.followingCount
  }

  // 3. 寻找正确的目标挂载行
  const nameRow = findUserCellNameRow(cell, handle)

  // 4. 整理卡片内的现有徽章：若已有位于 nameRow 内的徽章则优先复用，移除其它所有位置（如社交证明）的旧徽章
  const existingBadges = Array.from(cell.querySelectorAll<HTMLElement>(`.${FOLLOWER_BADGE_CLASS}`))
  let mountTarget: HTMLElement | null = null
  for (const b of existingBadges) {
    if (nameRow && b.parentElement === nameRow) {
      if (!mountTarget) {
        mountTarget = b
      } else {
        removeBadgeElement(b)
      }
    }
  }
  for (const b of existingBadges) {
    if (b === mountTarget) continue
    if (!mountTarget && nameRow) {
      mountTarget = b
    } else {
      removeBadgeElement(b)
    }
  }

  if (followersCount === null || followersCount < 0) {
    if (mountTarget) removeBadgeElement(mountTarget)
    return
  }

  const metrics: UserMetrics = {
    screenName: handle,
    followersCount,
    followingCount,
    restId,
  }

  if (nameRow) {
    mountTarget = createOrUpdateBadgeElement(mountTarget, metrics)
    if (mountTarget.parentElement !== nameRow || nameRow.lastElementChild !== mountTarget) {
      nameRow.append(mountTarget)
    }
  }
}

/**
 * 为推文头部 User-Name 渲染徽章（末尾放置；若挤压则自动移至下一行）
 */
function processTweetHeader(userNameEl: HTMLElement) {
  const handle = extractHandleFromElement(userNameEl) || ''
  if (!handle) return

  let followersCount: number | null = null
  const domHandle = userNameEl.getAttribute('data-xf-screen-name')
  let domCountStr = userNameEl.getAttribute('data-xf-followers-count')
  if (domHandle && domHandle.toLowerCase() !== handle.toLowerCase()) {
    domCountStr = null
  }
  if (domCountStr) {
    const parsed = parseInt(domCountStr, 10)
    if (!isNaN(parsed) && parsed >= 0) followersCount = parsed
  }

  let followingCount: number | undefined
  const domFollowingStr = userNameEl.getAttribute('data-xf-following-count')
  if (domFollowingStr) {
    const parsed = parseInt(domFollowingStr, 10)
    if (!isNaN(parsed) && parsed >= 0) followingCount = parsed
  }

  const cached = userMetricsMemory[handle.toLowerCase()]
  const metricsFromCache = cached && cached.screenName.toLowerCase() === handle.toLowerCase() ? cached : undefined
  if (metricsFromCache) {
    if (followersCount === null) followersCount = metricsFromCache.followersCount
    if (followingCount === undefined) followingCount = metricsFromCache.followingCount
  }

  let mountTarget = userNameEl.querySelector(`.${FOLLOWER_BADGE_CLASS}`) as HTMLElement | null
  if (!mountTarget) {
    const tweetArticle = userNameEl.closest('article[data-testid="tweet"]')
    const line = tweetArticle?.querySelector('.xf-user-followers-line')
    if (line) {
      mountTarget = line.querySelector(`.${FOLLOWER_BADGE_CLASS}`) as HTMLElement | null
    }
  }

  if (followersCount === null || followersCount < 0) {
    if (mountTarget) removeBadgeElement(mountTarget)
    return
  }

  const metrics: UserMetrics = {
    screenName: handle,
    followersCount,
    followingCount,
  }

  // 判断是否为两行布局（如推文详情页 / 文章页）：没有时间戳 <time> 元素
  const isTwoLineDetail = !userNameEl.querySelector('time')

  if (isTwoLineDetail) {
    // 详情页 / 文章页：第一行是昵称+认证蓝V，第二行是@handle
    // 将徽章挂载在第一行（昵称容器）末尾，避免被推到第三行变成单独一行
    const firstChild = userNameEl.firstElementChild as HTMLElement | null
    const nameBlock = userNameEl.querySelector('[dir="ltr"]')?.closest('div')
    let nameRow: HTMLElement | null = null
    if (nameBlock && nameBlock.parentElement && nameBlock.parentElement !== userNameEl) {
      nameRow = nameBlock.parentElement
    } else if (firstChild) {
      nameRow = firstChild
    }

    if (nameRow) {
      if (!mountTarget) {
        mountTarget = createOrUpdateBadgeElement(null, metrics)
        nameRow.append(mountTarget)
        if (crowded(nameRow, mountTarget)) {
          // 如果第一行名字太长被挤压截断，降级放置在第二行（@handle 容器末尾）
          const handleRow = userNameEl.children[1] as HTMLElement | null
          if (handleRow) {
            handleRow.append(mountTarget)
          }
        }
      } else {
        createOrUpdateBadgeElement(mountTarget, metrics)
        // 确保徽章位于第一行（或第二行），若原先直接挂在 userNameEl（成为了第三行）或错误挂在 placeBelow，修正其位置
        const handleRow = userNameEl.children[1] as HTMLElement | null
        if (mountTarget.parentElement !== nameRow && mountTarget.parentElement !== handleRow) {
          removeBadgeElement(mountTarget)
          mountTarget = createOrUpdateBadgeElement(null, metrics)
          nameRow.append(mountTarget)
        }
      }
      return
    }
  }

  // 默认单行信息流推文头部
  if (!mountTarget) {
    mountTarget = createOrUpdateBadgeElement(null, metrics)
    userNameEl.append(mountTarget)
    if (crowded(userNameEl, mountTarget)) {
      placeBelow(userNameEl, mountTarget)
    }
  } else {
    createOrUpdateBadgeElement(mountTarget, metrics)
  }
}

/**
 * 扫描并为页面所有用户列表卡片和推文作者插入/更新粉丝数徽章
 */
export async function updateUserFollowerBadges(explicitMode?: UserFollowerCountMode) {
  let mode = explicitMode
  if (!mode) {
    const stored = await getStorage(KeyUserFollowerCount)
    mode = (stored === 'list' || stored === 'off' ? stored : 'all') as UserFollowerCountMode
  }

  // 关闭状态：清理所有已存在的徽章与单行容器
  if (mode === 'off') {
    document.querySelectorAll('.xf-user-followers-line').forEach((el) => el.remove())
    document.querySelectorAll(`.${FOLLOWER_BADGE_CLASS}`).forEach((el) => el.remove())
    return
  }

  ensureFollowerBadgeStyles()

  // 1. 用户列表（关注列表、粉丝列表、推荐关注、搜索列表等）
  if (mode === 'all' || mode === 'list') {
    const userCells = document.querySelectorAll<HTMLElement>('[data-testid="UserCell"]')
    userCells.forEach((cell) => processUserCell(cell))
  } else {
    document
      .querySelectorAll(`[data-testid="UserCell"] .${FOLLOWER_BADGE_CLASS}`)
      .forEach((el) => el.remove())
  }

  // 2. 信息流推文作者头部
  if (mode === 'all') {
    const tweetHeaders = document.querySelectorAll<HTMLElement>(
      'article[data-testid="tweet"] [data-testid="User-Name"]',
    )
    tweetHeaders.forEach((header) => processTweetHeader(header))
  } else {
    document.querySelectorAll('.xf-user-followers-line').forEach((el) => el.remove())
    document
      .querySelectorAll(`article[data-testid="tweet"] .${FOLLOWER_BADGE_CLASS}`)
      .forEach((el) => el.remove())
  }
}
