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

interface CreatorRewardsPayout {
  /** 保留 X 已格式化的发放金额，包括真实的 $0.00 */
  paidAmount?: string
  /** X 显示的日历日期，不含时区或发放时间 */
  nextPayoutDate?: string
}

/** 页面阶段和收益发放信息独立于曝光读数。 */
export type CreatorRewardsPageState =
  | { stage: 'tracking' | 'application' | 'under_review'; updatedAt: number }
  | ({ stage: 'active'; updatedAt: number } & CreatorRewardsPayout)

export type CreatorRewardsObservation =
  | { kind: 'progress'; stats: CreatorRewardsStats }
  | { kind: 'application' | 'under_review'; updatedAt: number }
  | ({ kind: 'active'; updatedAt: number } & CreatorRewardsPayout)

const PAYOUT_AMOUNT = /\$\d+(?:,\d{3})*\.\d{2}(?!\d)/
const PAYOUT_DATE = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{1,2}, \d{4}(?!\d)/

function parseDashboardPayout(text: string): CreatorRewardsPayout {
  // 实测顺序是金额在「累计收益发放」之前，日期在「下次发放日期」之后。
  // 二进制控制字段隔开相邻文本。仅在各自标签附近取值，避免读取规则里的最低发放金额。
  const paidLabel = /累计收益发放|(?:total|lifetime|all-time) payouts/i.exec(text)
  const dateLabel = /下次发放日期|next payout date/i.exec(text)
  const paidAmount = paidLabel
    ? Array.from(text.slice(Math.max(0, paidLabel.index - 100), paidLabel.index).matchAll(new RegExp(PAYOUT_AMOUNT, 'g'))).at(-1)?.[0]
    : undefined
  const dateText = dateLabel ? text.slice(dateLabel.index + dateLabel[0].length, dateLabel.index + dateLabel[0].length + 100).match(PAYOUT_DATE)?.[0] : undefined
  const dateMs = dateText ? Date.parse(`${dateText} UTC`) : NaN
  return {
    ...(paidAmount && { paidAmount }),
    ...(Number.isFinite(dateMs) && { nextPayoutDate: new Date(dateMs).toISOString().slice(0, 10) }),
  }
}

export function parseCreatorRewardsPageState(raw: unknown): CreatorRewardsPageState | null {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Number.isFinite(value?.updatedAt) || value.updatedAt <= 0) return null
    if (value.stage === 'active') {
      const { updatedAt, paidAmount, nextPayoutDate } = value
      return {
        stage: 'active', updatedAt,
        ...(typeof paidAmount === 'string' && paidAmount.match(PAYOUT_AMOUNT)?.[0] === paidAmount && { paidAmount }),
        ...(typeof nextPayoutDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(nextPayoutDate) &&
          Number.isFinite(Date.parse(`${nextPayoutDate}T00:00:00Z`)) && { nextPayoutDate }),
      }
    }
    if (['tracking', 'application', 'under_review'].includes(value.stage)) return { stage: value.stage, updatedAt: value.updatedAt }
  } catch {}
  return null
}

/** 同时识别进度与申请阶段。2026-11-19 实测申请页含 application_next 和 select_posts。 */
export function parseCreatorRewardsObservation(payload: ArrayBuffer | Uint8Array | string): CreatorRewardsObservation | null {
  const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload)
  // 普通 HTML 外壳、登录页、预载脚本均不能作为达标凭据。
  if (/<(?:!doctype|html|script)\b/i.test(text)) return null
  if (text.includes('page!creators_original_content_rewards') && /\bsection[\x00-\x20]+dashboard\b/.test(text)) {
    return { kind: 'active', updatedAt: Date.now(), ...parseDashboardPayout(text) }
  }
  if (!REWARDS_PAGE_MARKERS.some(marker => text.includes(marker))) {
    const reviewRoute = text.includes('creators_original_content_rewards') && text.includes('under_review_done') && text.includes('/creators/studio')
    const reviewPage = text.includes('账户审核') && text.includes('申请审核中') && text.includes('感谢提交！你很快会收到更新。')
    if (reviewRoute || reviewPage) return { kind: 'under_review', updatedAt: Date.now() }
    const applicationRoute = text.includes('creators_original_content_rewards') && text.includes('application_next') && text.includes('/creators/original_content_rewards/select_posts')
    const applicationPage = text.includes('让帖子开始为你赚取收益') && text.includes('申请加入原创内容奖励计划，开始赚取内容收益。') && text.includes('下一步')
    if (applicationRoute || applicationPage) return { kind: 'application', updatedAt: Date.now() }
  }
  const stats = parseCreatorRewardsPayload(text)
  return stats ? { kind: 'progress', stats } : null
}

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

/**
 * 奖励页上紧挨曝光数字的两段说明文字（中文 / 英文界面，2026-10-18 从 X 接口返回内容中取得）：
 * 「过去 90 天内，累积至少 50 万次已验证首页时间线曝光」/ "Have at least 500K Verified Home Timeline impressions in the last 90 days"
 * 「回复不计入曝光」/ "Does not include replies"
 */
export const REWARDS_PAGE_MARKERS = [
  '回复不计入曝光',
  '已验证首页时间线曝光',
  'Does not include replies',
  'Verified Home Timeline impressions',
]

const REWARDS_ANCHORS = [
  ...REWARDS_PAGE_MARKERS,
  '时间线曝光',
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
    const pos = (m.index ?? 0) + m[0].indexOf(m[1])

    // 说明中的 500K 是目标值；紧邻「回复不计入曝光」的独立读数也可能恰好是 500K。
    if (
      cleanNum === '500K' ||
      cleanNum === '500k' ||
      cleanNum === '500000' ||
      cleanNum === '50万' ||
      cleanNum === '50 万'
    ) {
      const afterNumber = text.slice(pos + raw.length)
      if (!/^(?:[\s\x00-\x1f]|<[^>]*>)*(?:回复不计入曝光|Does not include replies)/.test(afterNumber)) {
        continue
      }
    }

    const val = parseNumberWithUnit(raw)
    if (val <= 0) continue

    // 计算当前匹配项距离最近关键词锚点的字符距离
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
    // 页面可能已进入申请流程，不再显示进度。缺少数字不代表曝光归零；
    // 返回 null，让调用方保留旧读数，也不向每日历史写入虚假的变化。
    return null
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
