import { describe, it, expect } from 'vitest'
import {
  toOriginalImageUrl,
  extractTweetMediaFromGraphql,
  extractTweetInfoFromDom,
} from '../../shared/tweet-media'

describe('toOriginalImageUrl', () => {
  it('should convert query string name to name=orig', () => {
    const raw = 'https://pbs.twimg.com/media/G123456?format=jpg&name=small'
    expect(toOriginalImageUrl(raw)).toBe('https://pbs.twimg.com/media/G123456?format=jpg&name=orig')
  })

  it('should append name=orig if not present', () => {
    const raw = 'https://pbs.twimg.com/media/G123456.jpg'
    expect(toOriginalImageUrl(raw)).toBe('https://pbs.twimg.com/media/G123456.jpg?name=orig')
  })

  it('should keep name=orig intact', () => {
    const raw = 'https://pbs.twimg.com/media/G123456?format=png&name=orig'
    expect(toOriginalImageUrl(raw)).toBe('https://pbs.twimg.com/media/G123456?format=png&name=orig')
  })

  it('should return empty string for empty or non-string input', () => {
    expect(toOriginalImageUrl('')).toBe('')
    expect(toOriginalImageUrl(undefined as unknown as string)).toBe('')
  })

  it('should leave non-twimg urls unchanged', () => {
    expect(toOriginalImageUrl('https://example.com/a.jpg?name=small')).toBe('https://example.com/a.jpg?name=small')
    expect(toOriginalImageUrl('/images/a.jpg?name=small')).toBe('/images/a.jpg?name=small')
  })

  it('should rewrite twimg urls that are not absolute', () => {
    expect(toOriginalImageUrl('pbs.twimg.com/media/G1?format=jpg&name=small')).toBe('pbs.twimg.com/media/G1?format=jpg&name=orig')
    expect(toOriginalImageUrl('pbs.twimg.com/media/G1?format=jpg')).toBe('pbs.twimg.com/media/G1?format=jpg&name=orig')
    expect(toOriginalImageUrl('pbs.twimg.com/media/G1.jpg')).toBe('pbs.twimg.com/media/G1.jpg?name=orig')
  })
})

describe('extractTweetMediaFromGraphql', () => {
  it('should extract photos with origUrl', () => {
    const payload = {
      data: {
        tweetResult: {
          result: {
            rest_id: '1234567890',
            core: {
              user_results: {
                result: {
                  legacy: { screen_name: 'testuser' },
                },
              },
            },
            legacy: {
              extended_entities: {
                media: [
                  {
                    id_str: 'photo_1',
                    type: 'photo',
                    media_url_https: 'https://pbs.twimg.com/media/photo1?format=jpg&name=medium',
                  },
                ],
              },
            },
          },
        },
      },
    }

    const res = extractTweetMediaFromGraphql(payload)
    expect(res).not.toBeNull()
    expect(res?.authorHandle).toBe('testuser')
    expect(res?.tweetId).toBe('1234567890')
    expect(res?.photos.length).toBe(1)
    expect(res?.photos[0].origUrl).toBe('https://pbs.twimg.com/media/photo1?format=jpg&name=orig')
  })

  it('should extract highest bitrate mp4 for video', () => {
    const payload = {
      legacy: {
        id_str: '99887766',
        extended_entities: {
          media: [
            {
              id_str: 'video_1',
              type: 'video',
              media_url_https: 'https://pbs.twimg.com/media/thumb.jpg',
              video_info: {
                variants: [
                  { bitrate: 0, content_type: 'application/x-mpegURL', url: 'https://video.twimg.com/playlist.m3u8' },
                  { bitrate: 832000, content_type: 'video/mp4', url: 'https://video.twimg.com/720p.mp4' },
                  { bitrate: 2176000, content_type: 'video/mp4', url: 'https://video.twimg.com/1080p.mp4' },
                  { bitrate: 256000, content_type: 'video/mp4', url: 'https://video.twimg.com/360p.mp4' },
                ],
              },
            },
          ],
        },
      },
    }

    const res = extractTweetMediaFromGraphql(payload)
    expect(res).not.toBeNull()
    expect(res?.videos.length).toBe(1)
    expect(res?.videos[0].bestMp4Url).toBe('https://video.twimg.com/1080p.mp4')
    expect(res?.videos[0].bitrate).toBe(2176000)
  })
})

