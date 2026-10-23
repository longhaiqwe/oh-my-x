import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  EMPTY_SEARCH_FILTERS,
  buildSearchQuery,
  createSearchLatestTracker,
  filteredSearchHref,
  grokAskHref,
  hasSearchFilters,
  latestSearchHref,
  navigateSearchPage,
  parseSearchLocation,
  searchHref,
  splitSearchQuery,
} from '../../shared/search-tools'

describe('splitSearchQuery / buildSearchQuery', () => {
  it('拆出筛选条管的语法，其余部分按原顺序保留', () => {
    const { terms, filters } = splitSearchQuery('claude  code within_time:7d min_faves:100 -filter:replies filter:images')
    expect(terms).toBe('claude code')
    expect(filters).toEqual({ time: '7d', minLikes: 100, originalOnly: true, media: 'images' })
  })

  it('引号里的短语算一个词，里面的语法不拆', () => {
    const { terms, filters } = splitSearchQuery('"min_faves:5 是什么"  from:x')
    expect(terms).toBe('"min_faves:5 是什么" from:x')
    expect(filters).toEqual(EMPTY_SEARCH_FILTERS)
  })

  it('不认识的语法原样保留，包括筛选条不管的 lang:', () => {
    expect(splitSearchQuery('a filter:links -filter:retweets since:2026-01-01 lang:zh').terms)
      .toBe('a filter:links -filter:retweets since:2026-01-01 lang:zh')
  })

  it('同一类语法写了两次时以最后一个为准，拼回去只留一个', () => {
    const { terms, filters } = splitSearchQuery('a min_faves:10 min_faves:500')
    expect(buildSearchQuery(terms, filters)).toBe('a min_faves:500')
  })

  it('按固定顺序拼回，没有条件时只剩其余部分', () => {
    expect(buildSearchQuery('a b', { time: '24h', minLikes: 10, originalOnly: true, media: 'media' }))
      .toBe('a b within_time:24h min_faves:10 -filter:replies filter:media')
    expect(buildSearchQuery(' a ', EMPTY_SEARCH_FILTERS)).toBe('a')
    expect(buildSearchQuery('', { ...EMPTY_SEARCH_FILTERS, media: 'videos' })).toBe('filter:videos')
  })

  it('hasSearchFilters 只看筛选条管的条件', () => {
    expect(hasSearchFilters(EMPTY_SEARCH_FILTERS)).toBe(false)
    expect(hasSearchFilters({ ...EMPTY_SEARCH_FILTERS, originalOnly: true })).toBe(true)
  })
})

describe('parseSearchLocation', () => {
  it('读出搜索词、标签和只看关注的人', () => {
    expect(parseSearchLocation('https://x.com/search?q=claude%20code&src=typed_query&f=live&pf=on'))
      .toEqual({ query: 'claude code', tab: 'live', following: true, hashtag: false })
    expect(parseSearchLocation('/search?q=a+b')).toEqual({ query: 'a b', tab: null, following: false, hashtag: false })
  })

  it('话题标签页的搜索词是「#标签」', () => {
    expect(parseSearchLocation('/hashtag/%E4%BA%BA%E5%B7%A5%E6%99%BA%E8%83%BD?src=hashtag_click'))
      .toEqual({ query: '#人工智能', tab: null, following: false, hashtag: true })
  })

  it('其他页面和空搜索词返回 null', () => {
    for (const href of ['/home', '/search', '/search?q=%20', '/search-advanced', '/explore/tabs/for-you', '/hashtag/']) {
      expect(parseSearchLocation(href)).toBeNull()
    }
  })
})

describe('latestSearchHref', () => {
  it('停在「热门」时加上 f=live，空格写成 %20', () => {
    expect(latestSearchHref('https://x.com/search?q=claude%20code&src=typed_query'))
      .toBe('/search?q=claude%20code&src=typed_query&f=live')
    expect(latestSearchHref('/hashtag/AI?src=hashtag_click')).toBe('/hashtag/AI?src=hashtag_click&f=live')
  })

  it('已经选了标签、或不是搜索页时不改', () => {
    expect(latestSearchHref('/search?q=a&f=live')).toBeNull()
    expect(latestSearchHref('/search?q=a&f=user')).toBeNull()
    expect(latestSearchHref('/home')).toBeNull()
  })
})

