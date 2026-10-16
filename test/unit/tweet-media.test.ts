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