describe('extractTweetInfoFromDom', () => {
  it('should detect video and extract tweet id from page url on detail page', () => {
    const el = document.createElement('article')
    el.setAttribute('data-testid', 'tweet')
    el.innerHTML = `
      <div data-testid="User-Name"><span>龙海</span><span>@longhaiqwe123</span></div>
      <div data-testid="videoPlayer">
        <video src="blob:https://x.com/abc"></video>
      </div>
    `
    const info = extractTweetInfoFromDom(el, 'https://x.com/longhaiqwe123/status/1982837465')
    expect(info.tweetId).toBe('1982837465')
    expect(info.authorHandle).toBe('longhaiqwe123')
    expect(info.hasVideo).toBe(true)
    expect(info.photos.length).toBe(0)
  })

  it('should detect photos from DOM images', () => {
    const el = document.createElement('article')
    el.setAttribute('data-testid', 'tweet')
    el.innerHTML = `
      <a href="/testauthor/status/55555"><span>2 hours ago</span></a>
      <div data-testid="tweetPhoto">
        <img src="https://pbs.twimg.com/media/abc?format=jpg&name=360x360" />
      </div>
    `
    const info = extractTweetInfoFromDom(el, 'https://x.com/home')
    expect(info.tweetId).toBe('55555')
    expect(info.authorHandle).toBe('testauthor')
    expect(info.hasVideo).toBe(false)
    expect(info.photos.length).toBe(1)
    expect(info.photos[0].origUrl).toBe('https://pbs.twimg.com/media/abc?format=jpg&name=orig')
  })
})

