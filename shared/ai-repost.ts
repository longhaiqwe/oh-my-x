export interface RepostSourceInput {
  authorName?: string
  authorHandle?: string
  title?: string
  text: string
  url?: string
}

export interface AiRepostOptionsResult {
  optionA: string
  optionB: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 用户自定义的转发风格：风格描述 + 自己写过的转发样本 */
export interface RepostStyle {
  description?: string
  samples?: string
}

/** 未设置风格时使用的默认风格：平实、直给，不带任何个人身份 */
export const DEFAULT_REPOST_STYLE = `- 开门见山：第一句直接说明原文讲了什么、核心结论是什么，或帮读者省了什么事，不绕弯子。
- 结构清晰：遇到方法论或长文，用平实的短句、「1）2）3）」或「A → B → C」列出核心步骤、对比项或底层逻辑。
- 真实视角：不做高高在上的点评，像跟同行朋友交流，可以结合实际使用场景或下一步打算怎么用顺手说两句。
- 用词朴素：克制、准确，少用形容词和副词。`

/** 样本最多取几条、每条最多多少字，避免挤占原文的上下文 */
const MAX_STYLE_SAMPLES = 5
const MAX_SAMPLE_CHARS = 600

/**
 * 把用户粘贴的样本拆成多条：有单独一行的 --- 时按 --- 拆（一条样本内部可以分段），
 * 没有时按空行拆（适合每条只有一段的情况）
 */
export function parseStyleSamples(raw?: string): string[] {
  if (!raw) return []
  const text = raw.replace(/\r\n/g, '\n')
  const separator = /^\s*-{3,}\s*$/m.test(text) ? /\n?^\s*-{3,}\s*$\n?/m : /\n\s*\n/
  return text
    .split(new RegExp(separator.source, separator.flags.includes('m') ? 'gm' : 'g'))
    .map((sample) => sample.trim())
    .filter(Boolean)
    .slice(0, MAX_STYLE_SAMPLES)
    .map((sample) => (sample.length > MAX_SAMPLE_CHARS ? `${sample.slice(0, MAX_SAMPLE_CHARS)}…` : sample))
}

/**
 * 组装系统提示词：通用任务规则 + 风格（默认或用户自定义）+ 可选样本 + AI 腔禁用规则 + 输出格式
 */
export function buildRepostSystemPrompt(style: RepostStyle = {}): string {
  const description = style.description?.trim()
  const samples = parseStyleSamples(style.samples)

  const parts = [
    `你是一个 X（推特）引用转发文案助手。
阅读用户准备转发的推文或长文，写出 2 个不同切入角度的中文转发总结选项，供用户二选一后直接发布。`,
    description
      ? `【语言风格（用户自己的描述，优先遵守）】\n${description}`
      : `【语言风格】\n${DEFAULT_REPOST_STYLE}`,
  ]

  if (samples.length > 0) {
    parts.push(
      `【用户自己写过的转发样本（只学习语气、句式和结构，严禁照抄样本内容）】\n${samples
        .map((sample, i) => `- 样本 ${i + 1}：\n${sample}`)
        .join('\n')}`,
    )
  }

  parts.push(`【必须生成的两个选项】
- optionA（干货脱水总结）：直接提炼原文最核心的结论、关键步骤（可用「1）2）3）」或「→」串联）或底层逻辑，帮读者快速抓住重点。
- optionB（观点共鸣与延伸）：挑出原文最有价值的一个核心观点或实操方法，用平实的大白话讲清楚，并结合实际使用场景或经验补一两句真实看法或行动延伸。`)

  parts.push(`【严格禁止的 AI 味红线（触碰任一条即视为不合格）】
1. 严禁拟人化与过度隐喻：禁止把功能、观点或知识包装成文学修辞（如「慢慢发酵」「出来透透气」「思维的火花碰撞」「灵魂共振」）。
2. 严禁鸡汤式心理抚慰：禁止在结尾或文中塞入空洞金句或情感安抚（如「不必完整，也不必漂亮」「允许自己慢下来」「时间会给你答案」）。
3. 严禁设问式推销腔：禁止用反问句或感叹号引导读者（如「你是否也曾感到焦虑？」「还不快来看看！」「建议所有人立刻收藏！」）。
4. 严禁极端副词与空洞修饰：禁止使用「极其、完美、无缝、优雅、从容、彻底、瞬间、秒杀、超级、狠狠、赋能、抓手、闭环、醍醐灌顶、振聋发聩、干货满满、保姆级、天花板、王炸」等词汇。`)

  parts.push(`【输出格式要求】
请严格只输出一个合法的 JSON 对象，不要包含任何额外解释，格式如下：
{
  "optionA": "选项A的完整转发文案（分段请用 \\n\\n）",
  "optionB": "选项B的完整转发文案（分段请用 \\n\\n）"
}`)

  return parts.join('\n\n')
}

/**
 * 极端副词与空洞 AI 修饰词替换表（作为 Prompt 之外的确定性兜底过滤）
 */
const BANNED_WORD_REPLACEMENTS: Array<[RegExp, string]> = [
  [/极其/g, '很'],
  [/完美地?/g, '很好地'],
  [/无缝地?/g, '顺畅地'],
  [/优雅地?/g, '干净地'],
  [/从容地?/g, '平稳地'],
  [/彻底地?/g, '完全'],
  [/瞬间/g, '一下'],
  [/秒杀/g, '超过'],
  [/超级/g, '很'],
  [/狠狠地?/g, '扎实'],
  [/醍醐灌顶/g, '很有启发'],
  [/振聋发聩/g, '说得很透'],
  [/干货满满/g, '内容很实操'],
  [/保姆级/g, '详细'],
  [/赋能/g, '帮助'],
  [/抓手/g, '切入点'],
]

/**
 * 清洗文本中的 AI 味词汇与多余修饰
 */
export function sanitizeAiTone(text: string): string {
  if (!text) return ''
  let cleaned = text.trim()

  // 移除首尾可能包裹的成对引号
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith('“') && cleaned.endsWith('”'))
  ) {
    cleaned = cleaned.slice(1, -1).trim()
  }

  for (const [pattern, replacement] of BANNED_WORD_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement)
  }

  // 压缩过多连续空行
  cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return cleaned
}

