/**
 * 原创内容奖励（Original Content Rewards）数据类型定义与解析工具
 */

export interface CreatorRewardsRequirements {
  premium: boolean
  age18: boolean
  verifiedFollowers: boolean
  impressionsMet: boolean
}

export interface CreatorRewardsStats {
  /** 格式化曝光文本，例如 "217.6K" */
  impressionsText: string
  /** 换算为数字的当前曝光量，例如 217600 */
  impressionsCount: number
  /** 目标曝光量数字，固定 500000 */
  targetImpressionsCount: number
  /** 目标曝光量文本，固定 "500K" */
  targetImpressionsText: string
  /** 进度百分比，例如 43.5 */
  progressPercent: number
  /** 各项准入资格达成状态 */
  requirements: CreatorRewardsRequirements
  /** 数据更新时间戳 */
  updatedAt: number
}

export const TARGET_IMPRESSIONS_COUNT = 500000
export const TARGET_IMPRESSIONS_TEXT = '500K'

/**
 * 判断是否为创作者奖励相关请求 URL
 */
export function isCreatorRewardsUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false
  return (
    url.includes('creators/original_content_rewards') ||
    url.includes('/i/jfapi/creators/original_content_rewards')
  )
}

/**
 * 将带单位的数字文本转换为数值
 * 仅识别大写 K、大写 M 与中文"万"（严禁小写 m，以防将分钟或 CSS 类名如 2m 误判为 200 万）
 */
export function parseNumberWithUnit(text: string): number {
  if (!text) return 0
  const clean = text.trim().replace(/,/g, '')

  // 严格匹配数字 + 大写 K/M 或中文 万
  const unitMatch = clean.match(/^([\d.]+)\s*([KM万])?$/)
  if (unitMatch) {
    const base = parseFloat(unitMatch[1])
    if (isNaN(base)) return 0
    const unit = unitMatch[2] || ''
    if (unit === 'K') return Math.round(base * 1000)
    if (unit === 'M') return Math.round(base * 1000000)
    if (unit === '万') return Math.round(base * 10000)
    return Math.round(base)
  }

  // 若带小写 k，也兼容千位
  const lowerKMatch = clean.match(/^([\d.]+)\s*k$/)
  if (lowerKMatch) {
    const base = parseFloat(lowerKMatch[1])
    return isNaN(base) ? 0 : Math.round(base * 1000)
  }

  const num = parseFloat(clean)
  return isNaN(num) ? 0 : Math.round(num)
}

/**
 * 格式化数值为展示文本
 */
export function formatImpressionsCount(count: number): string {
  if (count <= 0) return '0'
  if (count >= 1000000) {
    const m = count / 1000000
    return `${Number(m.toFixed(1))}M`
  }
  if (count >= 1000) {
    const k = count / 1000
    return `${Number(k.toFixed(1))}K`
  }
  return String(count)
}

const REWARDS_ANCHORS = [
  '回复不计入曝光',
  'Replies do not count',
  '已验证首页时间线曝光',
  '时间线曝光',
  'home timeline impressions',
  'verified impressions',
  '50 万次',
  '50万次',
  '500,000',
  '500K',
]

/**
 * 从 Jetfuel 响应流或页面文本中提取创作者奖励进度数据
 */
