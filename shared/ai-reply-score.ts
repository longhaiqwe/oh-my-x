// 回复区 AI 打分：提示词、请求内容、返回结果解析。后台、页面脚本和本地验证脚本共用。
// 方案见 docs/plans/ai-reply-scoring.md。提示词分两段：判断标准 + 固定的输出格式。
import { AppError } from './errors'
import type { Locale } from './i18n'

/**
 * 改了提示词就加 1，旧缓存作废。
 * 2：去掉「追问原帖细节就减分」；加 S11 认同 + 复述 + 补一句、S12 蓝 V 低粉；同批雷同提为中信号；送粉丝数和蓝 V
 */
export const REPLY_SCORE_PROMPT_VERSION = 2
/** 一次请求最多判断的回复条数 */
export const REPLY_SCORE_BATCH_SIZE = 20
/** 送给模型的正文最多这么多字 */
export const REPLY_SCORE_TEXT_LIMIT = 500

export const REPLY_SCORE_SIGNALS = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'S11', 'S12'] as const
export type ReplyScoreSignal = (typeof REPLY_SCORE_SIGNALS)[number]

export interface ReplyScoreParent {
  id: string
  author: string
  text: string
}

export interface ReplyScoreItem {
  id: string
  author: string
  text: string
  /** 回复比主帖晚多少秒；拿不到时为 null */
  delaySeconds: number | null
  /** 作者粉丝数；不知道时为 null 或不填 */
  followers?: number | null
  /** 作者是否蓝 V；不知道时为 null 或不填 */
  verified?: boolean | null
}

export interface ReplyScore {
  id: string
  /** 0–100，AI 自动回复的嫌疑分 */
  score: number
  signals: ReplyScoreSignal[]
  reason: string
}

const CRITERIA: Record<Locale, string> = {
  'zh-CN': `你在判断 X（推特）帖子下面的回复是不是 AI 自动生成并发出的，给每条回复打 0–100 的嫌疑分。

## 判断原则
1. AI 自动回复有两种常见写法。一种是通用夸奖，没有接住原帖的具体内容，放到别的帖子下面也成立。另一种是先表示认同，再用原帖里的细节把原帖复述一遍，结尾补一个小建议或一个问题；它引用了原帖细节，看起来具体，但没有原帖以外的信息。
2. 只按证据打分。找不到下面的信号就给低分，不要为了给结果去凑信号。
3. 只有原帖里没有的信息才算真人特征，可以减分：自己的经历、自己的数字或做法、具体的反对意见、错别字和随口的口语。复述原帖的细节、顺着原帖问一个问题，都不算真人特征，不减分。
4. 观点偏激、语气差、外语写得不地道、营销推广，都不能当作 AI 的证据。
5. 打分前先把整批回复读一遍，比较它们之间的用词和句式。

## 信号
- S1 万能回复（强）：没有接住原帖的任何具体内容，放到别的帖子下面也成立
- S2 复述原帖（强）：用原帖的细节或术语把原帖的观点换个说法再说一遍，没有原帖以外的信息
- S3 结构整齐（中）：几十字的回复也是总分总、排比，句子长短一致
- S4 翻转句（中）：「不是……而是……」「It's not X, it's Y」
- S5 结尾总结或拔高（中）：结尾一句总结，或拔高到「本质上」「归根结底」
- S6 结尾提问求回复（中）：「你怎么看？」「What do you think?」这类不针对具体内容的提问
- S7 套话（中）：「值得注意的是」「赋能」，空泛的肯定如「很稳」「很清晰」「很省心」，Great point、Absolutely、game-changer
- S8 祝福结尾或 emoji 过多（弱）：「加油」「继续保持」，或几乎每句都带 emoji
- S9 回复很快却很长（弱）：很短的时间里写了一大段
- S10 同批雷同（中）：同一批里几条回复用了相同的关键词（例如都说「稳」「省心」）、相同的句式，或复述同一段内容；命中的每一条都算
- S11 认同 + 复述 + 补一句（中）：开头表示认同（「很认同」「这套很实用」），中间复述原帖要点，结尾补一个小建议（「要是能……就更……」）或一个二选一的问题（「是……还是……？」）
- S12 蓝 V 但粉丝很少（弱）：verified 为 true，followers 少于 200。只能作为辅助：没有其他信号时，不能单靠它把分数打到 31 以上

## 打分
强信号加 30–40 分，中信号加 15–20 分，弱信号加 5–10 分，命中几个就加几个；真人特征减分。`,
  en: `You are checking whether replies under an X (Twitter) post were generated and posted by AI. Give each reply a suspicion score from 0 to 100.

## Principles
1. AI auto-replies come in two common forms. One is generic praise that engages with nothing specific in the post and would fit under any post. The other agrees first, then restates the post using its own details, and ends with a small suggestion or a question; it quotes details from the post and looks specific, but adds nothing beyond the post.
2. Score only on evidence. If none of the signals below appear, give a low score. Do not invent signals.
3. Only information that is not in the post counts as a human trait and lowers the score: the author's own experience, own numbers or methods, specific disagreement, typos and offhand wording. Restating details of the post, or asking a question that follows from the post, is not a human trait and does not lower the score.
4. Strong opinions, rude tone, non-native language, or promotion are not evidence of AI.
5. Before scoring, read the whole batch and compare wording and sentence patterns across replies.

## Signals
- S1 Generic reply (strong): engages with nothing specific in the post; would fit under any post
- S2 Restates the post (strong): repeats the post's point in other words using its details or terms, adds nothing beyond the post
- S3 Tidy structure (medium): even a short reply has intro-body-conclusion, parallel lists, sentences of equal length
- S4 Contrast framing (medium): "It's not X, it's Y", 「不是……而是……」
- S5 Summary or elevation at the end (medium): a closing one-line takeaway, or lifting the topic to "at its core", "ultimately"
- S6 Engagement question at the end (medium): "What do you think?", 「你怎么看？」, questions not tied to anything specific
- S7 Stock phrases (medium): "It's worth noting", empty approval such as "solid", "super clean", "so practical", Great point, Absolutely, game-changer
- S8 Well-wishing ending or heavy emoji (weak): "Keep it up", or an emoji in almost every sentence
- S9 Long reply posted very fast (weak): a long reply within a very short time
- S10 Near-identical replies (medium): several replies in the batch share the same keywords (e.g. all call it "solid"), the same sentence pattern, or restate the same part of the post; count it for each reply involved
- S11 Agree + restate + one more line (medium): opens with agreement ("Totally agree", "This setup is so practical"), restates the post's points, ends with a small suggestion ("would be even better if ...") or an either-or question ("is it X or Y?")
- S12 Verified but very few followers (weak): verified is true and followers is under 200. Supporting evidence only: without other signals it must not push the score above 30

## Scoring
A strong signal adds about 30–40, a medium signal 15–20, a weak signal 5–10; add up every signal that applies; human traits subtract.`,
}

