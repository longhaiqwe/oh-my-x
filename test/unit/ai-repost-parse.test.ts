import { describe, it, expect } from 'vitest'
import { extractTweetFullTextFromGraphql, parseAiRepostResponse } from '../../shared/ai-repost'

const user = (core?: object, legacy?: object) => ({ user_results: { result: { core, legacy } } })
const article = (result: object) => ({ article_results: { result } })
const detail = (...results: unknown[]) => ({
  data: {
    threaded_conversation_with_injections_v2: {
      instructions: [{ entries: results.map((result) => ({ content: { itemContent: { tweet_results: { result } } } })) }],
    },
  },
})

describe('extractTweetFullTextFromGraphql', () => {
  it('不是对象时返回 null', () => {
    expect(extractTweetFullTextFromGraphql(null)).toBeNull()
    expect(extractTweetFullTextFromGraphql('x')).toBeNull()
    expect(extractTweetFullTextFromGraphql(1)).toBeNull()
  })

  it('作者优先取 core，没有时取 legacy', () => {
    const tweet = { core: user({ name: '新名', screen_name: 'new' }, { name: '旧名', screen_name: 'old' }), legacy: { full_text: '正文' } }
    expect(extractTweetFullTextFromGraphql({ data: { tweetResult: { result: tweet } } })).toEqual({ authorName: '新名', authorHandle: 'new', text: '正文' })
    const legacyOnly = { core: user(undefined, { name: '旧名', screen_name: 'old' }), legacy: { full_text: '正文' } }
    expect(extractTweetFullTextFromGraphql({ data: { tweetResult: { result: legacyOnly } } })).toEqual({ authorName: '旧名', authorHandle: 'old', text: '正文' })
    expect(extractTweetFullTextFromGraphql({ data: { tweetResult: { result: { legacy: { full_text: '正文' } } } } })).toEqual({ authorName: '', authorHandle: '', text: '正文' })
  })

  it('长推文优先于普通正文，都会去掉首尾空白', () => {
    const tweet = { note_tweet: { note_tweet_results: { result: { text: '  长推文  ' } } }, legacy: { full_text: '短正文' } }
    expect(extractTweetFullTextFromGraphql({ data: { tweetResult: { result: tweet } } })?.text).toBe('长推文')
    const blankNote = { note_tweet: { note_tweet_results: { result: { text: '  ' } } }, legacy: { full_text: ' 短正文 ' } }
    expect(extractTweetFullTextFromGraphql({ data: { tweetResult: { result: blankNote } } })?.text).toBe('短正文')
  })

  it('没有任何文字时返回 null', () => {
    expect(extractTweetFullTextFromGraphql({ data: { tweetResult: { result: { legacy: { full_text: '   ' } } } } })).toBeNull()
    expect(extractTweetFullTextFromGraphql({ data: {} })).toBeNull()
  })

  it('支持 tweet_result.result、tweet_result 和不带 data 的响应', () => {
    const tweet = { legacy: { full_text: '正文' } }
    expect(extractTweetFullTextFromGraphql({ data: { tweet_result: { result: tweet } } })?.text).toBe('正文')
    expect(extractTweetFullTextFromGraphql({ data: { tweet_result: tweet } })?.text).toBe('正文')
    expect(extractTweetFullTextFromGraphql({ tweetResult: { result: tweet } })?.text).toBe('正文')
  })

  it('拆开 TweetWithVisibilityResults 外壳', () => {
    const wrapped = { __typename: 'TweetWithVisibilityResults', tweet: { rest_id: '7', legacy: { full_text: '受限推文' } } }
    expect(extractTweetFullTextFromGraphql({ data: { tweetResult: { result: wrapped } } }, '7')?.text).toBe('受限推文')
  })

  it('推文 ID 和目标不一致时跳过；没有 ID 时不检查', () => {
    expect(extractTweetFullTextFromGraphql({ data: { tweetResult: { result: { rest_id: '1', legacy: { full_text: 'x' } } } } }, '2')).toBeNull()
    expect(extractTweetFullTextFromGraphql({ data: { tweetResult: { result: { legacy: { id_str: '1', full_text: 'x' } } } } }, '2')).toBeNull()
    expect(extractTweetFullTextFromGraphql({ data: { tweetResult: { result: { legacy: { full_text: 'x' } } } } }, '2')?.text).toBe('x')
  })

  describe('推文里的长文', () => {
    const run = (tweet: object) => extractTweetFullTextFromGraphql({ data: { tweetResult: { result: tweet } } })

    it('长文可以挂在 article、legacy.article 或 article_results 下', () => {
      expect(run({ article: article({ title: 'T', plain_text: 'P' }) })).toEqual({ authorName: '', authorHandle: '', title: 'T', text: 'P' })
      expect(run({ legacy: { article: article({ title: 'T2', plain_text: 'P2' }) } })?.text).toBe('P2')
      expect(run({ article_results: { result: { title: 'T3', plain_text: 'P3' } } })?.text).toBe('P3')
    })

    it('正文依次取 plain_text、段落、预览文字', () => {
      const blocks = { blocks: [{ text: ' 第一段 ' }, { text: '' }, { text: 1 }, null, { text: '第二段' }] }
      expect(run({ article: article({ plain_text: '  ', content_state: blocks, preview_text: '预览' }) })?.text).toBe('第一段\n\n第二段')
      expect(run({ article: article({ preview_text: ' 预览 ' }) })?.text).toBe('预览')
    })

    it('段落数组为空时不取预览，正文用标题', () => {
      expect(run({ article: article({ title: '标题', content_state: { blocks: [] }, preview_text: '预览' }) })).toEqual({ authorName: '', authorHandle: '', title: '标题', text: '标题' })
    })

    it('只有正文时不带标题', () => {
      const res = run({ article: article({ title: 1, plain_text: '正文' }) })
      expect(res).toEqual({ authorName: '', authorHandle: '', title: undefined, text: '正文' })
    })

    it('长文没有标题和正文时退回推文文字', () => {
      expect(run({ article: article({ title: ' ' }), legacy: { full_text: '推文' } })?.text).toBe('推文')
      expect(run({ article: { article_results: { result: 'x' } }, legacy: { full_text: '推文' } })?.text).toBe('推文')
    })
  })

  describe('ArticleEntityResultByRestId', () => {
    it('支持三种位置，返回结果不带作者', () => {
      expect(extractTweetFullTextFromGraphql({ data: { article_result_by_rest_id: { result: { title: 'T', plain_text: 'P' } } } })).toEqual({ title: 'T', text: 'P' })
      expect(extractTweetFullTextFromGraphql({ data: { article_result_by_rest_id: { title: 'T' } } })).toEqual({ title: 'T', text: 'T' })
      expect(extractTweetFullTextFromGraphql({ data: { article_entity_result: { result: { content_state: { blocks: [{ text: 'a' }, { text: 'b' }] } } } } })).toEqual({ title: undefined, text: 'a\n\nb' })
    })

    it('不取预览文字', () => {
      expect(extractTweetFullTextFromGraphql({ data: { article_result_by_rest_id: { result: { preview_text: '预览' } } } })).toBeNull()
    })
  })

  describe('TweetDetail 和用户时间线', () => {
    it('返回第一条符合目标 ID 的推文', () => {
      const payload = detail(undefined, { rest_id: '1', legacy: { full_text: '别人的' } }, { rest_id: '2', legacy: { full_text: '目标' } })
      expect(extractTweetFullTextFromGraphql(payload, '2')?.text).toBe('目标')
      expect(extractTweetFullTextFromGraphql(payload)?.text).toBe('别人的')
    })

    it('直接结果不符合时继续找对话里的推文', () => {
      const payload = { data: { ...detail({ rest_id: '2', legacy: { full_text: '目标' } }).data, tweetResult: { result: { rest_id: '1', legacy: { full_text: 'x' } } } } }
      expect(extractTweetFullTextFromGraphql(payload, '2')?.text).toBe('目标')
    })

    it('支持用户时间线和缺少 entries 的指令', () => {
      const payload = { data: { user: { result: { timeline_v2: { timeline: { instructions: [{}, { entries: [{ content: { itemContent: { tweet_results: { result: { legacy: { full_text: '时间线' } } } } } }] }] } } } } } }
      expect(extractTweetFullTextFromGraphql(payload)?.text).toBe('时间线')
    })

    it('instructions 不是数组时返回 null', () => {
      expect(extractTweetFullTextFromGraphql({ data: { threaded_conversation_with_injections_v2: { instructions: {} } } })).toBeNull()
    })
  })
})