describe('extractTweetMediaFromGraphql behavior', () => {
  const wrap = (result: object) => ({ data: { tweetResult: { result } } })
  const media = (...items: object[]) => ({ extended_entities: { media: items } })

  it('returns null for non-object payloads', () => {
    expect(extractTweetMediaFromGraphql(null)).toBeNull()
    expect(extractTweetMediaFromGraphql('x')).toBeNull()
  })

  it('treats the payload itself as the tweet when there is no tweetResult', () => {
    expect(extractTweetMediaFromGraphql({ data: {} }, '9')).toEqual({ tweetId: '9', authorHandle: '', photos: [], videos: [], gifs: [] })
    expect(extractTweetMediaFromGraphql({ data: {} })?.tweetId).toBe('')
  })

  it('unwraps TweetWithVisibilityResults', () => {
    const res = extractTweetMediaFromGraphql(wrap({ __typename: 'TweetWithVisibilityResults', tweet: { rest_id: '5' } }), '5')
    expect(res?.tweetId).toBe('5')
  })

  it('returns null when the tweet id does not match the target', () => {
    expect(extractTweetMediaFromGraphql(wrap({ rest_id: '1' }), '2')).toBeNull()
    expect(extractTweetMediaFromGraphql(wrap({ legacy: { id_str: '1' } }), '2')).toBeNull()
    expect(extractTweetMediaFromGraphql(wrap({ legacy: { id_str: '2' } }), '2')?.tweetId).toBe('2')
  })

  it('reads the author handle from core first, then legacy, trimmed', () => {
    const core = { user_results: { result: { core: { screen_name: ' new ' }, legacy: { screen_name: 'old' } } } }
    expect(extractTweetMediaFromGraphql(wrap({ core }))?.authorHandle).toBe('new')
    const legacyOnly = { user_results: { result: { legacy: { screen_name: 'old' } } } }
    expect(extractTweetMediaFromGraphql(wrap({ core: legacyOnly }))?.authorHandle).toBe('old')
  })

  it('prefers extended_entities media and falls back to entities', () => {
    const photo = (id: string) => ({ id_str: id, type: 'photo', media_url_https: `https://pbs.twimg.com/media/${id}.jpg` })
    const both = { extended_entities: { media: [photo('ext')] }, entities: { media: [photo('ent')] } }
    expect(extractTweetMediaFromGraphql(wrap({ legacy: both }))?.photos.map((p) => p.id)).toEqual(['ext'])
    expect(extractTweetMediaFromGraphql(wrap({ legacy: { entities: { media: [photo('ent')] } } }))?.photos.map((p) => p.id)).toEqual(['ent'])
    expect(extractTweetMediaFromGraphql(wrap({ legacy: { extended_entities: { media: 'x' } } }))?.photos).toEqual([])
  })

  it('builds photo items with size and fallback id / url fields', () => {
    const res = extractTweetMediaFromGraphql(wrap({ legacy: media(
      { id_str: 'a', type: 'photo', media_url_https: 'https://pbs.twimg.com/media/a.jpg', original_info: { width: 640, height: 480 } },
      { id: 42, type: 'photo', media_url: 'http://pbs.twimg.com/media/b.jpg' },
      { type: 'photo' },
    ) }))
    expect(res?.photos).toEqual([
      { id: 'a', type: 'photo', url: 'https://pbs.twimg.com/media/a.jpg', origUrl: 'https://pbs.twimg.com/media/a.jpg?name=orig', width: 640, height: 480 },
      { id: '42', type: 'photo', url: 'http://pbs.twimg.com/media/b.jpg', origUrl: 'http://pbs.twimg.com/media/b.jpg?name=orig', width: undefined, height: undefined },
      { id: '', type: 'photo', url: '', origUrl: '', width: undefined, height: undefined },
    ])
  })

  it('picks mp4 variants by content type or .mp4 url, highest bitrate first', () => {
    const res = extractTweetMediaFromGraphql(wrap({ legacy: media({
      id_str: 'v', type: 'video', media_url_https: 'https://pbs.twimg.com/media/v.jpg',
      video_info: { variants: [null, { url: 'https://video.twimg.com/low.mp4?tag=1' }, { content_type: 'video/mp4', bitrate: 500, url: 'https://video.twimg.com/mid' }, { content_type: 'application/x-mpegURL', bitrate: 9000, url: 'https://video.twimg.com/a.m3u8' }] },
    }) }))
    expect(res?.videos).toEqual([
      { id: 'v', type: 'video', url: 'https://pbs.twimg.com/media/v.jpg', origUrl: 'https://pbs.twimg.com/media/v.jpg?name=orig', bestMp4Url: 'https://video.twimg.com/mid', bitrate: 500 },
    ])
  })

  it('leaves bestMp4Url and bitrate empty when there is no usable mp4', () => {
    const run = (item: object) => extractTweetMediaFromGraphql(wrap({ legacy: media({ id_str: 'v', type: 'video', ...item }) }))?.videos[0]
    expect(run({})).toMatchObject({ bestMp4Url: undefined, bitrate: undefined })
    expect(run({ video_info: { variants: [{ content_type: 'video/mp4' }] } })).toMatchObject({ bestMp4Url: undefined, bitrate: undefined })
    expect(run({ video_info: { variants: [{ content_type: 'video/mp4', bitrate: 0, url: 'https://video.twimg.com/z.mp4' }] } })).toMatchObject({ bestMp4Url: 'https://video.twimg.com/z.mp4', bitrate: undefined })
  })

  it('puts animated gifs in gifs and skips unknown media types', () => {
    const res = extractTweetMediaFromGraphql(wrap({ legacy: media(
      { id_str: 'g', type: 'animated_gif', video_info: { variants: [{ content_type: 'video/mp4', url: 'https://video.twimg.com/g.mp4' }] } },
      { id_str: 'u', type: 'unknown' },
    ) }))
    expect(res?.gifs.map((g) => [g.id, g.type, g.bestMp4Url])).toEqual([['g', 'animated_gif', 'https://video.twimg.com/g.mp4']])
    expect(res?.videos).toEqual([])
    expect(res?.photos).toEqual([])
  })
})

