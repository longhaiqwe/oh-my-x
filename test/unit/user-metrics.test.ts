import { describe, it, expect } from 'vitest'
import {
  isUserOrTimelineUrl,
  extractUserMetrics,
  formatFollowerCount,
  formatFollowerTooltip,
  getFollowerTier,
} from '../../shared/user-metrics-interceptor'

describe('user-metrics-interceptor 单元测试', () => {
  describe('isUserOrTimelineUrl URL 过滤判定', () => {
    it('正确识别 GraphQL 与用户 REST 接口', () => {
      expect(isUserOrTimelineUrl('https://x.com/i/api/graphql/abc123/Following')).toBe(true)
      expect(isUserOrTimelineUrl('https://x.com/i/api/graphql/def456/Followers')).toBe(true)
      expect(isUserOrTimelineUrl('https://x.com/i/api/graphql/ghi789/HomeTimeline')).toBe(true)
      expect(isUserOrTimelineUrl('https://x.com/i/api/1.1/users/lookup.json')).toBe(true)
    })

    it('排除排期与系统设置等无关接口', () => {
      expect(isUserOrTimelineUrl('https://x.com/i/api/graphql/xyz/FetchScheduledTweets')).toBe(false)
      expect(isUserOrTimelineUrl('https://x.com/i/api/1.1/account/settings.json')).toBe(false)
      expect(isUserOrTimelineUrl('')).toBe(false)
    })
  })

  describe('extractUserMetrics 数据提取', () => {
    it('能从用户列表（Following/Followers）的 instructions 中提取所有用户粉丝与关注指标', () => {
      const mockFollowingData = {
        data: {
          user: {
            result: {
              timeline: {
                timeline: {
                  instructions: [
                    {
                      type: 'TimelineAddEntries',
                      entries: [
                        {
                          entryId: 'user-44196397',
                          content: {
                            itemContent: {
                              user_results: {
                                result: {
                                  rest_id: '44196397',
                                  legacy: {
                                    screen_name: 'elonmusk',
                                    name: 'Elon Musk',
                                    followers_count: 195000000,
                                    friends_count: 750,
                                  },
                                },
                              },
                            },
                          },
                        },
                        {
                          entryId: 'user-12',
                          content: {
                            itemContent: {
                              user_results: {
                                result: {
                                  rest_id: '12',
                                  legacy: {
                                    screen_name: 'jack',
                                    name: 'jack',
                                    followers_count: 6500000,
                                    friends_count: 4500,
                                  },
                                },
                              },
                            },
                          },
                        },
                      ],
                    },
                  ],
                },
              },
            },
          },
        },
      }

      const metrics = extractUserMetrics(mockFollowingData)
      expect(metrics['elonmusk']).toBeDefined()
      expect(metrics['elonmusk'].followersCount).toBe(195000000)
      expect(metrics['elonmusk'].followingCount).toBe(750)
      expect(metrics['44196397']).toBeDefined() // 按 restId 也能索引到

      expect(metrics['jack']).toBeDefined()
      expect(metrics['jack'].followersCount).toBe(6500000)
      expect(metrics['jack'].followingCount).toBe(4500)
    })

    it('能从信息流推文（HomeTimeline/TweetDetail）中提取推文作者的粉丝数', () => {
      const mockTimelineData = {
        data: {
          home: {
            home_timeline_uploader: {
              instructions: [
                {
                  type: 'TimelineAddEntries',
                  entries: [
                    {
                      entryId: 'tweet-1234567890',
                      content: {
                        itemContent: {
                          tweet_results: {
                            result: {
                              rest_id: '1234567890',
                              core: {
                                user_results: {
                                  result: {
                                    rest_id: '998877',
                                    legacy: {
                                      screen_name: 'sama',
                                      name: 'Sam Altman',
                                      followers_count: 3200000,
                                      friends_count: 600,
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      }

      const metrics = extractUserMetrics(mockTimelineData)
      expect(metrics['sama']).toBeDefined()
      expect(metrics['sama'].followersCount).toBe(3200000)
      expect(metrics['998877']).toBeDefined()
    })

    it('对大小写不敏感存储', () => {
      const mockData = {
        user_results: {
          result: {
            legacy: {
              screen_name: 'Alice_Bob',
              followers_count: 1000,
            },
          },
        },
      }
      const metrics = extractUserMetrics(mockData)
      expect(metrics['alice_bob']).toBeDefined()
      expect(metrics['alice_bob'].followersCount).toBe(1000)
      expect(metrics['alice_bob'].screenName).toBe('Alice_Bob')
    })
  })

  describe('formatFollowerCount 格式化', () => {
    it('中文环境格式化规则', () => {
      expect(formatFollowerCount(0, 'zh')).toBe('0')
      expect(formatFollowerCount(850, 'zh')).toBe('850')
      expect(formatFollowerCount(1234, 'zh')).toBe('1234')
      expect(formatFollowerCount(9999, 'zh')).toBe('9999')
      expect(formatFollowerCount(10000, 'zh')).toBe('1万')
      expect(formatFollowerCount(12500, 'zh')).toBe('1.25万')
      expect(formatFollowerCount(125000, 'zh')).toBe('12.5万')
      expect(formatFollowerCount(100000000, 'zh')).toBe('1亿')
      expect(formatFollowerCount(190000000, 'zh')).toBe('1.9亿')
      expect(formatFollowerCount(195000000, 'zh')).toBe('1.95亿')
      expect(formatFollowerCount(200000000, 'zh')).toBe('2亿')
    })

    it('英文环境格式化规则', () => {
      expect(formatFollowerCount(850, 'en')).toBe('850')
      expect(formatFollowerCount(1200, 'en')).toBe('1.2K')
      expect(formatFollowerCount(1500000, 'en')).toBe('1.5M')
      expect(formatFollowerCount(2000000000, 'en')).toBe('2B')
    })
  })

  describe('getFollowerTier 分级配色等级', () => {
    it('正确计算 0..4 级等级', () => {
      expect(getFollowerTier(0)).toBe(0)
      expect(getFollowerTier(161)).toBe(0)
      expect(getFollowerTier(1000)).toBe(1)
      expect(getFollowerTier(8500)).toBe(1)
      expect(getFollowerTier(10000)).toBe(2)
      expect(getFollowerTier(35000)).toBe(2)
      expect(getFollowerTier(100000)).toBe(3)
      expect(getFollowerTier(174000)).toBe(3)
      expect(getFollowerTier(1000000)).toBe(4)
      expect(getFollowerTier(195000000)).toBe(4)
    })
  })

  describe('formatFollowerTooltip 提示文案', () => {
    it('包含关注数时的文案', () => {
      const tip = formatFollowerTooltip({
        screenName: 'test',
        followersCount: 125482,
        followingCount: 650,
      })
      expect(tip).toBe('粉丝: 125,482 · 关注: 650')
    })

    it('仅有粉丝数时的文案', () => {
      const tip = formatFollowerTooltip({
        screenName: 'test',
        followersCount: 125482,
      })
      expect(tip).toBe('粉丝: 125,482')
    })
  })
})