export function parseCreatorRewardsPayload(
  payload: ArrayBuffer | Uint8Array | string,
): CreatorRewardsStats | null {
  if (!payload) return null

  let text = ''
  if (typeof payload === 'string') {
    text = payload
  } else {
    try {
      const bytes =
        payload instanceof Uint8Array
          ? payload
          : new Uint8Array(payload)
      text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    } catch {
      return null
    }
  }

  if (!text) return null

  // 1. 提取当前曝光量文本与数值
  // 匹配形如 "219.6K", "217.6K", "52.3K", "1.2M", "219,600" 等曝光数字格式
  // 排除前面带连字符的情况（如 "w-2m", "p-2m"），且仅允许 [KM万] 或千分位纯数字
  const candidateRegex =
    /(?:^|[^\w\-])(\d+(?:\.\d+)?\s*[KMk万]|\d{1,3}(?:,\d{3})+)(?:[^\w\-]|$)/g

  let bestMatchText = ''
  let minDistance = Infinity

  for (const m of text.matchAll(candidateRegex)) {
    const raw = m[1].trim()
    const cleanNum = raw.replace(/,/g, '')

    // 过滤掉目标值（500K / 500,000 / 50万）
    if (
      cleanNum === '500K' ||
      cleanNum === '500k' ||
      cleanNum === '500000' ||
      cleanNum === '50万' ||
      cleanNum === '50 万'
    ) {
      continue
    }

    const val = parseNumberWithUnit(raw)
    if (val <= 0) continue

    // 计算当前匹配项距离最近关键词锚点的字符距离
    const pos = m.index ?? 0
    let localMinDist = Infinity

    for (const anchor of REWARDS_ANCHORS) {
      let aIdx = text.indexOf(anchor)
      while (aIdx !== -1) {
        const dist = Math.abs(pos - aIdx)
        if (dist < localMinDist) {
          localMinDist = dist
        }
        aIdx = text.indexOf(anchor, aIdx + 1)
      }
    }

    if (localMinDist < minDistance) {
      minDistance = localMinDist
      bestMatchText = raw
    }
  }

  let currentCount = 0
  let currentText = ''

  if (bestMatchText) {
    currentText = bestMatchText
    currentCount = parseNumberWithUnit(bestMatchText)
  } else {
    // 降级兜底：若未命中锚点但存在明确的奖励关键词与有效数字
    if (text.includes('original_content_rewards') || text.includes('creators')) {
      currentText = '0'
      currentCount = 0
    } else {
      return null
    }
  }

  const progressPercent = Math.min(
    100,
    Math.max(
      0,
      Math.round((currentCount / TARGET_IMPRESSIONS_COUNT) * 1000) / 10,
    ),
  )

  // 2. 判定各项资格条件
  // 曝光项必须数值达到 500,000 才是达成状态，未达到时必须为 false
  const impressionsMet = currentCount >= TARGET_IMPRESSIONS_COUNT

  const requirements: CreatorRewardsRequirements = {
    premium: true,
    age18: true,
    verifiedFollowers: true,
    impressionsMet,
  }

  return {
    impressionsText: currentText || formatImpressionsCount(currentCount),
    impressionsCount: currentCount,
    targetImpressionsCount: TARGET_IMPRESSIONS_COUNT,
    targetImpressionsText: TARGET_IMPRESSIONS_TEXT,
    progressPercent,
    requirements,
    updatedAt: Date.now(),
  }
}

/**
 * 判断创作者奖励数据是否已过期需要重新获取
 *
 * 刷新分界线（Milestone）：每天北京时间 10:30（对应 UTC 02:30）。
 * - 若当前时间已过今天的 10:30，但数据的更新时间在今天 10:30 之前，则数据过期，应刷新。
 * - 若当前时间尚未到达今天的 10:30，只要数据是在昨天 10:30 之后获取的，即视为有效，无需刷新。
 * - 若未获取过（无 updatedAt），则直接判定为过期。
 *
 * @param updatedAt 上次更新时间戳（毫秒）
 * @param nowTimestamp 当前时间戳（毫秒，默认当前系统时间）
 */
export function isCreatorRewardsStale(
  updatedAt?: number | null,
  nowTimestamp: number = Date.now(),
): boolean {
  if (!updatedAt || updatedAt <= 0) return true

  const now = new Date(nowTimestamp)
  // 当天的 UTC 02:30 (对应北京时间 10:30)
  const todayMilestone = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    2,
    30,
    0,
    0,
  )

  const effectiveMilestone =
    nowTimestamp >= todayMilestone
      ? todayMilestone
      : todayMilestone - 24 * 60 * 60 * 1000

  return updatedAt < effectiveMilestone
}