describe('parseAiRepostResponse', () => {
  it('空内容报 aiEmpty', () => {
    expect(() => parseAiRepostResponse('')).toThrow(expect.objectContaining({ code: 'error.aiEmpty' }))
    expect(() => parseAiRepostResponse('  \n ')).toThrow(expect.objectContaining({ code: 'error.aiEmpty' }))
    expect(() => parseAiRepostResponse(undefined as unknown as string)).toThrow(expect.objectContaining({ code: 'error.aiEmpty' }))
  })

  it.each([
    ['option_a / option_b', { option_a: '甲', option_b: '乙' }],
    ['option1 / option2', { option1: '甲', option2: '乙' }],
    ['option_1 / option_2', { option_1: '甲', option_2: '乙' }],
    ['options 对象数组', { options: [{ text: '甲' }, { text: '乙' }] }],
    ['options 字符串数组', { options: ['甲', '乙'] }],
  ])('JSON 字段名 %s', (_name, obj) => {
    expect(parseAiRepostResponse(JSON.stringify(obj))).toEqual({ optionA: '甲', optionB: '乙' })
  })

  it('optionA 优先于其他字段名', () => {
    expect(parseAiRepostResponse(JSON.stringify({ optionA: '甲', option_a: 'x', optionB: '乙', option_b: 'y' }))).toEqual({ optionA: '甲', optionB: '乙' })
  })

  it('从混杂文字里取出 JSON 块', () => {
    expect(parseAiRepostResponse('好的，结果如下：{"optionA":"甲","optionB":"乙"} 以上')).toEqual({ optionA: '甲', optionB: '乙' })
    expect(parseAiRepostResponse('```JSON\n{"optionA":"甲","optionB":"乙"}\n```')).toEqual({ optionA: '甲', optionB: '乙' })
  })

  it.each([
    ['选项一 / 选项二', '选项一：甲\n选项二：乙'],
    ['### Option 1 / Option 2', '### Option 1: 甲\n### Option 2: 乙'],
    ['方案A / 方案B', '方案A - 甲\n方案B — 乙'],
    ['没有第一项标记', '甲\n选项2. 乙'],
  ])('纯文字格式 %s', (_name, text) => {
    expect(parseAiRepostResponse(text)).toEqual({ optionA: '甲', optionB: '乙' })
  })

  it('第二项后面的多段文字都保留', () => {
    expect(parseAiRepostResponse('选项A：甲\n选项B：乙\n\n丙')).toEqual({ optionA: '甲', optionB: '乙\n\n丙' })
  })

  it.each([
    ['只有一项', '{"optionA":"甲"}'],
    ['某一项是空白', '{"optionA":"  ","optionB":"乙"}'],
    ['某一项不是文字', '{"optionA":1,"optionB":"乙"}'],
    ['JSON 不是对象', '"甲乙"'],
    ['JSON 是 null', 'null'],
    ['花括号里不是 JSON', '前 {不是 JSON} 后'],
    ['纯文字只有第二项', '选项二：乙'],
    ['纯文字第二项是空的', '选项一：甲\n选项二：'],
    ['什么格式都不是', '随便一段话'],
  ])('%s时报 aiParse', (_name, text) => {
    expect(() => parseAiRepostResponse(text)).toThrow(expect.objectContaining({ code: 'error.aiParse' }))
  })
})
