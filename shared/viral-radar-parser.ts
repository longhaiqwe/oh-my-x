/**
 * 爆款雷达 - 推文流速（Impressions Velocity）解析与分类算法
 */

export type TweetVelocityCategory = 'normal' | 'potential' | 'viral'

/**
 * 从包含数字和单位后缀的字符串中提取数值
 * 支持:
 * - 纯数字 / 逗号分隔: "1,234" -> 1234
 * - K / M / B 英文后缀: "1.2K" -> 1200, "15.3M" -> 15300000, "2B" -> 2000000000
 * - 中文后缀: "1.2万" -> 12000, "1.5千" -> 1500, "1.2亿" -> 120000000
 * - 包含上下文描述: "1.2K Views", "1,234 次浏览", "500 次查看"
 */
export function parseNumberWithSuffix(str: string): number | null {
  if (!str) return null
  const cleaned = str.trim()
  if (!cleaned) return null

  // 1. 中文单位匹配 (亿 / 万 / 千)
  const cnMatch = cleaned.match(/([\d,]+(?:\.\d+)?)\s*([亿萬万千])/)
  if (cnMatch && cnMatch[1] && cnMatch[2]) {
    const val = parseFloat(cnMatch[1].replace(/,/g, ''))
    if (isNaN(val)) return null
    const unit = cnMatch[2]
    if (unit === '亿') return Math.round(val * 100000000)
    if (unit === '万' || unit === '萬') return Math.round(val * 10000)
    if (unit === '千') return Math.round(val * 1000)
  }

  // 2. 英文单位匹配 (K / M / B)
  const enMatch = cleaned.match(/([\d,]+(?:\.\d+)?)\s*([KMBkmb])\b/)
  if (enMatch && enMatch[1] && enMatch[2]) {
    const val = parseFloat(enMatch[1].replace(/,/g, ''))
    if (isNaN(val)) return null
    const unit = enMatch[2].toUpperCase()
    if (unit === 'K') return Math.round(val * 1000)
    if (unit === 'M') return Math.round(val * 1000000)
    if (unit === 'B') return Math.round(val * 1000000000)
  }

  // 3. 普通数字 (带或不带逗号)
  const numMatch = cleaned.match(/[\d,]+(?:\.\d+)?/)
  if (numMatch && numMatch[0]) {
    const val = parseFloat(numMatch[0].replace(/,/g, ''))
    return isNaN(val) ? null : Math.round(val)
  }

  return null
}

/**
 * 从 article[data-testid="tweet"] 中提取浏览量（Impressions / Views）
 */
export function extractTweetViews(article: HTMLElement): number | null {
  // 查找包含 analytics / view 信息的节点
  const analyticsLink =
    article.querySelector<HTMLElement>('a[href*="/analytics"]') ||
    article.querySelector<HTMLElement>('[data-testid="analytics"]') ||
    article.querySelector<HTMLElement>('a[aria-label*="View" i]') ||
    article.querySelector<HTMLElement>('a[aria-label*="view" i]') ||
    article.querySelector<HTMLElement>('a[aria-label*="浏览"]') ||
    article.querySelector<HTMLElement>('a[aria-label*="查看"]')

  if (analyticsLink) {
    // 优先检查 aria-label
    const ariaLabel = analyticsLink.getAttribute('aria-label')
    if (ariaLabel) {
      const parsed = parseNumberWithSuffix(ariaLabel)
      if (parsed !== null) return parsed
    }

    // 检查 visible text
    const text = analyticsLink.textContent
    if (text) {
      const parsed = parseNumberWithSuffix(text)
      if (parsed !== null) return parsed
    }
  }

  // 备选方案：在 article 内部查找可能显示 Views 的链接元素
  const statusLinks = article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]')
  for (const link of Array.from(statusLinks)) {
    const aria = link.getAttribute('aria-label') || ''
    if (aria.includes('View') || aria.includes('view') || aria.includes('浏览') || aria.includes('查看')) {
      const parsed = parseNumberWithSuffix(aria)
      if (parsed !== null) return parsed
    }
    const text = link.textContent || ''
    if (text.includes('View') || text.includes('view') || text.includes('浏览') || text.includes('查看')) {
      const parsed = parseNumberWithSuffix(text)
      if (parsed !== null) return parsed
    }
  }

  return null
}

/**
 * 从 article[data-testid="tweet"] 中提取发布时间戳 (ms)
 */
export function extractTweetPublishTime(article: HTMLElement): number | null {
  const timeEl = article.querySelector<HTMLElement>('time[datetime]')
  if (!timeEl) return null
  const datetimeStr = timeEl.getAttribute('datetime')
  if (!datetimeStr) return null
  const ts = Date.parse(datetimeStr)
  return isNaN(ts) ? null : ts
}

/**
 * 计算推文的每小时流速 (Views / hour)
 */
export function calculateTweetVelocity(
  views: number,
  publishTimeMs: number,
  nowMs: number = Date.now(),
): number {
  if (views <= 0 || publishTimeMs <= 0) return 0
  const elapsedMs = Math.max(nowMs - publishTimeMs, 1000)
  const elapsedHours = elapsedMs / (1000 * 60 * 60)
  // 避免刚发出的推文（如 30 秒内有 5 次浏览）暴增极值：限制最小时间为 1 分钟 (1/60 小时)
  const effectiveHours = Math.max(elapsedHours, 1 / 60)
  return Math.round(views / effectiveHours)
}

/**
 * 根据阈值判断推文流速分类
 */
export function classifyTweetVelocity(
  viewsPerHour: number,
  potentialThreshold: number = 1000,
  viralThreshold: number = 10000,
): TweetVelocityCategory {
  if (viewsPerHour >= viralThreshold) return 'viral'
  if (viewsPerHour >= potentialThreshold) return 'potential'
  return 'normal'
}

/**
 * 格式化每小时流速显示文本
 * 中文：500 -> "500/h", 1200 -> "1.2k/h", 15800 -> "1.6万/h"
 * 其他语言：15800 -> "15.8k/h", 1200000 -> "1.2m/h"
 */
export function formatVelocityBadge(viewsPerHour: number, locale = 'zh-CN'): string {
  if (viewsPerHour >= 10000 && locale.startsWith('zh')) {
    const wan = (viewsPerHour / 10000).toFixed(1).replace(/\.0$/, '')
    return `${wan}万/h`
  }
  if (viewsPerHour >= 1000000) {
    const m = (viewsPerHour / 1000000).toFixed(1).replace(/\.0$/, '')
    return `${m}m/h`
  }
  if (viewsPerHour >= 1000) {
    const k = (viewsPerHour / 1000).toFixed(1).replace(/\.0$/, '')
    return `${k}k/h`
  }
  return `${viewsPerHour}/h`
}
