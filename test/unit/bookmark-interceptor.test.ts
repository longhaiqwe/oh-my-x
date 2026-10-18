import { describe, it, expect } from 'vitest'
import {
  isTweetOrArticleUrl,
  extractBookmarkMetrics,
  extractBookmarkFromAriaLabel,
  formatBookmarkCount,
  getBookmarkOwnerIds,
} from '../../shared/bookmark-interceptor'

describe('bookmark-interceptor', () => {
  describe('isTweetOrArticleUrl', () => {
    it('should match tweet and article graphql endpoints', () => {
      expect(
        isTweetOrArticleUrl(
          'https://x.com/i/api/graphql/abc/TweetDetail?variables=%7B%22focalTweetId%22%3A%22123%22%7D',
        ),
      ).toBe(true)
      expect(
        isTweetOrArticleUrl(
          'https://x.com/i/api/graphql/def/ArticleByRestId?variables=%7B%22id%22%3A%22456%22%7D',
        ),
      ).toBe(true)
      expect(
        isTweetOrArticleUrl(
          'https://x.com/i/api/graphql/ghi/UserTweets?variables=%7B%22userId%22%3A%22789%22%7D',
        ),
      ).toBe(true)
    })

    it('should ignore non-graphql or irrelevant urls', () => {
      expect(isTweetOrArticleUrl('https://x.com/home')).toBe(false)
      expect(isTweetOrArticleUrl('https://x.com/i/api/1.1/account/settings.json')).toBe(false)
      expect(isTweetOrArticleUrl('https://x.com/i/api/graphql/FetchScheduledTweets')).toBe(false)
    })
  })

  describe('extractBookmarkMetrics', () => {
    it('should extract bookmark counts from nested tweet objects', () => {
      const mockData = {
        data: {
          threaded_conversation_with_injections_v2: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  {
                    entryId: 'tweet-1001',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            rest_id: '1001',
                            legacy: {
                              bookmark_count: 245,
                              favorite_count: 500,
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
      }

      const res = extractBookmarkMetrics(mockData)
      expect(res['1001']).toBe(245)
    })

    it('should map associated article rest_id when present in tweet', () => {
      const mockData = {
        data: {
          tweetResult: {
            result: {
              rest_id: '2001',
              legacy: {
                bookmark_count: 89,
              },
              article: {
                rest_id: 'art-999',
              },
            },
          },
        },
      }

      const res = extractBookmarkMetrics(mockData)
      expect(res['2001']).toBe(89)
      expect(res['art-999']).toBe(89)
    })

    it('should extract all multiple tweets in user profile timeline', () => {
      const entries = Array.from({ length: 20 }, (_, i) => ({
        entryId: `tweet-${i + 1}`,
        content: {
          itemContent: {
            tweet_results: {
              result: {
                rest_id: `id_${i + 1}`,
                legacy: {
                  bookmark_count: (i + 1) * 10,
                },
              },
            },
          },
        },
      }))

      const mockProfileData = {
        data: {
          user: {
            result: {
              timeline_v2: {
                timeline: {
                  instructions: [
                    {
                      type: 'TimelineAddEntries',
                      entries,
                    },
                  ],
                },
              },
            },
          },
        },
      }

      const res = extractBookmarkMetrics(mockProfileData)
      // 验证全部 20 条推文均被精准提取，无任何截断
      for (let i = 1; i <= 20; i++) {
        expect(res[`id_${i}`]).toBe(i * 10)
      }
    })

    it('should extract retweet original tweet bookmark count', () => {
      const mockRetweet = {
        data: {
          threaded_conversation_with_injections_v2: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  {
                    entryId: 'tweet-retweet-1',
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            rest_id: 'container_id',
                            legacy: {
                              bookmark_count: 5,
                              retweeted_status_result: {
                                result: {
                                  rest_id: 'original_tweet_id',
                                  legacy: {
                                    bookmark_count: 520,
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
      }

      const res = extractBookmarkMetrics(mockRetweet)
      expect(res['container_id']).toBe(5)
      expect(res['original_tweet_id']).toBe(520)
    })

    it('should map tweet id and article id mutually when bookmark count resides in article_results', () => {
      const mockArticleTweet = {
        data: {
          user: {
            result: {
              timeline_v2: {
                timeline: {
                  instructions: [
                    {
                      type: 'TimelinePinEntry',
                      entry: {
                        entryId: 'tweet-pin-1',
                        content: {
                          itemContent: {
                            tweet_results: {
                              result: {
                                rest_id: 'status_184123',
                                legacy: {
                                  favorite_count: 205,
                                  retweet_count: 68,
                                },
                                article: {
                                  article_results: {
                                    result: {
                                      rest_id: 'article_184000',
                                      bookmark_count: 447,
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
              },
            },
          },
        },
      }

      const res = extractBookmarkMetrics(mockArticleTweet)
      expect(res['status_184123']).toBe(447)
      expect(res['article_184000']).toBe(447)
    })

    it('should handle empty or malformed data gracefully', () => {
      expect(extractBookmarkMetrics(null)).toEqual({})
      expect(extractBookmarkMetrics(undefined)).toEqual({})
      expect(extractBookmarkMetrics('hello')).toEqual({})
      expect(extractBookmarkMetrics({})).toEqual({})
    })
  })

  describe('extractBookmarkFromAriaLabel', () => {
    it('should parse chinese aria-label strings', () => {
      expect(extractBookmarkFromAriaLabel('186 个书签。将帖子添加到书签')).toBe(186)
      expect(extractBookmarkFromAriaLabel('32 书签')).toBe(32)
      expect(extractBookmarkFromAriaLabel('1,234 收藏')).toBe(1234)
      expect(extractBookmarkFromAriaLabel('书签: 45')).toBe(45)
      expect(extractBookmarkFromAriaLabel('书签（99）')).toBe(99)
    })

    it('should parse english aria-label strings', () => {
      expect(extractBookmarkFromAriaLabel('186 Bookmarks. Bookmark')).toBe(186)
      expect(extractBookmarkFromAriaLabel('1 Bookmark')).toBe(1)
      expect(extractBookmarkFromAriaLabel('Bookmark (42)')).toBe(42)
    })

    it('should return null for labels without numbers', () => {
      expect(extractBookmarkFromAriaLabel('书签')).toBeNull()
      expect(extractBookmarkFromAriaLabel('将帖子添加到书签')).toBeNull()
      expect(extractBookmarkFromAriaLabel('Bookmark')).toBeNull()
      expect(extractBookmarkFromAriaLabel('')).toBeNull()
      expect(extractBookmarkFromAriaLabel(null)).toBeNull()
    })
  })

  describe('getBookmarkOwnerIds', () => {
    // 按 2026-10-18 长文详情页的真实结构简化：顶部操作栏没有时间链接，正文里嵌着别人的推文
    const LONG_ARTICLE_DETAIL = `
      <article data-testid="tweet" role="article">
        <article data-testid="twitterArticleReadView" role="article">
          <a href="/me/article/111/media/900">封面</a>
          <div role="group">
            <a href="/me/status/111/analytics">1.2万</a>
            <button data-testid="bookmark" id="top-bookmark" aria-label="书签"></button>
          </div>
          <div data-testid="twitterArticleRichTextView">
            <a href="https://x.com/other/status/222" role="link">正文里的文字链接</a>
            <div data-testid="simpleTweet">
              <article data-testid="tweet" role="article">
                <div data-testid="User-Name">
                  <a href="/other/status/222" role="link"><time>9月5日</time></a>
                </div>
                <div role="group"><a href="/other/status/222/analytics">3万</a></div>
              </article>
            </div>
          </div>
        </article>
        <a href="/me/status/111" role="link"><time>10月17日</time></a>
        <div role="group">
          <button data-testid="bookmark" id="bottom-bookmark" aria-label="108 书签。加入书签"></button>
        </div>
      </article>
    `

    it('长文顶部操作栏取本推文 ID，不取正文里嵌入推文和文字链接的 ID', () => {
      document.body.innerHTML = LONG_ARTICLE_DETAIL
      expect(getBookmarkOwnerIds(document.getElementById('top-bookmark')!)).toEqual(['111'])
    })

    it('长文底部操作栏没有浏览量链接时，用本推文的时间链接', () => {
      document.body.innerHTML = LONG_ARTICLE_DETAIL
      expect(getBookmarkOwnerIds(document.getElementById('bottom-bookmark')!)).toEqual(['111'])
    })

    it('跳过引用推文卡片和推文正文里的链接', () => {
      document.body.innerHTML = `
        <article data-testid="tweet" role="article">
          <div data-testid="tweetText"><a href="/linked/status/777">正文链接</a></div>
          <div role="link" tabindex="0">
            <time>10月1日</time>
            <a href="/quoted/status/333/photo/1">图片</a>
          </div>
          <a href="/me/status/444" role="link"><time>10月2日</time></a>
          <div role="group"><button data-testid="bookmark" id="bm"></button></div>
        </article>
      `
      expect(getBookmarkOwnerIds(document.getElementById('bm')!)).toEqual(['444'])
    })

    it('推文里找不到 ID 时才用地址栏里的 ID', () => {
      document.body.innerHTML = `<div role="group"><button data-testid="bookmark" id="bm"></button></div>`
      const btn = document.getElementById('bm')!
      expect(getBookmarkOwnerIds(btn)).toEqual([])
      expect(getBookmarkOwnerIds(btn, '/me/status/555')).toEqual(['555'])

      document.body.innerHTML = LONG_ARTICLE_DETAIL
      expect(getBookmarkOwnerIds(document.getElementById('top-bookmark')!, '/x/status/999')).not.toContain('999')
    })
  })

  describe('formatBookmarkCount', () => {
    it('should format numbers under 10k', () => {
      expect(formatBookmarkCount(0)).toBe('')
      expect(formatBookmarkCount(-5)).toBe('')
      expect(formatBookmarkCount(42)).toBe('42')
      expect(formatBookmarkCount(9999)).toBe('9,999')
    })

    it('should format numbers 10k and above in Chinese', () => {
      expect(formatBookmarkCount(10000, 'zh')).toBe('1万')
      expect(formatBookmarkCount(12500, 'zh')).toBe('1.3万') // toFixed(1)
      expect(formatBookmarkCount(240000, 'zh')).toBe('24万')
    })

    it('should format numbers 10k and above in English', () => {
      expect(formatBookmarkCount(10000, 'en')).toBe('10K')
      expect(formatBookmarkCount(12500, 'en')).toBe('12.5K')
    })
  })
})
