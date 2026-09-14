import selectors from '../selectors'
import addStyles from '../utilities/addStyles'

/**
 * 格式化中英文数字字符串（如 "100", "1.2万", "3.5K", "367,602"）为数值
 */
export function parseStatNumber(str: string): number {
  if (!str) return 0
  const cleanStr = str.replace(/,/g, '').trim()

  // 匹配形如 2.4亿
  const yiMatch = cleanStr.match(/^([\d.]+)\s*亿$/i)
  if (yiMatch) {
    return Math.round(parseFloat(yiMatch[1]) * 100000000)
  }

  // 匹配形如 1.2万 / 1.2W
  const wanMatch = cleanStr.match(/^([\d.]+)\s*(?:万|W|w)$/i)
  if (wanMatch) {
    return Math.round(parseFloat(wanMatch[1]) * 10000)
  }

  // 匹配形如 2.4B / 2.4b (Billion 十亿)
  const bMatch = cleanStr.match(/^([\d.]+)\s*B$/i)
  if (bMatch) {
    return Math.round(parseFloat(bMatch[1]) * 1000000000)
  }

  // 匹配形如 1.5M / 1.5m (Million 百万)
  const mMatch = cleanStr.match(/^([\d.]+)\s*M$/i)
  if (mMatch) {
    return Math.round(parseFloat(mMatch[1]) * 1000000)
  }

  // 匹配形如 3.5K / 3.5k (Thousand 千)
  const kMatch = cleanStr.match(/^([\d.]+)\s*K$/i)
  if (kMatch) {
    return Math.round(parseFloat(kMatch[1]) * 1000)
  }

  // 直接提取数字
  const numMatch = cleanStr.match(/[\d.]+/)
  if (numMatch) {
    return parseFloat(numMatch[0]) || 0
  }

  return 0
}

/**
 * 从按钮的 aria-label 或 innerText 提取精确的数据数值
 */
export function extractCountFromElement(el: Element): number {
  const ariaLabel = el.getAttribute('aria-label') || ''

  // 优先从 aria-label 中提取完整无缩写的数字（如 "367602 次查看" 或 "202 回复"）
  const fullNumMatch = ariaLabel.match(/(\d[\d,]*)\s*(?:次|个)?(?:回复|转帖|喜欢|查看|查看帖子分析|书签|bookmarks|likes|retweets|replies|views|喜欢次数)/i)
  if (fullNumMatch) {
    const rawNum = fullNumMatch[1].replace(/,/g, '')
    const parsed = parseInt(rawNum, 10)
    if (!isNaN(parsed)) return parsed
  }

  // 备用方案：提取整个 aria-label 中的第一个数字串
  const anyNumMatch = ariaLabel.match(/(\d[\d,]*)/)
  if (anyNumMatch) {
    const parsed = parseInt(anyNumMatch[1].replace(/,/g, ''), 10)
    if (!isNaN(parsed)) return parsed
  }

  // 如果 aria-label 没有提取到，寻找数字 span 节点
  const textEl = el.querySelector('span[data-testid="app-text-transition-container"]') || el
  return parseStatNumber(textEl.textContent || '')
}

export function isTargetProfilePage(targetUsername = '*'): boolean {
  const pathname = window.location.pathname.toLowerCase()
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return false

  const systemPages = ['home', 'explore', 'notifications', 'messages', 'settings', 'search', 'i', 'compose', 'intent', 'tos', 'privacy']
  const username = parts[0]
  if (systemPages.includes(username)) return false

  const cleanedTarget = targetUsername.trim().replace(/^@/, '').toLowerCase()

  if (cleanedTarget !== '*' && cleanedTarget !== 'all') {
    if (username !== cleanedTarget) return false
  }

  // 主页根路径 /username 或主页标签页 (/username/with_replies, /username/media 等)
  if (parts.length === 1) return true
  const allowedTabs = ['with_replies', 'highlights', 'articles', 'media', 'likes']
  return allowedTabs.includes(parts[1])
}

/**
 * 从个人主页 DOM 获取粉丝/关注者数量
 */
export function getProfileFollowers(): number | null {
  // 查找符合 [href$="/followers"] 或 [href$="/verified_followers"] 的链接
  const followerLink = document.querySelector('a[href*="/followers"], a[href*="/verified_followers"]')
  if (!followerLink) return null

  const text = followerLink.textContent || ''
  // 提取关注者前的数值（例如 "10.7万 关注者"、"2,035 关注者"、"2.4亿 关注者"）
  const match = text.match(/([\d.,]+\s*[亿万WwKkMmBb]?)/)
  if (match) {
    return parseStatNumber(match[1])
  }
  return null
}

