import { describe, expect, it } from 'vitest'
import {
  extractActivityFromTweet,
  extractTimelinePage,
  extractQueryIdFromScript,
  type GraphQLTweetNode,
} from '../../shared/profile-activity-fetcher'

describe('profile-activity-fetcher', () => {
  describe('extractActivityFromTweet', () => {
    it('正确解析博主本人的原创推文（post）', () => {
      const tweet: GraphQLTweetNode = {
        rest_id: '1001',
        legacy: {
          created_at: 'Wed Oct 14 10:00:00 +0000 2026',
        },
        core: {
          user_results: {
            result: {
              legacy: { screen_name: 'testuser' },
            },
          },
        },
      }

      const res = extractActivityFromTweet(tweet, 'testuser')
      expect(res).not.toBeNull()
      expect(res?.id).toBe('1001')
      expect(res?.type).toBe('post')
      expect(res?.date).toBe('2026-10-14')
      expect(typeof res?.timestamp).toBe('number')
    })

    it('正确解析博主本人的回复推文（reply）', () => {
      const tweet: GraphQLTweetNode = {
        rest_id: '1002',
        legacy: {
          created_at: 'Wed Oct 14 11:00:00 +0000 2026',
          in_reply_to_status_id_str: '9999',
        },
        core: {
          user_results: {
            result: {
              legacy: { screen_name: 'testuser' },
            },
          },
        },
      }

      const res = extractActivityFromTweet(tweet, 'testuser')
      expect(res).not.toBeNull()
      expect(res?.id).toBe('1002')
      expect(res?.type).toBe('reply')
    })

    it('过滤纯转推与非当前博主的推文', () => {
      const retweet: GraphQLTweetNode = {
        rest_id: '1003',
        legacy: {
          created_at: 'Wed Oct 14 12:00:00 +0000 2026',
          retweeted_status_result: { result: {} },
        },
        core: {
          user_results: {
            result: { legacy: { screen_name: 'testuser' } },
          },
        },
      }
      expect(extractActivityFromTweet(retweet, 'testuser')).toBeNull()

      const otherUserTweet: GraphQLTweetNode = {
        rest_id: '1004',
        legacy: {
          created_at: 'Wed Oct 14 12:00:00 +0000 2026',
        },
        core: {
          user_results: {
            result: { legacy: { screen_name: 'other_author' } },
          },
        },
      }
      expect(extractActivityFromTweet(otherUserTweet, 'testuser')).toBeNull()
    })

    it('正确解析 UserWithVisibilityResults 嵌套结构中的作者 screen_name', () => {
      const tweet: GraphQLTweetNode = {
        rest_id: '1005',
        legacy: {
          created_at: 'Wed Oct 14 13:00:00 +0000 2026',
          in_reply_to_status_id_str: '2001',
        },
        core: {
          user_results: {
            result: {
              __typename: 'UserWithVisibilityResults',
              user: {
                legacy: { screen_name: 'rwayne' },
              },
            } as any,
          },
        },
      }

      const res = extractActivityFromTweet(tweet, 'rwayne')
      expect(res).not.toBeNull()
      expect(res?.id).toBe('1005')
      expect(res?.type).toBe('reply')
    })
  })

  describe('extractTimelinePage', () => {
    it('uses recent conversation activity for the boundary even when it was already seen in another module', () => {
      const tweet = (id: string, date: string) => ({ item: { itemContent: { tweet_results: { result: {
        rest_id: id, legacy: { created_at: date },
        core: { user_results: { result: { legacy: { screen_name: 'alice' } } } },
      } } } } })
      const recent = tweet('reply', '2026-10-15T10:00:00Z')
      const result = extractTimelinePage({ entries: [
        { content: { items: [recent] } },
        { content: { items: [tweet('old-parent', '2025-01-01T00:00:00Z'), recent] } },
      ] }, 'alice')
      expect(result.entries).toHaveLength(2)
      expect(result.oldestTimestamp).toBe(new Date('2026-10-15T10:00:00Z').getTime())
    })

    it('does not treat an embedded quoted tweet as another activity or a pagination boundary', () => {
      const result = extractTimelinePage({ tweet_results: { result: {
        rest_id: 'current',
        core: { user_results: { result: { legacy: { screen_name: 'alice' } } } },
        legacy: { created_at: '2026-10-15T10:00:00Z' },
        quoted_status_result: { result: {
          __typename: 'Tweet', rest_id: 'quoted',
          core: { user_results: { result: { legacy: { screen_name: 'alice' } } } },
          legacy: { created_at: '2025-01-01T00:00:00Z' },
        } },
      } } }, 'alice')
      expect(result.entries.map((entry) => entry.id)).toEqual(['current'])
      expect(result.oldestTimestamp).toBe(new Date('2026-10-15T10:00:00Z').getTime())
    })

    it('从模拟 GraphQL 树中提取推文列表和底部分页游标', () => {
      const mockGql = {
        data: {
          user: {
            result: {
              timeline_v2: {
                timeline: {
                  instructions: [
                    {
                      type: 'TimelineAddEntries',
                      entries: [
                        {
                          entryId: 'tweet-101',
                          content: {
                            entryType: 'TimelineTimelineItem',
                            itemContent: {
                              tweet_results: {
                                result: {
                                  rest_id: '101',
                                  legacy: {
                                    created_at: 'Wed Oct 14 08:00:00 +0000 2026',
                                  },
                                  core: {
                                    user_results: {
                                      result: { legacy: { screen_name: 'alice' } },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                        {
                          entryId: 'tweet-102',
                          content: {
                            entryType: 'TimelineTimelineItem',
                            itemContent: {
                              tweet_results: {
                                result: {
                                  rest_id: '102',
                                  legacy: {
                                    created_at: 'Wed Oct 14 09:00:00 +0000 2026',
                                    in_reply_to_status_id_str: '888',
                                  },
                                  core: {
                                    user_results: {
                                      result: { legacy: { screen_name: 'alice' } },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                        {
                          entryId: 'cursor-bottom-123',
                          content: {
                            entryType: 'TimelineTimelineCursor',
                            cursorType: 'Bottom',
                            value: 'cursor_token_abc_xyz',
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

      const res = extractTimelinePage(mockGql, 'alice')
      expect(res.entries.length).toBe(2)
      expect(res.entries[0].type).toBe('post')
      expect(res.entries[1].type).toBe('reply')
      expect(res.bottomCursor).toBe('cursor_token_abc_xyz')
      expect(typeof res.oldestTimestamp).toBe('number')
    })

    it('存在置顶推文时，置顶推文标记为 isPinned 且不污染 oldestTimestamp', () => {
      const mockGqlWithPin = {
        data: {
          user: {
            result: {
              timeline_v2: {
                timeline: {
                  instructions: [
                    {
                      type: 'TimelinePinEntry',
                      entry: {
                        entryId: 'pinnedTweet-999',
                        content: {
                          itemContent: {
                            tweet_results: {
                              result: {
                                rest_id: '999',
                                legacy: {
                                  created_at: 'Wed Jan 01 00:00:00 +0000 2025',
                                },
                                core: {
                                  user_results: {
                                    result: { legacy: { screen_name: 'alice' } },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                    {
                      type: 'TimelineAddEntries',
                      entries: [
                        {
                          entryId: 'tweet-101',
                          content: {
                            itemContent: {
                              tweet_results: {
                                result: {
                                  rest_id: '101',
                                  legacy: {
                                    created_at: 'Wed Oct 14 08:00:00 +0000 2026',
                                  },
                                  core: {
                                    user_results: {
                                      result: { legacy: { screen_name: 'alice' } },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                        {
                          entryId: 'cursor-bottom-456',
                          content: {
                            entryType: 'TimelineTimelineCursor',
                            cursorType: 'Bottom',
                            value: 'cursor_456',
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

      const res = extractTimelinePage(mockGqlWithPin, 'alice')
      expect(res.entries.length).toBe(2)
      const pinEntry = res.entries.find((e) => e.id === '999')
      const normalEntry = res.entries.find((e) => e.id === '101')

      expect(pinEntry?.isPinned).toBe(true)
      expect(normalEntry?.isPinned).toBe(false)

      // oldestTimestamp 应当只由未置顶推文决定（2026年），而不是置顶推文的 2025 年
      expect(res.oldestTimestamp).toBe(normalEntry?.timestamp)
      expect(res.bottomCursor).toBe('cursor_456')
    })

    it('过滤对话串中其他用户的历史推文，不污染 oldestTimestamp', () => {
      const mockGqlConversation = {
        data: {
          user: {
            result: {
              timeline_v2: {
                timeline: {
                  instructions: [
                    {
                      type: 'TimelineAddEntries',
                      entries: [
                        {
                          entryId: 'profile-conversation-1',
                          content: {
                            entryType: 'TimelineTimelineModule',
                            items: [
                              {
                                entryId: 'conversation-item-1',
                                item: {
                                  itemContent: {
                                    tweet_results: {
                                      result: {
                                        rest_id: 'root-tweet-from-other',
                                        legacy: {
                                          created_at: 'Wed Jan 01 00:00:00 +0000 2024',
                                        },
                                        core: {
                                          user_results: {
                                            result: {
                                              legacy: { screen_name: 'someone_else' },
                                            },
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                              {
                                entryId: 'conversation-item-2',
                                item: {
                                  itemContent: {
                                    tweet_results: {
                                      result: {
                                        rest_id: 'target-reply',
                                        legacy: {
                                          created_at: 'Wed Oct 14 10:00:00 +0000 2026',
                                          in_reply_to_status_id_str: 'root-tweet-from-other',
                                        },
                                        core: {
                                          user_results: {
                                            result: {
                                              user: { legacy: { screen_name: 'rwayne' } },
                                            } as any,
                                          },
                                        },
                                      },
                                    },
                                  },
                                },
                              },
                            ],
                          },
                        },
                        {
                          entryId: 'cursor-bottom-convo',
                          content: {
                            entryType: 'TimelineTimelineCursor',
                            cursorType: 'Bottom',
                            value: 'cursor_token_convo',
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

      const res = extractTimelinePage(mockGqlConversation, 'rwayne')
      expect(res.entries.length).toBe(1)
      expect(res.entries[0].id).toBe('target-reply')
      expect(res.entries[0].type).toBe('reply')
      expect(res.oldestTimestamp).toBe(new Date('Wed Oct 14 10:00:00 +0000 2026').getTime())
      expect(res.bottomCursor).toBe('cursor_token_convo')
    })
  })

  describe('extractQueryIdFromScript', () => {
    it('does not borrow the query ID of an adjacent operation in a minified bundle', () => {
      const snippet = '{queryId:"posts_query_1234567890",operationName:"UserTweets"},{queryId:"reply_query_1234567890",operationName:"UserTweetsAndReplies"}'
      expect(extractQueryIdFromScript(snippet, 'UserTweetsAndReplies')).toBe('reply_query_1234567890')
    })

    it('does not borrow an ID from the following object when the requested operation has no ID', () => {
      const snippet = '{operationName:"UserTweetsAndReplies"},{queryId:"posts_query_1234567890",operationName:"UserTweets"}'
      expect(extractQueryIdFromScript(snippet, 'UserTweetsAndReplies')).toBeNull()
    })

    it('正确嗅探 queryId:"...",operationName:"UserTweetsAndReplies"', () => {
      const snippet = 'const e={queryId:"k5_B487vD8p7y7mN7K8K8g",operationName:"UserTweetsAndReplies",operationType:"query"};'
      expect(extractQueryIdFromScript(snippet, 'UserTweetsAndReplies')).toBe('k5_B487vD8p7y7mN7K8K8g')
    })

    it('正确嗅探 operationName:"UserTweets",queryId:"..."', () => {
      const snippet = 'const e={operationName:"UserTweets",queryId:"_v_pQv_XXXX1234567890",operationType:"query"};'
      expect(extractQueryIdFromScript(snippet, 'UserTweets')).toBe('_v_pQv_XXXX1234567890')
    })

    it('支持包含引号与复杂配置属性的压缩代码', () => {
      const snippet = '{"queryId":"bt4TKuFz4T7Ckk-VvQVSow","metadata":{"featureSwitches":["1","2"]},"operationName":"UserTweetsAndReplies"}'
      expect(extractQueryIdFromScript(snippet, 'UserTweetsAndReplies')).toBe('bt4TKuFz4T7Ckk-VvQVSow')
    })

    it('不应将普通模块 id 误判为 queryId', () => {
      const snippet = 'const e={id:"chunk_12345678901234567890",operationName:"UserTweets"};'
      expect(extractQueryIdFromScript(snippet, 'UserTweets')).toBeNull()
    })

    it('未找到时安全返回 null', () => {
      expect(extractQueryIdFromScript('console.log("hello")', 'UserTweets')).toBeNull()
    })
  })
})
