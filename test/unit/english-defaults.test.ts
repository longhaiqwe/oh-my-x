import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  defaultSpamKeywords,
  defaultSpamKeywordsEn,
  defaultTweetFilterKeywords,
  defaultTweetFilterKeywordsEn,
  getDefaultSpamKeywords,
  getDefaultTweetFilterKeywords,
  KeySpamKeywordList,
  KeyTweetFilterKeywords,
  KeyUiLanguage,
} from '../../storage-keys'
import { mergeDefaultKeywords, migrateSpamStorage } from '../../shared/spam-migration'
import { evaluateSpam, normalizeForSpam } from '../../shared/spam-rules'
import {
  DEFAULT_REPOST_STYLE,
  DEFAULT_REPOST_STYLE_EN,
  buildRepostMessages,
  buildRepostSystemPrompt,
  parseAiRepostResponse,
  sanitizeAiTone,
} from '../../shared/ai-repost'

const CJK = /[一-鿿]/

describe('英文默认词库和屏蔽词', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('按语言取默认词', () => {
    expect(getDefaultSpamKeywords('en')).toBe(defaultSpamKeywordsEn)
    expect(getDefaultSpamKeywords('zh-CN')).toBe(defaultSpamKeywords)
    expect(getDefaultTweetFilterKeywords('en')).toBe(defaultTweetFilterKeywordsEn)
    expect(getDefaultTweetFilterKeywords('zh-CN')).toBe(defaultTweetFilterKeywords)
  })

  it('英文默认词去掉空格和标点后不会太短（太短会误伤正常回复，如 18+ 会变成 18）', () => {
    for (const word of [...defaultSpamKeywordsEn, ...defaultTweetFilterKeywordsEn]) {
      const normalized = normalizeForSpam(word)
      // 纯 emoji 归一化后为空，只按原文匹配
      if (normalized === '') continue
      expect(normalized.length, word).toBeGreaterThanOrEqual(4)
    }
  })

  it('补充默认词按界面语言：英文界面补英文词，保留用户的词', () => {
    const { merged, added } = mergeDefaultKeywords(['my own word', 'dm me'], 'en')
    expect(merged.slice(0, 2)).toEqual(['my own word', 'dm me'])
    expect(added).not.toContain('dm me')
    expect(added).toContain('check my bio')
    expect(added.some((word) => CJK.test(word))).toBe(false)
  })

  async function install(stored: Record<string, unknown>, browserLanguage: string) {
    const store: Record<string, unknown> = { ...stored }
    vi.stubGlobal('browser', {
      runtime: { id: 'test-extension' },
      i18n: { getUILanguage: () => browserLanguage },
      storage: {
        local: {
          get: async (keys: string[]) => Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, store[k]])),
          set: async (kv: Record<string, unknown>) => { Object.assign(store, kv) },
        },
      },
    })
    await migrateSpamStorage()
    return store
  }

  it('英文浏览器首次安装：写入英文默认词库和英文屏蔽词', async () => {
    const store = await install({}, 'en-US')
    expect(store[KeySpamKeywordList]).toBe(defaultSpamKeywordsEn.join('\n'))
    expect(store[KeyTweetFilterKeywords]).toBe(defaultTweetFilterKeywordsEn.join('\n'))
  })

  it('中文浏览器首次安装：和以前一样写入中文词库，屏蔽词沿用存储兜底的中文默认值', async () => {
    const store = await install({}, 'zh-CN')
    expect(store[KeySpamKeywordList]).toBe(defaultSpamKeywords.join('\n'))
    expect(store[KeyTweetFilterKeywords]).toBeUndefined()
  })

  it('浏览器是中文但插件选了 English：按插件语言', async () => {
    const store = await install({ [KeyUiLanguage]: 'en' }, 'zh-CN')
    expect(store[KeySpamKeywordList]).toBe(defaultSpamKeywordsEn.join('\n'))
  })
})