export interface LevelConfig {
  label: string
  color: string
  bg: string
}

/**
 * 根据 曝光 / 粉丝 比例评估水平等级
 */
export function getImpressionsRatioLevel(ratio: number): LevelConfig {
  if (ratio < 0.3) {
    return { label: '差', color: '#71767b', bg: 'rgba(113, 118, 123, 0.18)' }
  } else if (ratio < 1.0) {
    return { label: '普通', color: '#1d9bf0', bg: 'rgba(29, 155, 240, 0.18)' }
  } else if (ratio < 5.0) {
    return { label: '良好', color: '#00ba7c', bg: 'rgba(0, 186, 124, 0.18)' }
  } else if (ratio < 20.0) {
    return { label: '优秀', color: '#ff7a00', bg: 'rgba(255, 122, 0, 0.18)' }
  } else {
    return { label: '爆火', color: '#f91880', bg: 'rgba(249, 24, 128, 0.18)' }
  }
}

/**
 * 根据 互动数据 / 粉丝 比例评估水平等级
 */
export function getEngagementRatioLevel(ratio: number): LevelConfig {
  if (ratio < 0.005) { // < 0.5%
    return { label: '差', color: '#71767b', bg: 'rgba(113, 118, 123, 0.18)' }
  } else if (ratio < 0.02) { // 0.5% ~ 2%
    return { label: '普通', color: '#1d9bf0', bg: 'rgba(29, 155, 240, 0.18)' }
  } else if (ratio < 0.05) { // 2% ~ 5%
    return { label: '良好', color: '#00ba7c', bg: 'rgba(0, 186, 124, 0.18)' }
  } else if (ratio < 0.20) { // 5% ~ 20%
    return { label: '优秀', color: '#ff7a00', bg: 'rgba(255, 122, 0, 0.18)' }
  } else { // >= 20%
    return { label: '爆火', color: '#f91880', bg: 'rgba(249, 24, 128, 0.18)' }
  }
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
  'tos',
  'privacy',
  'intent',
  'with_replies',
  'highlights',
  'articles',
  'media',
  'likes',
])

/**
 * 从推文数据组 DOM (group) 或所属推文 article 中获取推文作者 Handle
 */
export function getTweetAuthor(group: Element): string | null {
  // 1. 优先从 group 内部的 status/analytics 链接提取
  const statusLink = group.querySelector('a[href*="/status/"]')
  if (statusLink) {
    const href = statusLink.getAttribute('href') || ''
    const match = href.match(/^\/([^\/]+)\/status\//)
    if (match && match[1] && !NAVIGATION_HANDLES.has(match[1].toLowerCase())) {
      return match[1].toLowerCase()
    }
  }

  // 2. 查找所属的 article 推文容器
  const article = group.closest('article[data-testid="tweet"]') || group.closest('article')
  if (article) {
    // 2a. 查找推文顶部的 User-Name 区域
    const userNameEl = article.querySelector('[data-testid="User-Name"]')
    if (userNameEl) {
      const userLink = userNameEl.querySelector('a[href^="/"]')
      if (userLink) {
        const href = userLink.getAttribute('href') || ''
        const match = href.match(/^\/([^\/]+)/)
        if (match && match[1] && !NAVIGATION_HANDLES.has(match[1].toLowerCase())) {
          return match[1].toLowerCase()
        }
      }
    }

    // 2b. 查找头像容器: data-testid="UserAvatar-Container-username"
    const avatarEl = article.querySelector('[data-testid^="UserAvatar-Container-"]')
    if (avatarEl) {
      const testId = avatarEl.getAttribute('data-testid') || ''
      const username = testId.replace(/^UserAvatar-Container-/, '').toLowerCase()
      if (username && !NAVIGATION_HANDLES.has(username)) {
        return username
      }
    }

    // 2c. 遍历 article 内部所有 /handle 链接
    const handleLinks = article.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')
    for (const a of Array.from(handleLinks)) {
      const href = a.getAttribute('href') || ''
      const m = href.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/)
      if (m && m[1] && !NAVIGATION_HANDLES.has(m[1].toLowerCase())) {
        return m[1].toLowerCase()
      }
    }
  }

  return null
}

