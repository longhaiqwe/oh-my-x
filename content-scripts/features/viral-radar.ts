import { getStorage } from '../utilities/storage'
import {
  KeyViralRadarEnabled,
  KeyViralPotentialThreshold,
  KeyViralViralThreshold,
  KeyViralShowNormalBadge,
  KeyViralEnableHighlight,
  KeyViralHighlightStyle,
  KeyViralShowLevels,
  KeyViralShowBadge,
} from '../../storage-keys'
import {
  parseViralShowLevels,
  parseViralHighlightStyle,
  parseViralShowBadge,
  type ViralLevels,
} from '../../shared/settings'
import {
  extractTweetViews,
  extractTweetPublishTime,
  calculateTweetVelocity,
  classifyTweetVelocity,
  formatVelocityBadge,
  type TweetVelocityCategory,
} from '../../shared/viral-radar-parser'

export function ensureViralRadarStyles() {
  if (document.getElementById('xf-viral-radar-styles')) return
  const styleEl = document.createElement('style')
  styleEl.id = 'xf-viral-radar-styles'
  styleEl.textContent = `
    @keyframes xf-badge-pulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.04); opacity: 0.92; }
    }

    [data-xf-viral-highlight] {
      position: relative !important;
    }

    [data-xf-viral-highlight]::before {
      content: '' !important;
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      bottom: 0 !important;
      width: 2.5px !important;
      border-top-left-radius: 2px !important;
      border-bottom-left-radius: 2px !important;
      pointer-events: none !important;
      z-index: 2 !important;
      transition: background-color 0.2s ease !important;
    }

    [data-xf-viral-highlight="viral"] {
      background-color: rgba(239, 68, 68, 0.05) !important;
    }

    [data-xf-viral-highlight="viral"]::before {
      background-color: #ef4444 !important;
    }

    [data-xf-viral-highlight="potential"] {
      background-color: rgba(245, 158, 11, 0.05) !important;
    }

    [data-xf-viral-highlight="potential"]::before {
      background-color: #f59e0b !important;
    }

    /* 高亮样式：仅边框时去掉背景色，仅背景时去掉左侧指示条 */
    [data-xf-viral-highlight][data-xf-viral-style="border"] {
      background-color: transparent !important;
    }

    [data-xf-viral-highlight][data-xf-viral-style="background"]::before {
      display: none !important;
    }

    /* 速度徽章：字号 / 尺寸 / 圆角对齐 .xf-stat-ratio-badge，保证并排显示时视觉一致；
       刻意不使用 transition: all —— 该属性会在高频轮询更新下放大微小 reflow，造成「抖动」。 */
    .x-focus-velocity-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 2px;
      padding: 1.5px 4px;
      font-size: 10px;
      font-weight: 700;
      line-height: 1.2;
      border-radius: 4px;
      white-space: nowrap;
      vertical-align: middle;
      cursor: default;
      user-select: none;
    }

    .x-focus-velocity-badge--normal {
      color: rgb(0, 118, 70);
      background: rgba(0, 186, 124, 0.18);
    }

    .x-focus-velocity-badge--potential {
      color: rgb(169, 76, 0);
      background: rgba(255, 122, 0, 0.18);
    }

    .x-focus-velocity-badge--viral {
      color: rgb(176, 24, 38);
      background: rgba(244, 33, 46, 0.16);
      animation: xf-badge-pulse 2s infinite ease-in-out;
    }
  `
  document.head.appendChild(styleEl)
}

export function cleanupViralRadar() {
  document.querySelectorAll('[data-xf-viral-badge]').forEach((el) => el.remove())
  document.querySelectorAll('[data-xf-viral-highlight]').forEach((el) => {
    el.removeAttribute('data-xf-viral-highlight')
    el.removeAttribute('data-xf-viral-style')
  })
  // 一并清除幂等标记，确保重新启用雷达时能重算（而非被旧标记跳过）
  document.querySelectorAll<HTMLElement>('article[data-xf-viral-key]').forEach((el) => {
    delete el.dataset.xfViralKey
  })
}

/**
 * 提取推文唯一身份标识，用于幂等判定（避免同一推文被高频轮询反复处理）。
 * 优先用 statusId；推文未带 status 链接时回退到 time[datetime]。
 */
