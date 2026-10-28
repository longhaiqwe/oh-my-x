import { describe, it, expect, beforeEach } from 'vitest'
import {
  parseStatNumber,
  extractCountFromElement,
  isTargetProfilePage,
  isTargetTweetDetailPage,
  getImpressionsRatioLevel,
  getEngagementRatioLevel,
  getTweetAuthor,
  isTweetAuthorTarget,
  addStatRatioBadges,
} from '../../content-scripts/options/stat-ratio'

describe('stat-ratio.ts 单元测试', () => {
  describe('parseStatNumber', () => {
    it('处理纯数字与带逗号格式', () => {
      expect(parseStatNumber('202')).toBe(202)
      expect(parseStatNumber('367,602')).toBe(367602)
      expect(parseStatNumber('0')).toBe(0)
    })

    it('处理 "万" / "W"', () => {
      expect(parseStatNumber('36万')).toBe(360000)
      expect(parseStatNumber('10.7万')).toBe(107000)
      expect(parseStatNumber('1.2万')).toBe(12000)
      expect(parseStatNumber('1.2W')).toBe(12000)
    })

    it('处理 "亿" / "B"', () => {
      expect(parseStatNumber('2.4亿')).toBe(240000000)
      expect(parseStatNumber('1.5B')).toBe(1500000000)
    })

    it('处理 "K" / "M"', () => {
      expect(parseStatNumber('3.5K')).toBe(3500)
      expect(parseStatNumber('2.4M')).toBe(2400000)
    })
  })

  describe('extractCountFromElement', () => {
    it('从带有 aria-label 的元素中正确解析', () => {
      const el = document.createElement('button')
      el.setAttribute('aria-label', '367602 次查看。查看帖子分析')
      expect(extractCountFromElement(el)).toBe(367602)

      const replyEl = document.createElement('button')
      replyEl.setAttribute('aria-label', '202 回复。回复')
      expect(extractCountFromElement(replyEl)).toBe(202)
    })
  })

  describe('isTargetProfilePage', () => {
    it('识别目标 Profile 主页 URL', () => {
      window.history.pushState({}, '', '/creator_user')
      expect(isTargetProfilePage('creator_user')).toBe(true)

      window.history.pushState({}, '', '/creator_user/with_replies')
      expect(isTargetProfilePage('creator_user')).toBe(true)

      window.history.pushState({}, '', '/creator_user/status/123456')
      expect(isTargetProfilePage('creator_user')).toBe(false)

      window.history.pushState({}, '', '/other_user')
      expect(isTargetProfilePage('creator_user')).toBe(false)
    })

    it('支持通配符 * 在所有个人主页生效，并排除系统页面', () => {
      window.history.pushState({}, '', '/elonmusk')
      expect(isTargetProfilePage('*')).toBe(true)

      window.history.pushState({}, '', '/elonmusk/media')
      expect(isTargetProfilePage('*')).toBe(true)

      window.history.pushState({}, '', '/home')
      expect(isTargetProfilePage('*')).toBe(false)

      window.history.pushState({}, '', '/notifications')
      expect(isTargetProfilePage('*')).toBe(false)
    })

    it('自动忽略 Handle 中的 @ 前缀', () => {
      window.history.pushState({}, '', '/creator_user')
      expect(isTargetProfilePage('@creator_user')).toBe(true)
    })
  })

  describe('getTweetAuthor & isTweetAuthorTarget', () => {
    it('从推文 DOM 提取作者 handle 并匹配目标账号', () => {
      window.history.pushState({}, '', '/creator_user/with_replies')
      const article = document.createElement('article')
      article.setAttribute('data-testid', 'tweet')
      article.innerHTML = `
        <div data-testid="UserAvatar-Container-creator_user"></div>
        <div data-testid="User-Name">
          <a href="/creator_user" role="link"><span>@creator_user</span></a>
        </div>
        <div role="group" id="id__123">
          <a href="/creator_user/status/12345/analytics"><button>15</button></a>
        </div>
      `
      const group = article.querySelector('[role="group"]')!

      expect(getTweetAuthor(group)).toBe('creator_user')
      expect(isTweetAuthorTarget(group, 'creator_user')).toBe(true)
      expect(isTweetAuthorTarget(group, 'other_user')).toBe(false)
    })

    it('在 /creator_user/with_replies 页面上，即使配置了通配符 *，非主页 Owner (如 XPnftclub) 也返回 false', () => {
      window.history.pushState({}, '', '/creator_user/with_replies')
      const article = document.createElement('article')
      article.setAttribute('data-testid', 'tweet')
      article.innerHTML = `
        <div data-testid="UserAvatar-Container-XPnftclub"></div>
        <div data-testid="User-Name">
          <a href="/XPnftclub" role="link"><span>@XPnftclub</span></a>
        </div>
        <div role="group" id="id__456">
          <a href="/XPnftclub/status/99999/analytics"><button>100</button></a>
        </div>
      `
      const group = article.querySelector('[role="group"]')!

      expect(getTweetAuthor(group)).toBe('xpnftclub')
      expect(isTweetAuthorTarget(group, 'creator_user')).toBe(false)
      // 关键校验：通配符 * 也不应在别人的原帖上生效，因为粉丝数是 creator_user 的
      expect(isTweetAuthorTarget(group, '*')).toBe(false)
    })
  })

  describe('addStatRatioBadges 只在自己的推文上生效', () => {
    beforeEach(() => {
      document.body.innerHTML = ''
    })

    it('在 with_replies 页面中，仅为用户自己的推文生成徽章，跳过原贴/他人推文', () => {
      window.history.pushState({}, '', '/creator_user/with_replies')
      document.body.innerHTML = `
        <a href="/creator_user/followers">633 关注者</a>
        <!-- 原贴: 他人的推文 (如 XPnftclub / OpenAI) -->
        <article data-testid="tweet">
          <div data-testid="UserAvatar-Container-XPnftclub"></div>
          <div data-testid="User-Name"><a href="/XPnftclub">@XPnftclub</a></div>
          <div>
            <div role="group" id="id__other_tweet">
              <button aria-label="10 回复" data-testid="reply">10</button>
              <a href="/XPnftclub/status/100/analytics" aria-label="1000 次查看"><span data-testid="app-text-transition-container">1000</span></a>
            </div>
          </div>
        </article>

        <!-- 我的评论回复帖子 -->
        <article data-testid="tweet">
          <div data-testid="UserAvatar-Container-creator_user"></div>
          <div data-testid="User-Name"><a href="/creator_user">@creator_user</a></div>
          <div>
            <div role="group" id="id__my_tweet">
              <button aria-label="5 回复" data-testid="reply">5</button>
              <a href="/creator_user/status/200/analytics" aria-label="100 次查看"><span data-testid="app-text-transition-container">100</span></a>
            </div>
          </div>
        </article>
      `

      addStatRatioBadges('creator_user')

      const otherGroup = document.querySelector('#id__other_tweet')!
      const myGroup = document.querySelector('#id__my_tweet')!

      // 他人推文不应包含徽章
      expect(otherGroup.querySelectorAll('.xf-stat-ratio-badge').length).toBe(0)

      // 自己的推文应包含徽章
      expect(myGroup.querySelectorAll('.xf-stat-ratio-badge').length).toBeGreaterThan(0)
    })
  })

  describe('等级计算函数', () => {
    it('曝光 / 粉丝 比例等级判断', () => {
      expect(getImpressionsRatioLevel(0.1)).toBeNull()
      expect(getImpressionsRatioLevel(0.5)?.label).toBe('普通')
      expect(getImpressionsRatioLevel(2.5)?.label).toBe('良好')
      expect(getImpressionsRatioLevel(8.0)?.label).toBe('优秀')
      expect(getImpressionsRatioLevel(25.0)?.label).toBe('爆火')
    })

    it('互动 / 粉丝 比例等级判断', () => {
      expect(getEngagementRatioLevel(0.002)).toBeNull() // 0.2% (低于 0.5% 不展示)
      expect(getEngagementRatioLevel(0.01)?.label).toBe('普通') // 1%
      expect(getEngagementRatioLevel(0.03)?.label).toBe('良好') // 3%
      expect(getEngagementRatioLevel(0.10)?.label).toBe('优秀') // 10%
      expect(getEngagementRatioLevel(0.30)?.label).toBe('爆火') // 30%
    })
  })

  describe('低比例数据不渲染徽章（方案三）', () => {
    beforeEach(() => {
      document.body.innerHTML = ''
    })

    it('当互动和曝光均处于起步阶段时，不插入徽章', () => {
      window.history.pushState({}, '', '/creator_user')
      document.body.innerHTML = `
        <a href="/creator_user/followers">10,000 关注者</a>
        <article data-testid="tweet">
          <div data-testid="UserAvatar-Container-creator_user"></div>
          <div data-testid="User-Name"><a href="/creator_user">@creator_user</a></div>
          <div>
            <div role="group" id="id__low_stat">
              <button aria-label="1 回复" data-testid="reply">1</button>
              <button aria-label="1 喜欢" data-testid="like">1</button>
              <a href="/creator_user/status/100/analytics" aria-label="50 次查看"><span data-testid="app-text-transition-container">50</span></a>
            </div>
          </div>
        </article>
      `

      addStatRatioBadges('creator_user')
      const group = document.querySelector('#id__low_stat')!
      expect(group.querySelectorAll('.xf-stat-ratio-badge').length).toBe(0)
    })
  })

  describe('帖子详情页', () => {
    beforeEach(() => {
      document.body.innerHTML = ''
    })

    it('识别帖子详情页 URL', () => {
      window.history.pushState({}, '', '/creator_user/status/123456')
      expect(isTargetTweetDetailPage('creator_user')).toBe(true)
      expect(isTargetTweetDetailPage('*')).toBe(true)
      expect(isTargetTweetDetailPage('other_user')).toBe(false)

      window.history.pushState({}, '', '/i/status/123456')
      expect(isTargetTweetDetailPage('*')).toBe(false)

      window.history.pushState({}, '', '/creator_user')
      expect(isTargetTweetDetailPage('*')).toBe(false)
    })

    it('主帖用作者名区域上的粉丝数出徽章，浏览量徽章挂在时间行的「查看」链接上', () => {
      window.history.pushState({}, '', '/creator_user/status/200')
      document.body.innerHTML = `
        <article data-testid="tweet">
          <div data-testid="User-Name" data-xf-screen-name="creator_user" data-xf-followers-count="5422">
            <a href="/creator_user">@creator_user</a>
          </div>
          <div>
            <a href="/creator_user/status/200"><time>下午7:20</time></a>
            <a href="/creator_user/status/200/analytics" class="css-146c3p1" id="views_link">
              <div><span data-testid="app-text-transition-container"><span>10.1万</span></span></div>
              <span>查看</span>
            </a>
          </div>
          <div>
            <div role="group" id="id__main_tweet" aria-label="13 回复、100 次转帖、845 喜欢、1293 书签、101992 次观看">
              <button aria-label="13 回复。回复" data-testid="reply">13</button>
              <button aria-label="845 喜欢次数。喜欢" data-testid="like">845</button>
            </div>
          </div>
        </article>
      `

      addStatRatioBadges('*')

      const likeBtn = document.querySelector('[data-testid="like"]')!
      expect(likeBtn.querySelector('.xf-stat-ratio-badge')).not.toBeNull()

      const viewsLink = document.querySelector('#views_link')!
      const viewsBadge = viewsLink.querySelector('.xf-stat-ratio-badge')
      expect(viewsBadge).not.toBeNull()
      // 浏览量取操作栏说明里的精确值 101992，而不是显示的 10.1万
      expect(viewsBadge!.querySelector('.xf-tt-sub')!.textContent).toContain('101,992')
    })

    it('还没拿到作者粉丝数时不出徽章', () => {
      window.history.pushState({}, '', '/nobody_known/status/200')
      document.body.innerHTML = `
        <article data-testid="tweet">
          <div data-testid="User-Name"><a href="/nobody_known">@nobody_known</a></div>
          <div role="group" id="id__main_tweet">
            <button aria-label="845 喜欢次数。喜欢" data-testid="like">845</button>
          </div>
        </article>
      `

      addStatRatioBadges('*')

      expect(document.querySelectorAll('.xf-stat-ratio-badge').length).toBe(0)
    })
  })

  describe('双徽章共存与底栏防遮挡', () => {
    beforeEach(() => {
      document.body.innerHTML = ''
    })

    it('当已存在速度徽章时，比例徽章插入在速度徽章之前', () => {
      window.history.pushState({}, '', '/creator_user')
      document.body.innerHTML = `
        <a href="/creator_user/followers">10,000 关注者</a>
        <article data-testid="tweet">
          <div data-testid="UserAvatar-Container-creator_user"></div>
          <div data-testid="User-Name"><a href="/creator_user">@creator_user</a></div>
          <div>
            <div role="group" id="id__my_tweet">
              <a href="/creator_user/status/200/analytics" aria-label="242000 次查看">
                <span class="css-146c3p1">
                  <span>242K</span>
                  <span class="x-focus-velocity-badge">🚀 3.4k/h</span>
                </span>
              </a>
            </div>
          </div>
        </article>
      `

      addStatRatioBadges('creator_user')

      const container = document.querySelector('.css-146c3p1')!
      const ratioBadge = container.querySelector('.xf-stat-ratio-badge')!
      const velocityBadge = container.querySelector('.x-focus-velocity-badge')!

      expect(ratioBadge).not.toBeNull()
      expect(velocityBadge).not.toBeNull()
      // 比例徽章必须位于速度徽章之前
      expect(ratioBadge.nextElementSibling).toBe(velocityBadge)
    })

    it('注入的样式包含推文底栏 100% 宽度和书签保护规则', () => {
      window.history.pushState({}, '', '/creator_user')
      document.body.innerHTML = `<a href="/creator_user/followers">1,000 关注者</a>`
      addStatRatioBadges('creator_user')

      const styleEl = document.getElementById('xf-style-statRatioBadges')
      expect(styleEl).not.toBeNull()
      const css = styleEl!.textContent!
      expect(css).toContain('max-width: 100% !important')
      expect(css).toContain('flex: 1 1 auto !important')
      expect(css).toContain('flex-shrink: 0 !important')
    })
  })
})