describe('filteredSearchHref', () => {
  it('换搜索词，保留标签和其他参数', () => {
    expect(filteredSearchHref('/search?q=a&src=typed_query&f=live', 'a min_faves:100', false))
      .toBe('/search?q=a%20min_faves%3A100&src=typed_query&f=live')
  })

  it('打开、关闭只看关注的人', () => {
    expect(filteredSearchHref('/search?q=a&f=live', 'a', true)).toBe('/search?q=a&f=live&pf=on')
    expect(filteredSearchHref('/search?q=a&pf=on&f=live', 'a', false)).toBe('/search?q=a&f=live')
  })

  it('话题标签页换成搜索页，带上当前标签', () => {
    expect(filteredSearchHref('/hashtag/AI?src=hashtag_click&f=live', '#AI filter:videos', false))
      .toBe('/search?q=%23AI%20filter%3Avideos&f=live')
  })

  it('不是搜索页或搜索词为空时返回 null', () => {
    expect(filteredSearchHref('/home', 'a', false)).toBeNull()
    expect(filteredSearchHref('/search?q=a', '  ', false)).toBeNull()
  })
})

describe('createSearchLatestTracker', () => {
  it('新的搜索停在「热门」时换成「最新」', () => {
    const tracker = createSearchLatestTracker()
    expect(tracker.next('/search?q=a&src=typed_query')).toBe('/search?q=a&src=typed_query&f=live')
    expect(tracker.next('/search?q=a&f=live')).toBeNull()
    expect(tracker.next('/home')).toBeNull()
  })

  it('用户选过「热门」的搜索词保持「热门」，换了搜索词照常切换', () => {
    const tracker = createSearchLatestTracker()
    tracker.keepTop('a')
    expect(tracker.next('/search?q=a')).toBeNull()
    expect(tracker.next('/search?q=a&pf=on')).toBeNull()
    expect(tracker.next('/search?q=b')).toBe('/search?q=b&f=live')
  })
})

describe('searchHref / grokAskHref', () => {
  it('搜索地址带 src=typed_query，空格写成 %20', () => {
    expect(searchHref(' Claude lang:zh ')).toBe('/search?q=Claude%20lang%3Azh&src=typed_query')
    expect(searchHref('  ')).toBeNull()
  })

  it('Grok 地址用 text 参数带上问题，过长时截断', () => {
    expect(grokAskHref(' 上周 Claude 的新功能 ')).toBe(`/i/grok?text=${encodeURIComponent('上周 Claude 的新功能')}`)
    expect(grokAskHref('a'.repeat(2100))).toBe(`/i/grok?text=${'a'.repeat(2000)}`)
    expect(grokAskHref('')).toBeNull()
  })
})

describe('navigateSearchPage', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('新增一条历史记录并派发 popstate，记录格式和 X 的路由一致', () => {
    const onPop = vi.fn()
    window.addEventListener('popstate', onPop)
    const before = window.history.length
    expect(navigateSearchPage('/search?q=a&f=live', false)).toBe(true)
    window.removeEventListener('popstate', onPop)

    expect(window.location.pathname + window.location.search).toBe('/search?q=a&f=live')
    expect(window.history.length).toBe(before + 1)
    expect(window.history.state).toEqual({ key: expect.stringMatching(/^[a-z0-9]{1,6}$/), state: undefined })
    expect(onPop).toHaveBeenCalledTimes(1)
    expect((onPop.mock.calls[0][0] as PopStateEvent).state).toEqual(window.history.state)
  })

  it('replace 时替换当前记录，保留原来的记录数据', () => {
    window.history.pushState({ key: 'abc123', state: { isReplace: true } }, '', '/search?q=a')
    const before = window.history.length
    expect(navigateSearchPage('/search?q=a&f=live', true)).toBe(true)
    expect(window.history.length).toBe(before)
    expect(window.history.state).toEqual({ key: 'abc123', state: { isReplace: true } })
    expect(window.location.search).toBe('?q=a&f=live')
  })

  it('也接受 Grok 页地址', () => {
    expect(navigateSearchPage('/i/grok?text=hi', false)).toBe(true)
    expect(window.location.pathname + window.location.search).toBe('/i/grok?text=hi')
  })

  it('只接受同源的搜索页和 Grok 页地址', () => {
    const onPop = vi.fn()
    window.addEventListener('popstate', onPop)
    for (const href of ['/home', '/i/grok/share', '//evil.example/search?q=a', 'https://evil.example/i/grok?text=a', 'https://evil.example/search?q=a', 'javascript:alert(1)', 42, null]) {
      expect(navigateSearchPage(href, false)).toBe(false)
    }
    window.removeEventListener('popstate', onPop)
    expect(onPop).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/')
  })
})
