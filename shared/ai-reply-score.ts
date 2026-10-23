// 回复区 AI 打分：提示词、请求内容、返回结果解析。后台、页面脚本和本地验证脚本共用。
// 方案见 docs/plans/ai-reply-scoring.md。提示词分两段：判断标准 + 固定的输出格式。
import { AppError } from './errors'
import type { Locale } from './i18n'

/**
 * 改了提示词就加 1，旧缓存作废。
 * 2：去掉「追问原帖细节就减分」；加 S11 认同 + 复述 + 补一句、S12 蓝 V 低粉；同批雷同提为中信号；送粉丝数和蓝 V
 * 3：回复别人评论的回复带上被回复的评论（replyTo），切题和复述按那条评论判断
 * 4：减少输出：回复用序号代替推文 ID，结果字段用一个字母（i s g r），31 分以上才写理由、不超过 20 字
 */
export const REPLY_SCORE_PROMPT_VERSION = 4
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

/** 被回复的评论；text 为空表示没拿到正文 */
export interface ReplyScoreTarget {
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
  /** 回复的是另一条评论时，那条评论；直接回主帖时不填 */
  replyTo?: ReplyScoreTarget | null
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
6. 带 replyTo 的回复是在回那条评论，不是直接回原帖。判断有没有接住具体内容、是不是复述时，以 replyTo 的评论为准，原帖只作背景；和原帖关系弱不算证据。replyTo 的 text 为空时，表示没拿到那条评论的正文，不要因为和原帖关系弱而加分。

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
6. A reply with replyTo answers that comment, not the post directly. When judging whether it engages with specifics or restates, use the replyTo comment; the post is only background, and a weak link to the post is not evidence. If replyTo.text is empty, the comment's text is unknown; do not add points because the reply has little to do with the post.

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
- 输入是 JSON：parent 是原帖，replies 是要判断的回复。每条回复有 id（序号）、author、text、delaySeconds（比原帖晚的秒数）、followers（作者粉丝数）、verified（作者是否蓝 V）；值为 null 表示不知道。回复别人评论的回复还有 replyTo：被回复的那条评论（author、text）。
- 每条回复都要给出结果，字段名都是一个字母：
  - i：回复的序号，和输入里的 id 相同。
  - s：0–100 的整数嫌疑分。0–30 像真人，31–69 可疑，70–100 高度可疑。
  - g：命中的信号编号，例如 ["S2","S11"]；没有就给 []。
  - r：s 在 31 以上时，用一句中文说明依据，引用回复里的原词，不超过 20 字；s 在 30 以下时给 ""。
- 只输出 JSON，不要解释，不要代码块标记：
{"results":[{"i":1,"s":0,"g":[],"r":""}]}`,
  en: `## Output format
- The input is JSON: parent is the post, replies are the replies to check. Each reply has id (a sequence number), author, text, delaySeconds (seconds after the post), followers (the author's follower count), verified (whether the author has a blue check); null means unknown. A reply to another comment also has replyTo: the comment it answers (author, text).
- Return a result for every reply. Field names are single letters:
  - i: the reply's sequence number, the same as its id in the input.
  - s: an integer suspicion score from 0 to 100. 0–30 looks human, 31–69 suspicious, 70–100 highly suspicious.
  - g: the matched signal codes, e.g. ["S2","S11"]; use [] if none.
  - r: if s is 31 or higher, one English sentence explaining the evidence, quoting words from the reply, at most 15 words; if s is 30 or lower, "".
- Output JSON only, no explanation, no code fences:
{"results":[{"i":1,"s":0,"g":[],"r":""}]}`,
}

export function buildReplyScoreSystemPrompt(locale: Locale = 'zh-CN'): string {
  return `${CRITERIA[locale]}\n\n${OUTPUT_FORMAT[locale]}`
}

function clip(text: string): string {
  const chars = Array.from(text.trim())
  return chars.length > REPLY_SCORE_TEXT_LIMIT ? `${chars.slice(0, REPLY_SCORE_TEXT_LIMIT).join('')}…` : chars.join('')
}

/** 送给模型的回复用序号（从 1 开始）代替推文 ID，模型返回的序号由 parseReplyScoreResponse 换回推文 ID */
export function buildReplyScoreUserMessage(parent: ReplyScoreParent, replies: ReplyScoreItem[]): string {
  return JSON.stringify({
    parent: { author: parent.author, text: clip(parent.text) },
    replies: replies.map((reply, index) => ({
      id: index + 1,
      author: reply.author,
      text: clip(reply.text),
      delaySeconds: reply.delaySeconds,
      followers: reply.followers ?? null,
      verified: reply.verified ?? null,
      ...(reply.replyTo ? { replyTo: { author: reply.replyTo.author, text: clip(reply.replyTo.text) } } : {}),
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
 * 一条结果对应的推文 ID。ids 是请求里回复的顺序：i 是序号（从 1 开始）；
 * 模型改用 id 字段时，先当推文 ID 认，认不出再当序号。
 */
function resultId(item: any, ids: string[], allowed: Set<string>): string | undefined {
  const byIndex = (raw: unknown) => {
    const index = Number(raw)
    return Number.isInteger(index) && index >= 1 && index <= ids.length ? ids[index - 1] : undefined
  }
  if (item.i != null) return byIndex(item.i)
  if (item.id == null) return undefined
  const id = String(item.id).trim()
  return allowed.has(id) ? id : byIndex(id)
}

/**
 * 解析模型返回的文字。容忍 JSON 前后的多余文字和代码块标记；
 * batchIds 按请求里回复的顺序给，用来把序号换回推文 ID；字段认 i s g r，也认 id score signals reason。
 * 只保留本批里的回复，分数四舍五入并限制在 0–100，未知的信号编号丢掉。
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

  const ids = [...batchIds]
  const allowed = new Set(ids)
  const seen = new Set<string>()
  const results: ReplyScore[] = []
  for (const item of data.results) {
    if (!item || typeof item !== 'object') continue
    const id = resultId(item, ids, allowed)
    if (!id || seen.has(id)) continue
    const raw = Number(item.s ?? item.score)
    if (!Number.isFinite(raw)) continue
    seen.add(id)
    const rawSignals = item.g ?? item.signals
    const signals = Array.isArray(rawSignals)
      ? [...new Set(rawSignals.map((s: unknown) => String(s).trim().toUpperCase()))].filter((s): s is ReplyScoreSignal => SIGNAL_SET.has(s as string))
      : []
    const reason = item.r ?? item.reason
    results.push({
      id,
      score: Math.min(100, Math.max(0, Math.round(raw))),
      signals,
      reason: typeof reason === 'string' ? reason.trim().slice(0, 160) : '',
    })
  }
  return results
}

/** Emit only complete objects from the streamed results array, never half-written scores. */
export function createReplyScoreStreamParser(batchIds: Iterable<string>, onScore: (score: ReplyScore) => void): (delta: string) => void {
  // 按请求里的顺序保留，序号才能换回推文 ID
  const ids = [...batchIds]
  const seen = new Set<string>()
  let buffer = ''
  let cursor = 0
  let inResults = false
  let finished = false
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false
  return (delta) => {
    if (finished) return
    buffer += delta
    if (!inResults) {
      const header = /"results"\s*:\s*\[/.exec(buffer)
      if (!header) return
      cursor = header.index + header[0].length
      inResults = true
    }
    for (; cursor < buffer.length; cursor++) {
      const char = buffer[cursor]
      if (inString) {
        if (escaped) escaped = false
        else if (char === '\\') escaped = true
        else if (char === '"') inString = false
        continue
      }
      if (char === '"') { inString = true; continue }
      if (char === '{') {
        if (depth === 0) start = cursor
        depth++
      } else if (char === '}' && depth > 0) {
        depth--
        if (depth === 0 && start >= 0) {
          const object = buffer.slice(start, cursor + 1)
          let parsed: ReplyScore[] = []
          try { parsed = parseReplyScoreResponse(`{"results":[${object}]}`, ids) } catch { /* final parse reports malformed JSON */ }
          for (const score of parsed) {
            if (seen.has(score.id)) continue
            seen.add(score.id)
            onScore(score)
          }
          start = -1
        }
      } else if (char === ']' && depth === 0) {
        finished = true
        break
      }
    }
  }
}

/** 回复比主帖晚多少秒；任一时间缺失或回复早于主帖时返回 null */
export function replyDelaySeconds(parentTime: number | null, replyTime: number | null): number | null {
  if (parentTime == null || replyTime == null || replyTime < parentTime) return null
  return Math.round((replyTime - parentTime) / 1000)
}