/**
 * 将用户填写的 Base URL 归一化为标准的 OpenAI 兼容 /chat/completions 接口地址
 */
export function resolveChatCompletionsUrl(rawBaseUrl: string): string {
  const trimmed = (rawBaseUrl || '').trim().replace(/\/+$/, '')
  if (!trimmed) {
    return 'https://api.openai.com/v1/chat/completions'
  }
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed
  }
  // 火山引擎 / OpenRouter / DeepSeek / OpenAI 等若已带 /v1, /v2, /v3, /v4 则直接拼 /chat/completions
  if (/\/v\d+(?:beta\d*)?$/i.test(trimmed)) {
    return `${trimmed}/chat/completions`
  }
  return `${trimmed}/v1/chat/completions`
}

/**
 * 构建发送给大模型的 messages 列表
 */
export function buildRepostMessages(
  source: RepostSourceInput,
  customPrompt?: string,
  style?: RepostStyle,
): ChatMessage[] {
  const metaParts: string[] = []
  if (source.authorName || source.authorHandle) {
    const authorStr = [
      source.authorName?.trim(),
      source.authorHandle ? `(@${source.authorHandle.replace(/^@/, '').trim()})` : '',
    ]
      .filter(Boolean)
      .join(' ')
    metaParts.push(`原作者：${authorStr}`)
  }
  if (source.title?.trim()) {
    metaParts.push(`文章标题：${source.title.trim()}`)
  }

  // 控制最大输入长度，防止超长文章超出小模型上下文窗口
  const maxContentChars = 12000
  const rawBody = source.text.trim()
  const body =
    rawBody.length > maxContentChars
      ? `${rawBody.slice(0, maxContentChars)}\n...(正文已截断)`
      : rawBody

  let userPrompt = `请根据以下被转发的原文内容，生成两个转发文案选项（optionA 为干货脱水总结，optionB 为观点共鸣与延伸）：\n\n`
  if (metaParts.length > 0) {
    userPrompt += `${metaParts.join('\n')}\n\n`
  }
  userPrompt += `原文内容：\n"""\n${body}\n"""`

  if (customPrompt && customPrompt.trim()) {
    userPrompt += `\n\n用户额外要求：\n${customPrompt.trim()}`
  }

  return [
    { role: 'system', content: buildRepostSystemPrompt(style) },
    { role: 'user', content: userPrompt },
  ]
}

