// AI 转搜索语法：把搜索框里的大白话交给「设置 → AI 服务」配置的模型，转成一条 X 搜索词，再用 X 自己的搜索。
// 提示词只有一份（英文写规则，中英文示例各一条）：输出是搜索语法，不受界面语言影响。
// 搜索语法来源：within_time / min_faves / -filter:replies / filter:images|videos|media / lang / since 在 2026-10-23 于 X 网页实测；
// from / to / until / min_retweets / min_replies / filter:links / filter:replies / 精确短语 / OR / 排除词是 X 高级搜索表单生成的语法。
import { AppError } from './errors'

/** 发给模型的文字最多这么长 */
export const SEARCH_AI_MAX_INPUT = 300
/** 模型给的搜索词最多这么长 */
export const SEARCH_AI_MAX_QUERY = 500

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** 按本机时间写成 YYYY-MM-DD */
export function formatLocalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function daysBefore(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() - days)
  return result
}

/** 提示词里给出的日期：模型自己算日期容易算错，常用的几个直接算好 */
export function searchDateAnchors(now: Date) {
  return {
    today: formatLocalDate(now),
    weekday: WEEKDAYS[now.getDay()],
    yesterday: formatLocalDate(daysBefore(now, 1)),
    weekAgo: formatLocalDate(daysBefore(now, 7)),
    monthAgo: formatLocalDate(daysBefore(now, 30)),
    monthStart: formatLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    yearStart: formatLocalDate(new Date(now.getFullYear(), 0, 1)),
  }
}

export function buildSearchQueryPrompt(now: Date): string {
  const d = searchDateAnchors(now)
  return [
    'You turn a description of what someone wants to find on X (Twitter) into one X search query.',
    'Reply with JSON only, no explanation: {"query": "<search query>"}',
    '',
    `Dates in the user's local time: today is ${d.today} (${d.weekday}). Yesterday: ${d.yesterday}. 7 days ago: ${d.weekAgo}. 30 days ago: ${d.monthAgo}. Start of this month: ${d.monthStart}. Start of this year: ${d.yearStart}.`,
    '',
    'Rules:',
    '- Keep the topic words the user wrote, in the language they wrote them. Drop filler words such as "posts about", "帖子", "关于", "的", "有哪些".',
    '- Exact phrase: "two words". Either word: a OR b. Exclude a word: -word. Hashtag: #tag.',
    '- Posts by an account: from:handle. Replies to an account: to:handle. Mentioning an account: @handle. Only use handles the user wrote; do not guess a handle from a display name.',
    `- Time: since:YYYY-MM-DD (inclusive) and until:YYYY-MM-DD (exclusive). "last week", "past week", "上周", "最近一周" mean since:${d.weekAgo}. "today" means since:${d.today}. "yesterday" means since:${d.yesterday} until:${d.today}. "this month" means since:${d.monthStart}. The past N hours: within_time:Nh.`,
    '- Engagement: at least N likes min_faves:N, reposts min_retweets:N, replies min_replies:N. "过千" or "over a thousand" is 1000, "过万" is 10000.',
    '- Media: images filter:images, videos filter:videos, images or videos filter:media, links filter:links.',
    '- Original posts only (no replies): -filter:replies. Replies only: filter:replies.',
    '- Language: add lang:xx (ISO 639-1 code such as zh, en, ja) only when the user asks for a language.',
    '- Do not add conditions the user did not ask for. If the text is already keywords or a search query, return it unchanged.',
    '',
    'Examples:',
    `上周关于 Claude、点赞过千的中文帖 → {"query": "Claude lang:zh min_faves:1000 since:${d.weekAgo}"}`,
    `videos from @nasa this month with 500+ likes → {"query": "from:nasa filter:videos min_faves:500 since:${d.monthStart}"}`,
  ].join('\n')
}

export function buildSearchQueryMessages(text: string, now: Date) {
  return [
    { role: 'system', content: buildSearchQueryPrompt(now) },
    { role: 'user', content: text.trim().slice(0, SEARCH_AI_MAX_INPUT) },
  ]
}

function cleanQuery(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .trim()
    // 模型偶尔用反引号包住搜索词；双引号是精确短语，不去掉
    .replace(/^`+|`+$/g, '')
    .trim()
    .slice(0, SEARCH_AI_MAX_QUERY)
    .trim()
}

/** 从模型回复里取出搜索词：优先读 JSON 的 query，读不到时用第一行文字；取不到时报错 */
export function parseSearchQueryResponse(content: string): string {
  let text = content.trim()
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  if (fenced) text = fenced[1].trim()
  let query: unknown
  const json = /\{[\s\S]*\}/.exec(text)
  if (json) {
    try {
      query = (JSON.parse(json[0]) as { query?: unknown })?.query
    } catch {
      query = undefined
    }
  }
  if (typeof query !== 'string') query = json ? '' : text.split('\n')[0]
  const clean = cleanQuery(query as string)
  if (!clean) throw new AppError('error.searchAiEmpty')
  return clean
}
