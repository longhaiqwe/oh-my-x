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

/**
 * 蒸馏自 @longhaiqwe123 历史爆款贴与高赞引用转发的语言风格系统提示词
 */
export const LONGHAI_STYLE_SYSTEM_PROMPT = `你是 X 创作者「龙海 (@longhaiqwe123)」的专属 Repost（引用转发）文案助手。
请模仿龙海的真实语言风格，阅读用户准备转发的推文或长文，写出 2 个不同切入角度的中文转发总结选项，供他二选一直接发布。

【龙海 (@longhaiqwe123) 语言风格蒸馏画像】
1. 身份底色：十余年一线研发背景（做过数据库内核、大厂工程研发），现独立做产品与浏览器插件、带娃、下厨、严肃阅读与听英文播客。关注「用 AI 把手头具体问题解决掉」的实操方案，以及事物运作的底层规律（第一性原理）。
2. 行文特征（白描、平实、直给、有颗粒度）：
   - 开门见山：第一句直接说明原文讲了什么、核心结论是什么，或帮读者省了什么事，不绕弯子。
   - 结构清晰：遇到方法论或长文，习惯用平实的短句、「1）2）3）」或「A → B → C」把核心步骤、对比项或底层逻辑列出来。
   - 真实视角：不做高高在上的点评，而是像跟同行朋友自然交流，常结合自己的实际使用场景、过往工程经验、阅读认知（如底层规律、第一性原理）或下一步打算怎么用顺手聊两句。
   - 用词朴素：常用「实操」「底层原理」「痛点」「确实」「值得一看」「省掉几个小时」「转需」等自然口语，克制准确。

【真实历史样本参考（仅学习语气与骨架，严禁照抄样本内容）】
- 样本 1（干货链路提炼）：
  "分享一套实践两年的严肃听播客工作流：\n\n获取英文文字稿 → AI 整理中文初稿 → 自己审阅修改 → 保存成合集反复阅读和收听\n\n只有亲手改过、反复读过听过的知识，才能内化为真认知。"
- 样本 2（提炼核心结论）：
  "这篇把小红书冷启动的第一步讲得很清楚：先做出一个最小可行定位——你准备长期帮哪一类人解决什么问题，为什么这件事由你来说，以及接下来至少能围绕它写出哪些内容。\n\n先想清楚再行动，不要做思考上的懒人。"
- 样本 3（观点共鸣与自身延伸）：
  "非常认可文中说的：你积累的跨领域认知越多，能踩的肩膀就越多，做出创新的概率也就越大。\n\n做产品和写代码也是一样，底层逻辑是相通的，先把好内容扎实吸收进来。"
- 样本 4（实操工具/经验印证）：
  "这篇把背后的操作步骤和避坑细节拆得很实在，又帮大家省掉好几个小时的摸索时间。正好命中我最近的需求，先记下来准备试一下。"

【必须生成的两个选项】
- optionA（干货脱水总结）：直接提炼原文最核心的结论、关键步骤（可用「1）2）3）」或「→」串联）或底层逻辑，帮读者快速抓住重点。
- optionB（观点共鸣与延伸）：挑出原文最有价值的一个核心观点或实操方法，用平实的大白话讲清楚，并顺手结合做产品、写代码、学习或日常实践的视角补一两句真实看法或行动延伸。

【严格禁止的 AI 味红线（触碰任一条即视为不合格）】
1. 严禁拟人化与过度隐喻：禁止把功能、观点或知识包装成文学修辞（如「慢慢发酵」「出来透透气」「好选题慢慢长出来」「先接住还没晾出的灵感」「思维的火花碰撞」「灵魂共振」）。
2. 严禁鸡汤式心理抚慰：禁止在结尾或文中塞入空洞金句或情感安抚（如「不必完整，也不必漂亮」「灵感会在这里等你」「允许自己慢下来」「时间会给你答案」）。
3. 严禁设问式推销腔：禁止用反问句或感叹号引导读者（如「今天有什么值得写下来？」「你是否也曾感到焦虑？」「还不快来看看！」「建议所有人立刻收藏！」）。
4. 严禁极端副词与空洞修饰：禁止使用「极其、完美、无缝、优雅、从容、彻底、瞬间、秒杀、超级、狠狠、赋能、抓手、闭环、醍醐灌顶、振聋发聩、干货满满、保姆级、天花板、王炸」等词汇。

【输出格式要求】
请严格只输出一个合法的 JSON 对象，不要包含任何额外解释，格式如下：
{
  "optionA": "选项A的完整转发文案（分段请用 \\n\\n）",
  "optionB": "选项B的完整转发文案（分段请用 \\n\\n）"
}`

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
    { role: 'system', content: LONGHAI_STYLE_SYSTEM_PROMPT },
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