/**
 * 解析模型返回的 JSON 或文本，提取出 optionA 与 optionB
 */
export function parseAiRepostResponse(rawContent: string): AiRepostOptionsResult {
  const trimmed = (rawContent || '').trim()
  if (!trimmed) {
    throw new Error('AI 返回内容为空')
  }

  // 1. 尝试去除 markdown 代码块后直接 JSON.parse
  const strippedFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const tryParseJson = (str: string): AiRepostOptionsResult | null => {
    try {
      const obj = JSON.parse(str)
      if (!obj || typeof obj !== 'object') return null

      const a =
        obj.optionA ||
        obj.option_a ||
        obj.option1 ||
        obj.option_1 ||
        (Array.isArray(obj.options) ? obj.options[0]?.text || obj.options[0] : '')
      const b =
        obj.optionB ||
        obj.option_b ||
        obj.option2 ||
        obj.option_2 ||
        (Array.isArray(obj.options) ? obj.options[1]?.text || obj.options[1] : '')

      if (typeof a === 'string' && a.trim() && typeof b === 'string' && b.trim()) {
        return {
          optionA: sanitizeAiTone(a),
          optionB: sanitizeAiTone(b),
        }
      }
    } catch {
      // ignore
    }
    return null
  }

  const directParsed = tryParseJson(strippedFence)
  if (directParsed) return directParsed

  // 2. 尝试从混杂文本中提取第一个 {...} JSON 块
  const firstBrace = strippedFence.indexOf('{')
  const lastBrace = strippedFence.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonSub = strippedFence.slice(firstBrace, lastBrace + 1)
    const subParsed = tryParseJson(jsonSub)
    if (subParsed) return subParsed
  }

  // 3. 兜底：如果模型按纯文本输出了「选项一 / 选项A」和「选项二 / 选项B」
  const splitMatch = strippedFence.split(
    /(?:^|\n)\s*(?:###?\s*)?(?:选项\s*[二2B]|Option\s*[2B]|方案\s*[二2B])\s*[：:.\-—]?\s*/i,
  )
  if (splitMatch.length >= 2) {
    const firstPart = splitMatch[0]
      .replace(
        /^\s*(?:###?\s*)?(?:选项\s*[一1A]|Option\s*[1A]|方案\s*[一1A])\s*[：:.\-—]?\s*/i,
        '',
      )
      .trim()
    const secondPart = splitMatch.slice(1).join('\n').trim()
    if (firstPart && secondPart) {
      return {
        optionA: sanitizeAiTone(firstPart),
        optionB: sanitizeAiTone(secondPart),
      }
    }
  }

  throw new Error('未能从 AI 响应中解析出两个有效选项，请重试')
}

/**
 * 从 X GraphQL 响应对象中提取单条推文或 X Article 长文的完整文本
 */
export function extractTweetFullTextFromGraphql(
  payload: unknown,
  targetId?: string,
): RepostSourceInput | null {
  if (!payload || typeof payload !== 'object') return null

  const unwrapTweet = (node: any): any => {
    if (!node || typeof node !== 'object') return null
    if (node.__typename === 'TweetWithVisibilityResults' && node.tweet) {
      return node.tweet
    }
    return node
  }

  const parseTweetNode = (rawNode: any): RepostSourceInput | null => {
    const tweet = unwrapTweet(rawNode)
    if (!tweet || typeof tweet !== 'object') return null
    const legacy = tweet.legacy || {}
    const restId = String(tweet.rest_id || legacy.id_str || '')
    if (targetId && restId && restId !== targetId) return null

    const userResult = tweet.core?.user_results?.result
    const userLegacy = userResult?.legacy || {}
    const userCore = userResult?.core || {}
    const authorHandle = userCore.screen_name || userLegacy.screen_name || ''
    const authorName = userCore.name || userLegacy.name || ''

    // 1. 优先检查是否为 X 长文 (Article)
    const articleResult =
      tweet.article?.article_results?.result ||
      legacy.article?.article_results?.result ||
      tweet.article_results?.result
    if (articleResult && typeof articleResult === 'object') {
      const title = typeof articleResult.title === 'string' ? articleResult.title.trim() : ''
      let articleBody = ''
      if (typeof articleResult.plain_text === 'string' && articleResult.plain_text.trim()) {
        articleBody = articleResult.plain_text.trim()
      } else if (Array.isArray(articleResult.content_state?.blocks)) {
        articleBody = articleResult.content_state.blocks
          .map((b: any) => (typeof b?.text === 'string' ? b.text.trim() : ''))
          .filter(Boolean)
          .join('\n\n')
      } else if (typeof articleResult.preview_text === 'string') {
        articleBody = articleResult.preview_text.trim()
      }

      if (title || articleBody) {
        return {
          authorName,
          authorHandle,
          title: title || undefined,
          text: articleBody || title,
        }
      }
    }

    // 2. 检查是否为长推文 (NoteTweet)
    const noteText = tweet.note_tweet?.note_tweet_results?.result?.text
    if (typeof noteText === 'string' && noteText.trim()) {
      return {
        authorName,
        authorHandle,
        text: noteText.trim(),
      }
    }

    // 3. 普通推文 full_text
    if (typeof legacy.full_text === 'string' && legacy.full_text.trim()) {
      return {
        authorName,
        authorHandle,
        text: legacy.full_text.trim(),
      }
    }

    return null
  }

  const root = (payload as any).data ?? payload

  // 路径 A: TweetResultByRestId
  const directResult =
    root?.tweetResult?.result ?? root?.tweet_result?.result ?? root?.tweet_result
  if (directResult) {
    const parsed = parseTweetNode(directResult)
    if (parsed) return parsed
  }

  // 路径 B: ArticleEntityResultByRestId
  const articleEntity =
    root?.article_result_by_rest_id?.result ??
    root?.article_result_by_rest_id ??
    root?.article_entity_result?.result
  if (articleEntity && typeof articleEntity === 'object') {
    const title = typeof articleEntity.title === 'string' ? articleEntity.title.trim() : ''
    let body = ''
    if (typeof articleEntity.plain_text === 'string' && articleEntity.plain_text.trim()) {
      body = articleEntity.plain_text.trim()
    } else if (Array.isArray(articleEntity.content_state?.blocks)) {
      body = articleEntity.content_state.blocks
        .map((b: any) => (typeof b?.text === 'string' ? b.text.trim() : ''))
        .filter(Boolean)
        .join('\n\n')
    }
    if (title || body) {
      return { title: title || undefined, text: body || title }
    }
  }

  // 路径 C: TweetDetail instructions
  const instructions =
    root?.threaded_conversation_with_injections_v2?.instructions ||
    root?.user?.result?.timeline_v2?.timeline?.instructions ||
    []
  if (Array.isArray(instructions)) {
    for (const inst of instructions) {
      for (const entry of inst?.entries || []) {
        const res = entry?.content?.itemContent?.tweet_results?.result
        if (res) {
          const parsed = parseTweetNode(res)
          if (parsed) return parsed
        }
      }
    }
  }

  return null
}
