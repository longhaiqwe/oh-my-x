import { describe, it, expect } from 'vitest'
import {
  extractRewindPost,
  normalizeRewind,
  queryRewind,
  rewindVisible,
  safeRewindImage,
  sanitizeRewindPost,
  type RewindPost,
} from '../../shared/rewind'

const post = (id = '1', time = 1): RewindPost => ({
  id,
  handle: 'author',
  name: '作者',
  avatar: '',
  text: '中文记录',
  quote: null,
  media: [],
  context: '',
  repost: false,
  postedAt: '',
  firstSeenAt: time,
})
describe('回看可见与内容边界', () => {
  it('标准推文 49% 不记录、50% 记录；长推文按视口 40% 判断', () => {
    expect(rewindVisible(400, 196, 1000)).toBe(false)
    expect(rewindVisible(400, 200, 1000)).toBe(true)
    expect(rewindVisible(2000, 399, 1000)).toBe(false)
    expect(rewindVisible(2000, 400, 1000)).toBe(true)
    expect(rewindVisible(0, 0, 1000)).toBe(false)
  })
  it('只接受 X 媒体 HTTPS 地址并去除未验证字段', () => {
    for (const url of [
      'https://evil.test/media/a',
      'http://pbs.twimg.com/media/a',
      'https://pbs.twimg.com.evil.test/media/a',
      'https://user@pbs.twimg.com/media/a',
      'https://pbs.twimg.com:8080/media/a',
      'data:image/png;base64,abc',
    ])
      expect(safeRewindImage(url)).toBe('')
    const p = sanitizeRewindPost({
      ...post(),
      media: [
        {
          src: 'https://pbs.twimg.com/media/a.jpg',
          kind: 'image',
          text: '伪造识别结果',
        },
      ],
    })!
    expect(p.media[0].text).toBeUndefined()
    expect(sanitizeRewindPost({ ...post(), id: '<script>' })).toBeNull()
    expect(sanitizeRewindPost({ ...post(), handle: '../bad' })).toBeNull()
  })
  it('搜索忽略中文间隔，英文大小写和全角差异；保留英文词边界', () => {
    expect(normalizeRewind('中 文  ＡＢＣ')).toBe('中文abc')
    expect(normalizeRewind('AI 工具 2026')).toBe(normalizeRewind('AI工具2026'))
    expect(normalizeRewind('hello world')).not.toBe(
      normalizeRewind('helloworld'),
    )
    const p = {
      ...post(),
      media: [
        {
          src: 'https://pbs.twimg.com/media/a',
          kind: 'image' as const,
          text: '可 访问 性',
        },
      ],
      quote: { name: '张三', text: 'quoted' },
    }
    const s = { account: '1', generation: 0, posts: [p] }
    expect(queryRewind(s, { query: '可访问性', ocr: false }).total).toBe(0)
    expect(queryRewind(s, { query: '可访问性', ocr: true }).total).toBe(1)
    expect(queryRewind(s, { query: '张三', filter: 'quote' }).total).toBe(1)
    expect(queryRewind(s, { filter: 'video' }).total).toBe(0)
    expect(queryRewind(s, { filter: 'repost' }).total).toBe(0)
  })
  it('提取原文、引用和视频类型，排除译文和被过滤内容', () => {
    const article = document.createElement('article')
    article.innerHTML =
      '<div data-testid="User-Name"><span>作者</span><a href="/author/status/123"><time datetime="2026-11-10"/></a></div><div data-testid="tweetText">原文<br>内容<span class="immersive-translate-target">译文</span></div><div role="link"><div data-testid="User-Name"><span>引用作者</span></div><div data-testid="tweetText">引用文本</div></div><div data-testid="videoPlayer"><video poster="https://pbs.twimg.com/ext_tw_video_thumb/a.jpg"></video></div>'
    const p = extractRewindPost(article)!
    expect(p.text).toBe('原文\n内容')
    expect(p.quote).toEqual({ name: '引用作者', text: '引用文本' })
    expect(p.media[0].kind).toBe('video')
    for (const state of ['hidden', 'collapsed']) {
      article.setAttribute('data-xf-tf-state', state)
      expect(extractRewindPost(article)).toBeNull()
    }
    article.removeAttribute('data-xf-tf-state')
    article.innerHTML += '<span data-testid="promotedIndicator">Ad</span>'
    expect(extractRewindPost(article)).toBeNull()
  })
})
