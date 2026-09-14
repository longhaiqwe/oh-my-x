import { defaultSpamKeywords } from '../storage-keys'
import type {
  RuleHit,
  SpamCategory,
  SpamEvaluation,
  SpamRuleId,
} from './spam-types'
import { SPAM_RULES } from './spam-types'

export interface RuleContext {
  text: string
  authorName: string
  authorHandle: string
  keywords: string[]
  /** 与 keywords 按索引对应的预 normalize 结果；由调用方缓存，避免每次扫描重复正则 */
  normalizedKeywords: string[]
  enabledRules: Set<SpamRuleId>
}

function getRuleMeta(id: SpamRuleId) {
  return SPAM_RULES.find((r) => r.id === id)!
}

function countEmoji(text: string): number {
  // 常见 emoji 范围；注意 FE0F（变体选择器）和 U+200D（ZWJ）不是 emoji 本身
  const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/gu
  const matches = text.match(emojiRegex)
  return matches ? matches.length : 0
}

function stripEmoji(text: string): string {
  return text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu, '').trim()
}

export function normalizeForSpam(text: string): string {
  if (!text) return ''
  return text
    // 1. 去除 URL
    .replace(/https?:\/\/[^\s]+/g, '')
    // 2. 去除 @handle 以及尾部跟随的随机短码（如 "@yzjddb 0I"）
    .replace(/@[a-zA-Z0-9_]+(?:\s+[a-zA-Z0-9]{1,4})?/g, '')
    // 3. 去除 emoji 和变体选择器/连接符
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    // 4. 去除零宽字符与不可见字符
    .replace(/[\u200B-\u200D\uFEFF\u2060]/gu, '')
    // 5. 去除标点符号与空白
    .replace(/[，。！？!?,.:;…~～#^*()（）[\]【】\-_/\\|`'"“”‘’<>《》+=`\s]/g, '')
    // 6. 去除夹杂在汉字之间或汉字开头/结尾的 1-3 位英文字母噪音（如 "X ry就比她骚" -> "就比她骚"）
    .replace(/(?:^|(?<=[\u4e00-\u9fa5]))[a-zA-Z]{1,3}(?=[\u4e00-\u9fa5]|$)/g, '')
    .toLowerCase()
}

function checkMarketingNickname(ctx: RuleContext): RuleHit | null {
  const meta = getRuleMeta('marketing_nickname')
  const raw = `${ctx.authorName} ${ctx.authorHandle}`.toLowerCase()
  const norm = normalizeForSpam(`${ctx.authorName} ${ctx.authorHandle}`)
  const matched = ctx.keywords.find((kw, i) => {
    if (!kw) return false
    const kwLower = kw.toLowerCase()
    const kwNorm = ctx.normalizedKeywords[i]
    return raw.includes(kwLower) || (kwNorm.length >= 2 && norm.includes(kwNorm))
  })
  if (!matched) return null
  return { id: meta.id, label: `${meta.label}（"${matched}"）`, score: meta.defaultScore }
}

function checkEmojiRatio(ctx: RuleContext): RuleHit | null {
  const meta = getRuleMeta('emoji_ratio')
  const text = ctx.text
  if (!text) return null
  const emojiCount = countEmoji(text)
  if (emojiCount === 0) return null
  // 用代码点长度而非 UTF-16 长度，避免多字节 emoji 被算成 2
  const codePointLen = [...text].length
  if (codePointLen === 0) return null
  const ratio = emojiCount / codePointLen
  if (ratio < 0.5) return null
  return {
    id: meta.id,
    label: `${meta.label}（${Math.round(ratio * 100)}%）`,
    score: meta.defaultScore,
  }
}

function checkShortText(ctx: RuleContext): RuleHit | null {
  const meta = getRuleMeta('short_text')
  const stripped = ctx.text.trim()
  if (stripped.length >= 8) return null
  if (stripped.length === 0) return null
  return { id: meta.id, label: meta.label, score: meta.defaultScore }
}

function checkRandomUsername(ctx: RuleContext): RuleHit | null {
  const meta = getRuleMeta('random_username')
  const handle = ctx.authorHandle
  if (!handle) return null

  const h = handle.toLowerCase()
  if (!h.length) return null
  let suspicion = 0

  // 1. 大段连续数字（5位以上）：末尾随机数字段是 bot 常见特征
  const digitClusters = h.match(/\d+/g)
  const maxDigitLen = digitClusters ? Math.max(...digitClusters.map((d) => d.length)) : 0
  if (maxDigitLen >= 5) suspicion += 40
  else if (maxDigitLen === 4) suspicion += 15

  // 2. 连续辅音堆积（5+ 非元音非数字字符）：随机乱码典型特征（如 "zxcvbnm"）
  if (/[^aeiou\d]{5,}/.test(h)) suspicion += 50

  // 3. 数字占比超过 50%
  const digitRatio = (h.match(/\d/g)?.length || 0) / h.length
  if (digitRatio > 0.5) suspicion += 30

  // 4. 字母数字严格交替出现（算法生成特征，如 "a1b2c3d4e5"）
  if (/^(?:[a-z]\d){4,}$/.test(h) || /^(?:\d[a-z]){4,}$/.test(h)) suspicion += 60

  // 5. 字母部分完全无元音（如 "zxcvbnm123"）
  const lettersOnly = h.replace(/\d/g, '')
  if (lettersOnly.length >= 5 && !/[aeiou]/.test(lettersOnly)) suspicion += 30

  // 6. 超长 handle（12+ 字符）额外加权
  if (h.length > 12) suspicion += 10

  if (suspicion >= 60) {
    const score = suspicion >= 80 ? 25 : 15
    return { id: meta.id, label: meta.label, score }
  }
  return null
}

function checkMarketingKeyword(ctx: RuleContext): RuleHit | null {
  const meta = getRuleMeta('marketing_keyword')
  if (!ctx.keywords.length) return null

  const rawText = ctx.text.toLowerCase()
  const normText = normalizeForSpam(ctx.text)

  const matchedKeywords: string[] = []
  for (let i = 0; i < ctx.keywords.length; i++) {
    const kw = ctx.keywords[i]
    if (!kw) continue
    const kwLower = kw.toLowerCase()
    const kwNorm = ctx.normalizedKeywords[i]
    if (
      rawText.includes(kwLower) ||
      (kwNorm.length >= 2 && normText.includes(kwNorm))
    ) {
      if (!matchedKeywords.includes(kw)) {
        matchedKeywords.push(kw)
      }
    }
  }

  if (matchedKeywords.length === 0) return null

  // 基础首词给 meta.defaultScore (35分)；每额外多命中 1 个不同关键词加 15 分，最高封顶 65 分
  const extraCount = matchedKeywords.length - 1
  const score = Math.min(65, meta.defaultScore + extraCount * 15)

  const preview =
    matchedKeywords.length === 1
      ? `"${matchedKeywords[0]}"`
      : `"${matchedKeywords.slice(0, 2).join('", "')}"等${matchedKeywords.length}个`

  return {
    id: meta.id,
    label: `${meta.label}（${preview}）`,
    score,
  }
}

function checkMentionReferral(ctx: RuleContext): RuleHit | null {
  const meta = getRuleMeta('mention_referral')
  const text = ctx.text.trim()
  if (!text) return null

  // 1. 显式引流前缀：如 "看@", "主页@", "👉@", "找@" 等
  const directReferralPattern = /(?:看|找|戳|关注|主页|私信|👉|👇|👆|☞)\s*@([a-zA-Z0-9_]{3,20})/u
  const dirMatch = text.match(directReferralPattern)
  if (dirMatch) {
    return {
      id: meta.id,
      label: `${meta.label}（引流 @${dirMatch[1]}）`,
      score: meta.defaultScore,
    }
  }

  // 2. 尾部 @账号 伴随随机防重字符或单个/少量 emoji（现代黄推矩阵特征，如 "@yzjddb 0I", "@Tuya1su 🫣😡"）
  const tailNoisePattern = /@([a-zA-Z0-9_]{3,20})\s+([a-zA-Z0-9]{1,4}|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]{1,4})\s*$/u
  const tailMatch = text.match(tailNoisePattern)
  if (tailMatch) {
    return {
      id: meta.id,
      label: `${meta.label}（导流 @${tailMatch[1]}）`,
      score: meta.defaultScore,
    }
  }

  return null
}

function checkPureEmoji(ctx: RuleContext): RuleHit | null {
  const meta = getRuleMeta('pure_emoji')
  if (!ctx.text) return null
  // 去掉 emoji 后，还可能剩零宽字符（ZWNJ/ZWJ/WJ/BOM）和空白，一并去掉再判断
  const remaining = stripEmoji(ctx.text)
    .replace(/[\u200C\u200D\u2060\uFEFF]/g, '')
    .trim()
  if (remaining !== '') return null
  return { id: meta.id, label: meta.label, score: meta.defaultScore }
}

function checkDecoratedNickname(ctx: RuleContext): RuleHit | null {
  const meta = getRuleMeta('decorated_nickname')
  const name = ctx.authorName
  if (!name) return null
  const emojiCount = countEmoji(name)
  // 满足 2 个以上 emoji，或者包含指向性引流装饰符号（如 👉/👇/👆/☞）
  const hasReferralPointing = /(?:👉|👇|👆|☞)/u.test(name)
  if (emojiCount < 2 && !hasReferralPointing) return null
  return {
    id: meta.id,
    label: `${meta.label}（${emojiCount || 1}个）`,
    score: meta.defaultScore,
  }
}

function checkRepeatedChars(ctx: RuleContext): RuleHit | null {
  const meta = getRuleMeta('repeated_chars')
  if (!ctx.text) return null

  // 1. 去掉 URL，避免网址中的重复字符（"https://", "ahhh", "//" 等）误判
  let text = ctx.text.replace(/https?:\/\/[^\s]+/g, ' ').trim()
  if (!text) return null

  // 2. 只检测非标点字符的连续重复 ≥4 次
  //    排除 ASCII 标点/符号/空白，这些重复是正常用法（!!!  ...  ---）
  //    汉字、字母、数字、emoji 的连续重复才是真正的 spam 信号
  const pattern = /([^\s.,!?\-:;_~#@*=|/\\])\1{3,}/u
  if (!pattern.test(text)) return null

  const match = text.match(pattern)!
  const preview = match[0].length > 5 ? match[0].slice(0, 5) + '…' : match[0]
  return {
    id: meta.id,
    label: `${meta.label}（"${preview}"）`,
    score: meta.defaultScore,
  }
}

const RULE_CHECKS: Record<SpamRuleId, (ctx: RuleContext) => RuleHit | null> = {
  marketing_nickname: checkMarketingNickname,
  emoji_ratio: checkEmojiRatio,
  short_text: checkShortText,
  random_username: checkRandomUsername,
  marketing_keyword: checkMarketingKeyword,
  pure_emoji: checkPureEmoji,
  decorated_nickname: checkDecoratedNickname,
  repeated_chars: checkRepeatedChars,
  mention_referral: checkMentionReferral,
}

function inferCategory(hits: RuleHit[]): SpamCategory {
  if (hits.length === 0) return 'normal'
  // 命中规则的 category，按优先级排
  const order: SpamCategory[] = ['porn_spam', 'marketing', 'bot', 'low_quality']
  for (const cat of order) {
    if (hits.some((h) => getRuleMeta(h.id).category === cat)) {
      return cat
    }
  }
  return 'normal'
}

export function evaluateSpam(input: {
  text: string
  authorName: string
  authorHandle: string
  keywords?: string[]
  /** 预 normalize 的关键词；与 keywords 索引对应。未提供时自动计算。 */
  normalizedKeywords?: string[]
  enabledRules?: Set<SpamRuleId> | null
}): SpamEvaluation {
  const enabledRules =
    input.enabledRules ?? new Set(SPAM_RULES.map((r) => r.id))
  const keywords = input.keywords ?? defaultSpamKeywords
  const ctx: RuleContext = {
    text: input.text,
    authorName: input.authorName,
    authorHandle: input.authorHandle,
    keywords,
    normalizedKeywords: input.normalizedKeywords ?? keywords.map((kw) => normalizeForSpam(kw)),
    enabledRules,
  }

  const hits: RuleHit[] = []
  for (const rule of SPAM_RULES) {
    if (!enabledRules.has(rule.id)) continue
    const hit = RULE_CHECKS[rule.id](ctx)
    if (hit) hits.push(hit)
  }

  const score = hits.reduce((acc, h) => acc + h.score, 0)
  return {
    score,
    hits,
    category: inferCategory(hits),
    text: input.text,
    authorHandle: input.authorHandle,
  }
}

export function parseKeywordList(raw: string | undefined | null): string[] {
  if (!raw) return []
  return raw
    .split(/[\n,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
}

export function parseHandleList(raw: string | undefined | null): string[] {
  if (!raw) return []
  return raw
    .split(/[\n,，\s]+/)
    .map((s) => s.trim().replace(/^@/, '').toLowerCase())
    .filter(Boolean)
}

export function parseEnabledRules(
  raw: string | undefined | null,
): Set<SpamRuleId> {
  const all = new Set<SpamRuleId>(SPAM_RULES.map((r) => r.id))
  if (!raw) return all
  const map = new Map<string, string>()
  raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const [id, val] = entry.split(':')
      if (id) map.set(id.trim(), (val || 'on').trim())
    })
  return new Set(
    SPAM_RULES.filter((r) => map.get(r.id) !== 'off').map((r) => r.id),
  )
}

export function serializeEnabledRules(set: Set<SpamRuleId>): string {
  return SPAM_RULES.map((r) => `${r.id}:${set.has(r.id) ? 'on' : 'off'}`).join(
    ',',
  )
}