function getTweetKey(article: HTMLElement): string {
  const link = article.querySelector<HTMLAnchorElement>('a[href*="/status/"]')
  if (link) {
    const matched = link.getAttribute('href')?.match(/\/status\/(\d+)/)
    if (matched?.[1]) return matched[1]
  }
  const time = article.querySelector<HTMLElement>('time[datetime]')
  return time?.getAttribute('datetime') || ''
}

let cachedViralData: Record<string, string | number | boolean | undefined> | null = null

export function invalidateViralRadarCache() {
  cachedViralData = null
}

export async function runViralRadar(force = false) {
  if (force || !cachedViralData) {
    cachedViralData = await getStorage([
      KeyViralRadarEnabled,
      KeyViralPotentialThreshold,
      KeyViralViralThreshold,
      KeyViralShowNormalBadge,
      KeyViralEnableHighlight,
      KeyViralHighlightStyle,
      KeyViralShowLevels,
      KeyViralShowBadge,
    ])
  }
  const data = cachedViralData

  const enabled = data?.[KeyViralRadarEnabled] !== 'off'
  if (!enabled) {
    cleanupViralRadar()
    return
  }

  ensureViralRadarStyles()

  // force=true：清除所有推文的幂等标记，强制本轮重算
  // （用户改动了雷达阈值 / 显示开关等设置时，由调用方传入）
  if (force) {
    document.querySelectorAll<HTMLElement>('article[data-xf-viral-key]').forEach((a) => {
      delete a.dataset.xfViralKey
    })
  }

  const potentialThreshold = Number(data?.[KeyViralPotentialThreshold]) || 1000
  const viralThreshold = Number(data?.[KeyViralViralThreshold]) || 10000
  const showLevels = parseViralShowLevels(data)
  const showBadge = parseViralShowBadge(data)
  const highlightStyle = parseViralHighlightStyle(data)

  const articles = Array.from(document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'))
  if (!articles.length) return

  const now = Date.now()

  // 区分：是否处于帖子详情页 (e.g. /username/status/123456789)
  const statusMatch = window.location.pathname.match(/\/status\/(\d+)/)
  const isDetailPage = Boolean(statusMatch)

  let mainTweetIndex = -1
  if (isDetailPage) {
    const statusId = statusMatch![1]
    mainTweetIndex = articles.findIndex((art) =>
      art.querySelector(`a[href*="/status/${statusId}"]`),
    )
    if (mainTweetIndex === -1) {
      // 降级：如果未能找到包含对应 statusId 的链接，默认第 1 条为主贴
      mainTweetIndex = 0
    }
  }

  let commentCounter = 0

  articles.forEach((article, index) => {
    // 处于帖子详情页时：
    // - index <= mainTweetIndex 的是主贴（及主贴上文）：必须展示标签
    // - index > mainTweetIndex 的是评论：仅展示前 10 条评论的标签，超出的评论清理/隐藏标签
    if (isDetailPage && index > mainTweetIndex) {
      commentCounter++
      if (commentCounter > 10) {
        const existingBadge = article.querySelector<HTMLElement>('[data-xf-viral-badge="1"]')
        if (existingBadge) existingBadge.remove()
        article.removeAttribute('data-xf-viral-highlight')
        return
      }
    }

    // 幂等：同一推文已处理过且身份未变 → 整体跳过，不再重算、不碰 DOM。
    // 这是消除「抖动」与高频轮询性能浪费的关键：挂载首算一次后即冻结，
    // 仅当 force（用户改设置）或节点被复用换成新推文（key 变化）时才重算。
    if (!force) {
      const stamped = article.dataset.xfViralKey
      if (stamped) {
        const currentKey = getTweetKey(article)
        if (currentKey && stamped === currentKey) return
      }
    }

    const views = extractTweetViews(article)
    const publishTime = extractTweetPublishTime(article)

    if (views === null || publishTime === null) {
      return
    }

    const velocity = calculateTweetVelocity(views, publishTime, now)
    const level: TweetVelocityCategory = classifyTweetVelocity(
      velocity,
      potentialThreshold,
      viralThreshold,
    )

    const levelEnabled = showLevels[level as keyof ViralLevels]

    // 1. 推文高亮处理：仅由「高亮样式」控制（潜力/爆款级，样式非 none 即高亮）。
    //    刻意不与「展示标签级别」耦合——后者只影响标签，避免用户关掉某级标签时
    //    连高亮也一起消失的隐藏副作用。
    if (highlightStyle !== 'none' && (level === 'potential' || level === 'viral')) {
      article.setAttribute('data-xf-viral-highlight', level)
      article.setAttribute('data-xf-viral-style', highlightStyle)
    } else {
      article.removeAttribute('data-xf-viral-highlight')
      article.removeAttribute('data-xf-viral-style')
    }

    // 2. 标签处理（仅当「标签」开关开启且该级别已勾选时展示）
    const shouldShowBadge = showBadge && levelEnabled
    let badgeContainer = article.querySelector<HTMLElement>('[data-xf-viral-badge="1"]')

    if (!shouldShowBadge) {
      if (badgeContainer) badgeContainer.remove()
      // 即使不展示徽章也标记为已处理：该推文的「不展示」结论同样无需每轮重算
      const skipKey = getTweetKey(article)
      if (skipKey) article.dataset.xfViralKey = skipKey
      return
    }

    const formattedVelocity = formatVelocityBadge(velocity)
    const iconMap = {
      normal: '🌱',
      potential: '🚀',
      viral: '🔥',
    }
    const labelText = `${iconMap[level]} ${formattedVelocity}`

    if (!badgeContainer) {
      badgeContainer = document.createElement('span')
      badgeContainer.setAttribute('data-xf-viral-badge', '1')
    }
    badgeContainer.className = `x-focus-velocity-badge x-focus-velocity-badge--${level}`

    // 挂载到推文底部数据条的「观看量 / 分析」按钮（即观看量位置）。
    // - 主页（自己 / 他人）会同时渲染 .xf-stat-ratio-badge：速度徽章紧贴其右侧；
    // - 信息流 / 推荐推文没有 stat-ratio 徽章：直接挂在观看量按钮内。
    // 字号 / 尺寸与 stat-ratio 徽章保持一致，视觉上像同一组。
    const countsGroup = article.querySelector<HTMLElement>('[role="group"][id*="id__"]:only-child')
    const analyticsBtn = countsGroup?.querySelector<HTMLElement>('a[href*="/analytics"]') || null

    if (!analyticsBtn) {
      // 该推文没有观看量入口：清理残留徽章后跳过，避免错位
      badgeContainer.remove()
      // 无 analytics 入口的推文通常不会异步补出该按钮，同样标记为已处理，避免每轮空跑
      const noBtnKey = getTweetKey(article)
      if (noBtnKey) article.dataset.xfViralKey = noBtnKey
      return
    }

    // 与 stat-ratio 徽章共用同一挂载容器，保证并排显示。
    // 关键：必须落在 .css-146c3p1（行内文本节点）里，才能和观看量数字 / stat-ratio 徽章左右排布；
    //       不能落到 app-text-transition-container 的父元素——那是 flex 列容器，会把徽章换行成上下布局。
    const ratioBadge = analyticsBtn.querySelector<HTMLElement>('.xf-stat-ratio-badge')
    const container: HTMLElement =
      (ratioBadge?.parentElement as HTMLElement | undefined) ||
      (analyticsBtn.querySelector('.css-146c3p1') as HTMLElement | null) ||
      analyticsBtn

    // 仅在位置不正确时才移动节点，避免高频轮询下反复写入 DOM 引发的抖动
    if (ratioBadge) {
      if (badgeContainer.parentElement !== container || badgeContainer.previousElementSibling !== ratioBadge) {
        ratioBadge.after(badgeContainer)
      }
    } else if (badgeContainer.parentElement !== container) {
      container.appendChild(badgeContainer)
    }

    // 设置 Hover 提示 (e.g. "121,756 次浏览 · 🔥 12.5万/h")
    badgeContainer.title = `${views.toLocaleString('zh-CN')} 次浏览 · ${labelText}`
    badgeContainer.textContent = labelText

    // 标记该推文已处理（携带身份 key），后续轮询命中即跳过，除非 force 或换了推文
    const doneKey = getTweetKey(article)
    if (doneKey) article.dataset.xfViralKey = doneKey
  })
}
