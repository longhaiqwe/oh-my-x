export type TweetFilterAction = 'collapse' | 'hide'

export interface TweetFilterEvaluation {
  matched: boolean
  matchedKeyword?: string
  text: string
}

export interface TweetFilterContext {
  text: string
  keywords: string[]
  normalizedKeywords: string[]
}

/**
 * 针对推文内容过滤的文本归一化处理：
 * 1. 去除 URL 链接
 * 2. 去除 @mention 用户名
 * 3. 去除 Emoji 表情及符号组合字符
 * 4. 去除零宽字符与不可见空白字符
 * 5. 去除中英文常见标点符号和空格
 * 6. 统一转为小写
 */
export function normalizeForTweetFilter(text: string): string {
  if (!text) return ''
  return text
    // 1. 去除 URL
    .replace(/https?:\/\/[^\s]+/g, '')
    // 2. 去除 @handle
    .replace(/@[a-zA-Z0-9_]+/g, '')
    // 3. 去除 emoji 和变体选择器/连接符
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}]/gu, '')
    // 4. 去除零宽字符与不可见字符
    .replace(/[\u200B-\u200D\uFEFF\u2060]/gu, '')
    // 5. 去除标点符号与空白
    .replace(/[，。！？!?,.:;：；…~～#^*()（）[\]【】\-_/\\|`'"“”‘’<>《》+=`\s]/g, '')
    .toLowerCase()
}

export { parseKeywordList as parseTweetFilterKeywords } from './keyword-list'

/**
 * 评估推文是否命中推文过滤词库
 */
export function evaluateTweetFilter(ctx: TweetFilterContext): TweetFilterEvaluation {
  const rawText = (ctx.text || '').toLowerCase()
  const normText = normalizeForTweetFilter(ctx.text || '')

  for (let i = 0; i < ctx.keywords.length; i++) {
    const kw = ctx.keywords[i]
    if (!kw) continue
    const kwLower = kw.toLowerCase()
    const kwNorm = ctx.normalizedKeywords[i] ?? normalizeForTweetFilter(kw)

    // 匹配策略：
    // 1. 原始文本直接包含原始词（如英文或带特定格式）
    // 2. 归一化文本包含归一化关键词（规避空格、标点、emoji混淆）
    if (
      rawText.includes(kwLower) ||
      (kwNorm.length >= 2 && normText.includes(kwNorm))
    ) {
      return {
        matched: true,
        matchedKeyword: kw,
        text: ctx.text,
      }
    }
  }

  return {
    matched: false,
    text: ctx.text,
  }
}