/**
 * 获取当前访问的个人主页 Owner 的 Username (从 location.pathname 中解析)
 */
export function getProfileUsername(): string | null {
  const pathname = window.location.pathname.toLowerCase()
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return null

  const systemPages = [
    'home', 'explore', 'notifications', 'messages', 'settings',
    'search', 'i', 'compose', 'intent', 'tos', 'privacy', 'jobs', 'bookmarks'
  ]
  const username = parts[0]
  if (systemPages.includes(username)) return null

  return username
}

/**
 * 判断推文 group 是否属于目标用户 (targetUsername)
 */
export function isTweetAuthorTarget(group: Element, targetUsername: string): boolean {
  const cleanedTarget = targetUsername.trim().replace(/^@/, '').toLowerCase()
  if (!cleanedTarget) return false

  const profileUser = getProfileUsername()
  const author = getTweetAuthor(group)
  if (!author) return false

  // 1. 推文作者必须与当前 Profile 页面的主人一致！
  // (在 /with_replies 页面中，个人主页顶部的粉丝数属于 profileUser，
  //  被回复的原帖他人推文 author !== profileUser，不应绘制该粉丝比例徽章)
  if (profileUser && author !== profileUser) {
    return false
  }

  // 2. 若配置了具体 targetUsername（且非通配符），作者还必须与 targetUsername 一致
  if (cleanedTarget !== '*' && cleanedTarget !== 'all') {
    if (author !== cleanedTarget) {
      return false
    }
  }

  return true
}

/**
 * 注入与更新数据比例徽章
 */
