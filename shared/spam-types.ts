// 共享类型定义
import { getLocale, t, type Locale, type MessageKey } from './i18n'
/** ai：AI 打分超过阈值被折叠的回复（不是规则分类） */
export type SpamCategory = 'porn_spam' | 'bot' | 'marketing' | 'low_quality' | 'normal' | 'ai'

/** 命中细节，和语言无关；显示时由 formatRuleHit 按语言拼成文字 */
export interface RuleHitDetail {
  /** 命中的原文片段：营销昵称命中的词、重复字符片段 */
  quote?: string
  /** 命中的垃圾词，最多前 2 个 */
  words?: string[]
  /** 个数：命中的垃圾词总数、昵称里的 emoji 个数 */
  count?: number
  /** emoji 占比（%） */
  percent?: number
  /** 被引流的账号 */
  handle?: string
  /** 引流方式：prefix 是「看@」这类前缀，tail 是结尾 @ 账号加随机字符或表情 */
  referral?: 'prefix' | 'tail'
  /** 作者在黑名单里，直接隐藏，不按规则打分 */
  blocklist?: boolean
}

export interface RuleHit {
  id: SpamRuleId
  /** 生成时按当时的语言拼好的说明；旧版本的记录只有这一项 */
  label: string
  score: number
  /** 新记录都带（可能为空对象）；旧记录没有 */
  detail?: RuleHitDetail
}

export interface SpamEvaluation {
  score: number
  hits: RuleHit[]
  category: SpamCategory
  text: string
  authorHandle: string
}

export type SpamRuleId =
  | 'marketing_nickname'
  | 'emoji_ratio'
  | 'short_text'
  | 'random_username'
  | 'marketing_keyword'
  | 'pure_emoji'
  | 'decorated_nickname'
  | 'repeated_chars'
  | 'mention_referral'

// 规则名和说明在 shared/i18n 文案表的 spamRule.<id>.label / .description，用 spamRuleLabel() 等取
export interface SpamRuleMeta {
  id: SpamRuleId
  defaultScore: number
  category: Exclude<SpamCategory, 'normal'>
}

export const SPAM_RULES: SpamRuleMeta[] = [
  {
    id: 'marketing_nickname',
    defaultScore: 40,
    category: 'porn_spam',
  },
  {
    id: 'emoji_ratio',
    defaultScore: 20,
    category: 'low_quality',
  },
  {
    id: 'short_text',
    defaultScore: 10,
    category: 'low_quality',
  },
  {
    id: 'random_username',
    defaultScore: 10,
    category: 'bot',
  },
  {
    id: 'marketing_keyword',
    defaultScore: 35,
    category: 'marketing',
  },
  {
    id: 'pure_emoji',
    defaultScore: 40,
    category: 'low_quality',
  },
  {
    id: 'decorated_nickname',
    defaultScore: 15,
    category: 'low_quality',
  },
  {
    id: 'repeated_chars',
    defaultScore: 20,
    category: 'low_quality',
  },
  {
    id: 'mention_referral',
    defaultScore: 20,
    category: 'porn_spam',
  },
]

export interface SpamLogEntry {
  id: string
  timestamp: number
  authorHandle: string
  authorName: string
  text: string
  score: number
  category: SpamCategory
  hits: RuleHit[]
  action: 'filter' | 'allow'
  /** 谁隐藏的：rule 规则（旧记录没有这一项），ai AI 打分 */
  source?: 'rule' | 'ai'
  /** source 为 ai 时的模型结果 */
  ai?: { score: number; signals: string[]; reason: string }
}

export interface SpamCategoryStat {
  category: SpamCategory
  label: string
  count: number
}

export interface DailyStats {
  date: string // YYYY-MM-DD
  total: number
  byCategory: Record<SpamCategory, number>
}

export function spamRuleLabel(id: SpamRuleId, locale?: Locale): string {
  return t(`spamRule.${id}.label` as MessageKey, undefined, locale)
}

export function spamRuleDescription(id: SpamRuleId, locale?: Locale): string {
  return t(`spamRule.${id}.description` as MessageKey, undefined, locale)
}

/** 按语言拼命中说明，如「垃圾词库（"同城"）」「Spam words ("同城")」 */
export function formatRuleHit(hit: Pick<RuleHit, 'id' | 'detail'>, locale?: Locale): string {
  const rule = spamRuleLabel(hit.id, locale)
  const d = hit.detail
  if (!d) return rule
  if (d.blocklist) return t('spamHit.blocklist', undefined, locale)
  if (d.referral && d.handle) {
    return t(d.referral === 'prefix' ? 'spamHit.referralPrefix' : 'spamHit.referralTail', { rule, handle: d.handle }, locale)
  }
  if (d.percent !== undefined) return t('spamHit.percent', { rule, percent: d.percent }, locale)
  if (d.words?.length) {
    const words = d.words.map((w) => `"${w}"`).join(', ')
    return (d.count ?? 1) > 1
      ? t('spamHit.wordsTotal', { rule, words, count: d.count! }, locale)
      : t('spamHit.words', { rule, words }, locale)
  }
  if (d.quote !== undefined) return t('spamHit.quote', { rule, text: d.quote }, locale)
  if (d.count !== undefined) return t('spamHit.count', { rule, count: d.count }, locale)
  return rule
}

/**
 * 拦截记录里命中项的显示文字。新记录按 detail 用当前语言重新拼；
 * 旧记录只有生成时的中文说明：中文界面照原样显示，其他语言只显示规则名
 */
export function ruleHitText(hit: RuleHit, locale?: Locale): string {
  if (hit.detail) return formatRuleHit(hit, locale)
  return (locale ?? getLocale()) === 'zh-CN' && hit.label ? hit.label : spamRuleLabel(hit.id, locale)
}

export function spamCategoryLabel(category: SpamCategory, locale?: Locale): string {
  return t(`spamCategory.${category}` as MessageKey, undefined, locale)
}
