import { describe, it, expect } from 'vitest'
import { extractOwnPostsPage, buildOwnPostsQuery } from '../../shared/own-posts'

const tweet = (id: string, handle = 'me', extra = {}) => ({
  __typename: 'Tweet', rest_id: id,
  core: { user_results: { result: { core: { screen_name: handle } } } },
  legacy: { full_text: '短正文', created_at: '2026-10-15T12:00:00Z' }, ...extra,
})

describe('own posts', () => {
  it('only includes authored posts, never retweets or nested quoted tweets', () => {
    const own = tweet('1', 'ME', { quoted_status_result: { result: tweet('2') } })
    const page = extractOwnPostsPage({ instructions: [{ entries: [
      own, own, tweet('3', 'other'), tweet('4', 'me', { legacy: { retweeted_status_result: {} } }),
      { cursorType: 'Bottom', value: 'next' },
    ] }] }, 'me')
    expect(page.posts.map(p => p.id)).toEqual(['1'])
    expect(page.cursor).toBe('next')
    expect(page.posts[0].url).toBe('https://x.com/ME/status/1')
  })
  it('reads note text and article titles, and rejects unidentified authors', () => {
    const page = extractOwnPostsPage({ instructions: [{ entries: [
      tweet('5', 'me', { note_tweet: { note_tweet_results: { result: { text: '完整长帖' } } } }),
      tweet('6', 'me', { article: { article_results: { result: { title: '我的文章', preview_text: '文章摘要' } } } }),
      { __typename: 'Tweet', rest_id: '7', legacy: { full_text: '未知作者' } },
    ] }] }, 'me')
    expect(page.posts.map(p => p.text)).toEqual(['完整长帖', '文章摘要'])
    expect(page.posts[1].title).toBe('我的文章')
  })
  it('scopes keyword search to the signed-in author', () => {
    expect(buildOwnPostsQuery('Me', '认知 觉醒')).toBe('from:Me "认知" "觉醒" -filter:retweets')
    expect(buildOwnPostsQuery('Me', 'from:other OR test')).toBe('from:Me "from:other" "OR" "test" -filter:retweets')
  })
})

it('extracts article covers before attached media and uses the first post image or video thumbnail', () => {
  const page=extractOwnPostsPage({instructions:[{entries:[
    tweet('10','me',{article:{article_results:{result:{title:'封面文章',cover_media:{media_info:{original_img_url:'https://pbs.twimg.com/media/cover.jpg'}}}}},legacy:{extended_entities:{media:[{media_url_https:'https://pbs.twimg.com/media/other.jpg'}]}}}),
    tweet('11','me',{legacy:{extended_entities:{media:[{type:'video',media_url_https:'https://pbs.twimg.com/ext_tw_video_thumb/video.jpg'}]}}}),
    tweet('12','me',{legacy:{entities:{media:[{media_url_https:'https://pbs.twimg.com/media/photo.jpg'}]}}}),
    tweet('13','me',{article:{article_results:{result:{cover_media:{media_info:{original_img_url:'https://evil.example/track.jpg'}}}}}}),
  ]}]},'me')
  expect(page.posts.sort((a,b)=>a.id.localeCompare(b.id)).map(p=>p.thumbnailUrl)).toEqual(['https://pbs.twimg.com/media/cover.jpg','https://pbs.twimg.com/ext_tw_video_thumb/video.jpg','https://pbs.twimg.com/media/photo.jpg',null])
})