export function addStatRatioBadges(targetUsername = '*') {
  if (!isTargetProfilePage(targetUsername)) {
    // 若离开主页，清理已追加的徽章
    const badges = document.querySelectorAll('.xf-stat-ratio-badge')
    if (badges.length > 0) {
      badges.forEach((el) => el.remove())
    }
    return
  }

  const followers = getProfileFollowers()
  if (!followers || followers <= 0) return

  // 注入样式
  addStyles(
    'statRatioBadges',
    `
    .xf-stat-ratio-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-left: 2px;
      padding:  1.5px 4px ;
      font-size: 10px;
      font-weight: 700;
      line-height: 1.2;
      border-radius: 4px;
      cursor: help;
      position: relative;
      user-select: none;
      white-space: nowrap;
      vertical-align: middle;
      transition: transform 0.15s ease, opacity 0.15s ease;
    }
    .xf-stat-ratio-badge:hover {
      transform: scale(1.06);
    }
    .xf-instant-tooltip {
      position: absolute;
      bottom: calc(100% + 7px);
      left: 50%;
      transform: translateX(-50%) translateY(4px);
      visibility: hidden;
      opacity: 0;
      pointer-events: none;
      z-index: 99999;
      padding: 5px 9px;
      font-size: 11px;
      font-weight: 500;
      line-height: 1.35;
      white-space: nowrap;
      border-radius: 6px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
      transition: opacity 0.1s cubic-bezier(0, 0, 0.2, 1), transform 0.1s cubic-bezier(0, 0, 0.2, 1);
      background-color: #0f1419;
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.12);
      text-align: left;
    }
    .xf-instant-tooltip::after {
      content: '';
      position: absolute;
      top: 100%;
      left: 50%;
      transform: translateX(-50%);
      border-width: 4px;
      border-style: solid;
      border-color: #0f1419 transparent transparent transparent;
    }
    .xf-stat-ratio-badge:hover .xf-instant-tooltip {
      visibility: visible;
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    html[style*="color-scheme: dark"] .xf-instant-tooltip,
    body[style*="background-color: rgb(0, 0, 0)"] .xf-instant-tooltip,
    body[style*="background-color: rgb(21, 32, 43)"] .xf-instant-tooltip {
      background-color: #1e2732;
      color: #f7f9f9;
      border-color: rgba(255, 255, 255, 0.18);
    }
    html[style*="color-scheme: dark"] .xf-instant-tooltip::after,
    body[style*="background-color: rgb(0, 0, 0)"] .xf-instant-tooltip::after,
    body[style*="background-color: rgb(21, 32, 43)"] .xf-instant-tooltip::after {
      border-color: #1e2732 transparent transparent transparent;
    }
    .xf-instant-tooltip .xf-tt-main {
      font-weight: 700;
      font-size: 11px;
      color: #ffffff;
    }
    .xf-instant-tooltip .xf-tt-sub {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.75);
      margin-top: 2px;
    }
    `
  )

  // 扫描每一个推文数据组
  const tweetGroups = document.querySelectorAll(selectors.tweetCounts)

  tweetGroups.forEach((group) => {
    // 仅在自己的推文上展示数据比例徽章
    if (!isTweetAuthorTarget(group, targetUsername)) {
      group.querySelectorAll('.xf-stat-ratio-badge').forEach((el) => el.remove())
      return
    }

    // 获取该推文的曝光量 (Views/Analytics)
    const analyticsBtn = group.querySelector('a[href*="/analytics"]')
    let impressionsCount = 0
    if (analyticsBtn) {
      impressionsCount = extractCountFromElement(analyticsBtn)
    }

    // 遍历数据组里的按钮：reply, retweet, like, analytics, bookmark
    const btnItems = group.querySelectorAll('button[data-testid], a[href*="/analytics"]')

    btnItems.forEach((btn) => {
      const testId = btn.getAttribute('data-testid')
      const isAnalytics = btn.tagName.toLowerCase() === 'a' || testId === 'analytics'

      const type = isAnalytics
        ? 'analytics'
        : testId === 'reply'
        ? 'reply'
        : testId === 'retweet'
        ? 'retweet'
        : testId === 'like'
        ? 'like'
        : null

      if (!type) return

      const count = extractCountFromElement(btn)
      let level: LevelConfig
      let mainTitle = ''
      let subDetails = ''

      if (type === 'analytics') {
        const ratio = count / followers
        level = getImpressionsRatioLevel(ratio)
        const ratioDisplay = ratio.toFixed(2) + '倍'
        const pctDisplay = (ratio * 100).toFixed(1) + '%'
        mainTitle = `曝光 / 粉丝: ${ratioDisplay} (${pctDisplay})`
        subDetails = `曝光量: ${count.toLocaleString()} |  粉丝数: ${followers.toLocaleString()}`
      } else {
        const ratio = count / followers
        level = getEngagementRatioLevel(ratio)
        const pctDisplay = (ratio * 100).toFixed(2) + '%'

        let extraImpStr = ''
        if (impressionsCount > 0) {
          const impPct = ((count / impressionsCount) * 100).toFixed(2) + '%'
          extraImpStr = ` | 占曝光 ${impPct}`
        }

        const typeNameMap: Record<string, string> = {
          reply: '回复',
          retweet: '转帖',
          like: '喜欢',
          bookmark: '书签',
        }
        const name = typeNameMap[type] || '互动'
        mainTitle = `${name} / 粉丝: ${pctDisplay}`
        subDetails = `${count.toLocaleString()} / ${followers.toLocaleString()}${extraImpStr}`
      }

      // 寻找放置 Badge 的挂载节点
      let container = btn.querySelector('.css-146c3p1') || btn
      let badge = container.querySelector('.xf-stat-ratio-badge') as HTMLElement | null

      if (!badge) {
        badge = document.createElement('span')
        badge.className = 'xf-stat-ratio-badge'
        container.appendChild(badge)
      }

      badge.removeAttribute('title')

      let labelSpan = badge.querySelector('.xf-badge-text') as HTMLElement | null
      if (!labelSpan) {
        labelSpan = document.createElement('span')
        labelSpan.className = 'xf-badge-text'
        badge.appendChild(labelSpan)
      }
      labelSpan.textContent = level.label

      let ttPopup = badge.querySelector('.xf-instant-tooltip') as HTMLElement | null
      if (!ttPopup) {
        ttPopup = document.createElement('span')
        ttPopup.className = 'xf-instant-tooltip'
        badge.appendChild(ttPopup)
      }

      // tooltip 内容仅在 mainTitle/subDetails 变化时重建，避免每 tick 对每条推文重写 innerHTML
      const ttSig = `${mainTitle}|${subDetails}`
      if (ttPopup.dataset.xfSig !== ttSig) {
        ttPopup.dataset.xfSig = ttSig
        ttPopup.innerHTML = `
          <div class="xf-tt-main">${mainTitle}</div>
          <div class="xf-tt-sub">${subDetails}</div>
        `
      }

      // 更新 Badge 状态与样式
      badge.style.color = level.color
      badge.style.backgroundColor = level.bg
    })
  })
}