describe('extractTweetInfoFromDom behavior', () => {
  const tweet = (html: string) => {
    const el = document.createElement('article')
    el.innerHTML = html
    return el
  }

  it('uses the first status link that has a numeric id', () => {
    const info = extractTweetInfoFromDom(tweet('<a href="/a/status/abc">x</a><a href="/b/status/2">y</a><a href="/c/status/3">z</a>'), 'https://x.com/d/status/4')
    expect([info.tweetId, info.authorHandle]).toEqual(['2', 'b'])
  })

  it('falls back to the page url, whose handle wins over User-Name', () => {
    expect(extractTweetInfoFromDom(tweet(''), 'https://x.com/page/status/7')).toMatchObject({ tweetId: '7', authorHandle: 'page' })
    const named = tweet('<div data-testid="User-Name">Name @named</div>')
    expect(extractTweetInfoFromDom(named, 'https://x.com/page/status/7')).toMatchObject({ tweetId: '7', authorHandle: 'page' })
  })

  it('ignores an empty or invalid page url', () => {
    expect(extractTweetInfoFromDom(tweet(''), '')).toMatchObject({ tweetId: null, authorHandle: null })
    expect(extractTweetInfoFromDom(tweet(''), 'not a url')).toMatchObject({ tweetId: null, authorHandle: null })
    expect(extractTweetInfoFromDom(tweet(''))).toMatchObject({ tweetId: null, authorHandle: null })
  })

  it('defaults to the current page url', () => {
    const before = window.location.href
    window.history.pushState({}, '', '/current/status/77')
    try {
      expect(extractTweetInfoFromDom(tweet(''))).toMatchObject({ tweetId: '77', authorHandle: 'current' })
    } finally {
      window.history.pushState({}, '', before)
    }
  })

  it('reads the handle from User-Name when no link or page url has one', () => {
    expect(extractTweetInfoFromDom(tweet('<div data-testid="User-Name">Name @user_1 · 2h</div>'), 'https://x.com/home').authorHandle).toBe('user_1')
    expect(extractTweetInfoFromDom(tweet('<div data-testid="User-Name">Name only</div>'), 'https://x.com/home').authorHandle).toBeNull()
  })

  it.each([
    ['<video></video>', true, false],
    ['<div data-testid="videoPlayer"></div>', true, false],
    ['<div data-testid="videoComponent"></div>', true, false],
    ['<button aria-label="Embedded GIF"></button>', false, true],
    ['<div aria-label="GIF"></div>', false, true],
    ['<span aria-label="Play this GIF"></span>', false, true],
    ['<span aria-label="gif"></span>', false, false],
  ])('detects video and gif from %s', (html, hasVideo, hasGif) => {
    expect(extractTweetInfoFromDom(tweet(html as string), '')).toMatchObject({ hasVideo, hasGif })
  })

  it('collects media images once each and skips avatars and emoji', () => {
    const el = tweet(
      '<img src="https://pbs.twimg.com/media/a?name=small">' +
        '<img src="https://pbs.twimg.com/media/a?name=small">' +
        '<img src="https://pbs.twimg.com/media/profile_images/b.jpg">' +
        '<img src="https://pbs.twimg.com/media/emoji/c.png">' +
        '<img src="https://abs.twimg.com/d.png">' +
        '<img src="https://pbs.twimg.com/media/e.jpg">',
    )
    expect(extractTweetInfoFromDom(el, '').photos).toEqual([
      { url: 'https://pbs.twimg.com/media/a?name=small', origUrl: 'https://pbs.twimg.com/media/a?name=orig' },
      { url: 'https://pbs.twimg.com/media/e.jpg', origUrl: 'https://pbs.twimg.com/media/e.jpg?name=orig' },
    ])
  })

  it('prefers currentSrc over src', () => {
    const el = tweet('<img src="https://pbs.twimg.com/media/a.jpg">')
    Object.defineProperty(el.querySelector('img')!, 'currentSrc', { value: 'https://pbs.twimg.com/media/big.jpg' })
    expect(extractTweetInfoFromDom(el, '').photos.map((p) => p.url)).toEqual(['https://pbs.twimg.com/media/big.jpg'])
  })
})
