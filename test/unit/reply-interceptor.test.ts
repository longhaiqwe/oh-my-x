import { describe, expect, it } from 'vitest'
import {
  isCreateTweetUrl,
  extractInReplyToTweetId,
} from '../../shared/reply-interceptor'

describe('reply-interceptor', () => {
  describe('isCreateTweetUrl', () => {
    it('正确识别 CreateTweet 相关的 GraphQL URL', () => {
      expect(
        isCreateTweetUrl(
          'https://x.com/i/api/graphql/5V_dkMmkuXiaMb3-P0Bkww/CreateTweet'
        )
      ).toBe(true)
      expect(
        isCreateTweetUrl(
          'https://twitter.com/i/api/graphql/someHash/CreateTweet'
        )
      ).toBe(true)
      expect(
        isCreateTweetUrl(
          'https://pro.x.com/i/api/graphql/someHash/create_tweet'
        )
      ).toBe(true)
    })

    it('排除其他无关接口', () => {
      expect(
        isCreateTweetUrl('https://x.com/i/api/graphql/someHash/FavoriteTweet')
      ).toBe(false)
      expect(
        isCreateTweetUrl('https://x.com/i/api/graphql/someHash/TweetDetail')
      ).toBe(false)
      expect(isCreateTweetUrl('')).toBe(false)
      expect(isCreateTweetUrl(null as any)).toBe(false)
    })
  })

  describe('extractInReplyToTweetId', () => {
    it('从请求载荷中提取 variables.reply.in_reply_to_tweet_id', () => {
      const requestBody = JSON.stringify({
        variables: {
          tweet_text: '这是我的回复',
          reply: {
            in_reply_to_tweet_id: '1841234567890123456',
            exclude_reply_user_ids: [],
          },
        },
      })
      const result = extractInReplyToTweetId(requestBody)
      expect(result).toBe('1841234567890123456')
    })

    it('从非字符串对象形式的请求载荷中提取', () => {
      const requestBody = {
        variables: {
          reply: {
            in_reply_to_tweet_id: '123456789',
          },
        },
      }
      expect(extractInReplyToTweetId(requestBody)).toBe('123456789')
    })

    it('如果是独立发推（非回复），返回 null', () => {
      const requestBody = JSON.stringify({
        variables: {
          tweet_text: '这是独立发帖，不是回复',
        },
      })
      expect(extractInReplyToTweetId(requestBody)).toBeNull()
    })

    it('从响应体中提取 in_reply_to_status_id_str', () => {
      const responseData = {
        data: {
          create_tweet: {
            tweet_results: {
              result: {
                rest_id: '9999999999',
                legacy: {
                  in_reply_to_status_id_str: '1841234567890123456',
                  full_text: '回复内容',
                },
              },
            },
          },
        },
      }
      expect(extractInReplyToTweetId(null, responseData)).toBe(
        '1841234567890123456'
      )
    })

    it('当请求与响应体都无法解析或异常时安全返回 null', () => {
      expect(extractInReplyToTweetId('invalid json string {')).toBeNull()
      expect(extractInReplyToTweetId(null, null)).toBeNull()
      expect(extractInReplyToTweetId(undefined, undefined)).toBeNull()
    })
  })
})