describe('打分规则对英文回复', () => {
  // 以下回复是按英文引流号常见写法构造的例子，不是抓取的真实样本
  const score = (text: string, authorHandle = 'jane_doe', authorName = 'Jane') =>
    evaluateSpam({ text, authorName, authorHandle, keywords: defaultSpamKeywordsEn })

  it('英文引流回复：命中垃圾词，配合随机用户名达到隐藏阈值', () => {
    const r = score('Check my bio for more 🔥🔥', 'sxr48293817264')
    expect(r.hits.map((h) => h.id)).toEqual(expect.arrayContaining(['marketing_keyword', 'random_username']))
    expect(r.score).toBeGreaterThanOrEqual(55)
  })

  it('英文引流前缀 visit @ / go to @ 算矩阵引流', () => {
    expect(score('Visit @promo_bot for more').hits.some((h) => h.id === 'mention_referral')).toBe(true)
    expect(score('go to @promo_bot').hits.some((h) => h.id === 'mention_referral')).toBe(true)
  })

  it('评论过短：英文按词数，两个词以上的正常短评不加分', () => {
    for (const text of ['so true', 'Great thread, thanks', 'ok ok']) {
      expect(score(text).hits.some((h) => h.id === 'short_text'), text).toBe(false)
    }
    for (const text of ['wow', 'lol', 'Absolutely!']) {
      expect(score(text).hits.some((h) => h.id === 'short_text'), text).toBe(true)
    }
  })

  it('评论过短：中文仍按 8 个字符', () => {
    const zh = (text: string) => evaluateSpam({ text, authorName: 'X', authorHandle: 'x' }).hits.some((h) => h.id === 'short_text')
    expect(zh('你好')).toBe(true)
    expect(zh('这是一段正常评论')).toBe(false)
  })

  it('正常英文回复不会被隐藏', () => {
    for (const text of ['so true', 'This matches what I saw last week. Thanks for the write-up.', 'Where can I read the full paper?']) {
      expect(score(text).score, text).toBeLessThan(55)
    }
  })
})

describe('AI 转发：英文界面写英文', () => {
  it('英文提示词结构和中文一致，里面没有中文', () => {
    const en = buildRepostSystemPrompt({}, 'en')
    expect(en).toContain('write 2 English quote-post options')
    expect(en).toContain(DEFAULT_REPOST_STYLE_EN)
    expect(en).toContain('"optionA"')
    expect(CJK.test(en)).toBe(false)

    const zh = buildRepostSystemPrompt({})
    expect(zh).toContain('中文转发总结选项')
    expect(zh).toContain(DEFAULT_REPOST_STYLE)
  })

  it('用户的风格描述和样本放进英文提示词', () => {
    const en = buildRepostSystemPrompt({ description: 'Short sentences.', samples: 'First sample\n---\nSecond sample' }, 'en')
    expect(en).toContain("[Writing style (the user's own description; follow it first)]\nShort sentences.")
    expect(en).toContain('- Sample 2:\nSecond sample')
    expect(en).not.toContain(DEFAULT_REPOST_STYLE_EN)
  })

  it('用户消息用英文，原文内容照样带上', () => {
    const [, user] = buildRepostMessages({ text: '原文是中文也照样带上', title: 'Title', authorName: 'A', authorHandle: 'a' }, 'Under 200 characters', {}, 'en')
    expect(user.content).toContain('Write two quote-post options')
    expect(user.content).toContain('Author: A (@a)')
    expect(user.content).toContain('Article title: Title')
    expect(user.content).toContain('原文是中文也照样带上')
    expect(user.content).toContain('Extra instructions from the user:\nUnder 200 characters')
  })

  it('英文兜底替换：只换明确的 AI 腔词，首字母大小写不变；中文替换表不作用于英文', () => {
    expect(sanitizeAiTone('Delve into the data. It is a game-changer that works seamlessly.', 'en'))
      .toBe('Look into the data. It is a big change that works smoothly.')
    expect(sanitizeAiTone('完美地完成', 'en')).toBe('完美地完成')
    expect(sanitizeAiTone('完美地完成')).toBe('很好地完成')
  })

  it('解析模型返回时按语言清洗', () => {
    const result = parseAiRepostResponse('{"optionA":"Incredibly useful.","optionB":"Must-read for builders."}', 'en')
    expect(result).toEqual({ optionA: 'Very useful.', optionB: 'Worth reading for builders.' })
  })
})