const OUTPUT_FORMAT: Record<Locale, string> = {
  'zh-CN': `## 输出格式
- 输入是 JSON：parent 是原帖，replies 是要判断的回复。每条回复有 id、author、text、delaySeconds（比原帖晚的秒数）、followers（作者粉丝数）、verified（作者是否蓝 V）；值为 null 表示不知道。
- 每条回复都要给出结果，id 原样返回。
- score：0–100 的整数。0–30 像真人，31–69 可疑，70–100 高度可疑。
- signals：命中的信号编号，例如 ["S2","S11"]；没有就给 []。
- reason：一句中文，说明依据，引用回复里的原词，不超过 40 字。
- 只输出 JSON，不要解释，不要代码块标记：
{"results":[{"id":"回复 id","score":0,"signals":[],"reason":"…"}]}`,
  en: `## Output format
- The input is JSON: parent is the post, replies are the replies to check. Each reply has id, author, text, delaySeconds (seconds after the post), followers (the author's follower count), verified (whether the author has a blue check); null means unknown.
- Return a result for every reply, with the id unchanged.
- score: an integer from 0 to 100. 0–30 looks human, 31–69 suspicious, 70–100 highly suspicious.
- signals: the matched signal codes, e.g. ["S2","S11"]; use [] if none.
- reason: one English sentence explaining the evidence, quoting words from the reply, at most 25 words.
- Output JSON only, no explanation, no code fences:
{"results":[{"id":"reply id","score":0,"signals":[],"reason":"…"}]}`,
}

export function buildReplyScoreSystemPrompt(locale: Locale = 'zh-CN'): string {
  return `${CRITERIA[locale]}\n\n${OUTPUT_FORMAT[locale]}`
}

function clip(text: string): string {
  const chars = Array.from(text.trim())
  return chars.length > REPLY_SCORE_TEXT_LIMIT ? `${chars.slice(0, REPLY_SCORE_TEXT_LIMIT).join('')}…` : chars.join('')
}

export function buildReplyScoreUserMessage(parent: ReplyScoreParent, replies: ReplyScoreItem[]): string {
  return JSON.stringify({
    parent: { author: parent.author, text: clip(parent.text) },
    replies: replies.map((reply) => ({
      id: reply.id,
      author: reply.author,
      text: clip(reply.text),
      delaySeconds: reply.delaySeconds,
      followers: reply.followers ?? null,
      verified: reply.verified ?? null,
    })),
  })
}

export function buildReplyScoreMessages(
  parent: ReplyScoreParent,
  replies: ReplyScoreItem[],
  locale: Locale = 'zh-CN',
): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    { role: 'system', content: buildReplyScoreSystemPrompt(locale) },
    { role: 'user', content: buildReplyScoreUserMessage(parent, replies) },
  ]
}

const SIGNAL_SET = new Set<string>(REPLY_SCORE_SIGNALS)

/**
 * 解析模型返回的文字。容忍 JSON 前后的多余文字和代码块标记；
 * 只保留本批里的 ID，分数四舍五入并限制在 0–100，未知的信号编号丢掉。
 * 整段解析不出来时抛错。
 */
export function parseReplyScoreResponse(text: string, batchIds: Iterable<string>): ReplyScore[] {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) throw new AppError('error.aiScoreParse')
  let data: any
  try {
    data = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new AppError('error.aiScoreParse')
  }
  if (!Array.isArray(data?.results)) throw new AppError('error.aiScoreParse')

  const allowed = new Set(batchIds)
  const seen = new Set<string>()
  const results: ReplyScore[] = []
  for (const item of data.results) {
    if (!item || item.id == null) continue
    const id = String(item.id)
    if (!allowed.has(id) || seen.has(id)) continue
    const raw = Number(item.score)
    if (!Number.isFinite(raw)) continue
    seen.add(id)
    const signals = Array.isArray(item.signals)
      ? [...new Set(item.signals.map((s: unknown) => String(s).trim().toUpperCase()))].filter((s): s is ReplyScoreSignal => SIGNAL_SET.has(s as string))
      : []
    results.push({
      id,
      score: Math.min(100, Math.max(0, Math.round(raw))),
      signals,
      reason: typeof item.reason === 'string' ? item.reason.trim().slice(0, 160) : '',
    })
  }
  return results
}

/** 回复比主帖晚多少秒；任一时间缺失或回复早于主帖时返回 null */
export function replyDelaySeconds(parentTime: number | null, replyTime: number | null): number | null {
  if (parentTime == null || replyTime == null || replyTime < parentTime) return null
  return Math.round((replyTime - parentTime) / 1000)
}
