import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'
import {
  updateUserFollowerBadges,
  userMetricsMemory,
  FOLLOWER_BADGE_CLASS,
} from '../../content-scripts/features/user-followers'

describe('user-followers 模块 DOM 徽章渲染测试', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM(
      `<!DOCTYPE html><html><head></head><body>
        <!-- 用户列表项：如 /following 页面 -->
        <div data-testid="UserCell" id="user-cell-1">
          <div>
            <a href="/elonmusk" role="link"><span>Elon Musk</span></a>
            <a href="/elonmusk" tabindex="-1"><span>@elonmusk</span></a>
            <div data-testid="userFollowIndicator"><span>关注了你</span></div>
            <button data-testid="44196397-unfollow">正在关注</button>
          </div>
        </div>

        <div data-testid="UserCell" id="user-cell-2" data-xf-followers-count="8500" data-xf-following-count="120" data-xf-screen-name="bob">
          <div>
            <a href="/bob" role="link"><span>Bob</span></a>
            <a href="/bob" tabindex="-1"><span>@bob</span></a>
          </div>
        </div>

        <!-- 推荐关注列表项（带有社交证明 socialContext，如“某某及另外 4 人关注”） -->
        <div data-testid="UserCell" id="user-cell-recommend">
          <div data-testid="socialContext" id="recommend-social-context">
            <svg></svg>
            <a href="/guangzhui"><span>光锥·τ</span></a> 及另外 4 人关注
          </div>
          <div>
            <div id="recommend-avatar-col">
              <a href="/fuguizhuo"><img alt="avatar" /></a>
            </div>
            <div id="recommend-info-col">
              <div>
                <div id="recommend-names-col">
                  <div id="recommend-name-row">
                    <a href="/fuguizhuo" role="link"><span dir="ltr">独立开花卓富贵</span></a>
                    <span data-testid="icon-verified">✓</span>
                  </div>
                  <div id="recommend-handle-row">
                    <a href="/fuguizhuo" tabindex="-1"><span dir="ltr">@fuguizhuo</span></a>
                  </div>
                </div>
                <button data-testid="999-follow">关注</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 包含 RNW 嵌套结构的推荐卡片（验证不会挂载在纵向 wrapper 导致折行） -->
        <div data-testid="UserCell" id="user-cell-rnw">
          <div class="css-175oi2r" id="rnw-names-col">
            <div class="css-175oi2r" id="rnw-line1-wrapper">
              <div class="css-175oi2r r-18u37iz" id="rnw-line1-row">
                <a href="/geekbb" role="link" id="rnw-name-link"><span dir="ltr">Geek</span></a>
                <svg data-testid="icon-verified"></svg>
              </div>
            </div>
            <div class="css-175oi2r" id="rnw-line2-row">
              <a href="/geekbb" tabindex="-1"><span dir="ltr">@geekbb</span></a>
            </div>
          </div>
        </div>

        <!-- 包含无 data-testid 的社交证明头部的推荐关注卡片（如“纸予 及另外 9 人关注”） -->
        <div data-testid="UserCell" id="user-cell-mooeny">
          <div class="css-175oi2r r-18u37iz" id="mooeny-social-header">
            <svg></svg>
            <a href="/zhiyu"><span dir="ltr">纸予</span></a> 及另外 9 人关注
          </div>
          <div class="user-content">
            <a href="/MooenyChu" role="link" id="mooeny-link">
              <div class="css-175oi2r r-18u37iz" id="mooeny-name-row">
                <div dir="ltr" class="css-146c3p1"><span>穆尼</span></div>
                <div dir="ltr"><svg data-testid="icon-verified"></svg></div>
              </div>
            </a>
            <div id="mooeny-handle-row">
              <a href="/MooenyChu"><span dir="ltr">@MooenyChu</span></a>
            </div>
          </div>
        </div>

        <!-- 时间线推文 -->
        <article data-testid="tweet" id="tweet-1">
          <div data-testid="User-Name">
            <div><a href="/sama"><span>Sam Altman</span></a></div>
            <div><a href="/sama"><span>@sama</span></a></div>
            <div><span>·</span></div>
            <time>1小时</time>
          </div>
        </article>

        <!-- 文章页面 / 详情页推文（无 time 元素，两行布局） -->
        <article data-testid="tweet" id="article-tweet-1">
          <div data-testid="User-Name">
            <div id="article-name-row">
              <a href="/longhaiqwe123"><span dir="ltr">龙海</span></a>
              <span data-testid="icon-verified">✓</span>
            </div>
            <div id="article-handle-row">
              <a href="/longhaiqwe123"><span dir="ltr">@longhaiqwe123</span></a>
            </div>
          </div>
        </article>
      </body></html>`,
      { url: 'https://x.com/home' },
    )
    globalThis.document = dom.window.document
    // @ts-expect-error jsdom window
    globalThis.window = dom.window
    // 清空并注入测试数据
    for (const k of Object.keys(userMetricsMemory)) {
      delete userMetricsMemory[k]
    }
    userMetricsMemory['elonmusk'] = {
      screenName: 'elonmusk',
      followersCount: 195000000,
      followingCount: 750,
      restId: '44196397',
    }
    userMetricsMemory['sama'] = {
      screenName: 'sama',
      followersCount: 3200000,
      followingCount: 500,
    }
    userMetricsMemory['longhaiqwe123'] = {
      screenName: 'longhaiqwe123',
      followersCount: 4020,
      followingCount: 180,
    }
    userMetricsMemory['guangzhui'] = {
      screenName: 'guangzhui',
      followersCount: 8888,
      followingCount: 100,
    }
    userMetricsMemory['fuguizhuo'] = {
      screenName: 'fuguizhuo',
      followersCount: 15600,
      followingCount: 300,
    }
    userMetricsMemory['geekbb'] = {
      screenName: 'geekbb',
      followersCount: 116000,
      followingCount: 200,
    }
    userMetricsMemory['mooenychu'] = {
      screenName: 'MooenyChu',
      followersCount: 35200,
      followingCount: 150,
    }
  })

  afterEach(() => {
    if (dom) dom.window.close()
  })

  it('mode="all" 时，在 UserCell 和 Tweet Header 同时注入粉丝徽章', async () => {
    await updateUserFollowerBadges('all')

    // 检查 user-cell-1（通过缓存匹配）
    const cell1Badge = document.querySelector('#user-cell-1 .' + FOLLOWER_BADGE_CLASS)
    expect(cell1Badge).not.toBeNull()
    expect(cell1Badge?.textContent).toContain('1.95亿 粉丝')
    expect(cell1Badge?.getAttribute('title')).toBe('粉丝: 195,000,000 · 关注: 750')

    // 检查 user-cell-2（通过 DOM 上的 data-xf-followers-count 提取）
    const cell2Badge = document.querySelector('#user-cell-2 .' + FOLLOWER_BADGE_CLASS)
    expect(cell2Badge).not.toBeNull()
    expect(cell2Badge?.textContent).toContain('8500 粉丝')
    expect(cell2Badge?.getAttribute('title')).toBe('粉丝: 8,500 · 关注: 120')

    // 检查 user-cell-recommend（带 socialContext 的推荐卡片）
    const recommendBadge = document.querySelector('#user-cell-recommend .' + FOLLOWER_BADGE_CLASS)
    expect(recommendBadge).not.toBeNull()
    expect(recommendBadge?.textContent).toContain('1.56万 粉丝')
    expect(recommendBadge?.getAttribute('title')).toBe('粉丝: 15,600 · 关注: 300')
    // 关键断言：徽章必须挂载在第一行昵称容器 (#recommend-name-row) 内，绝不在社交证明或 handle 容器内！
    expect(document.querySelector('#recommend-name-row .' + FOLLOWER_BADGE_CLASS)).not.toBeNull()
    expect(document.querySelector('#recommend-social-context .' + FOLLOWER_BADGE_CLASS)).toBeNull()
    expect(document.querySelector('#recommend-handle-row .' + FOLLOWER_BADGE_CLASS)).toBeNull()

    // 检查 user-cell-rnw（包含 RNW 嵌套结构的推荐卡片）
    const rnwBadge = document.querySelector('#user-cell-rnw .' + FOLLOWER_BADGE_CLASS)
    expect(rnwBadge).not.toBeNull()
    expect(rnwBadge?.textContent).toContain('11.6万 粉丝')
    // 关键断言：徽章挂载在第一行横向行内 (#rnw-line1-row)，绝不挂在纵向外层 wrapper (#rnw-line1-wrapper) 造成折行！
    expect(document.querySelector('#rnw-line1-row .' + FOLLOWER_BADGE_CLASS)).not.toBeNull()
    expect(document.querySelector('#rnw-line1-wrapper > .' + FOLLOWER_BADGE_CLASS)).toBeNull()
    expect(document.querySelector('#rnw-line2-row .' + FOLLOWER_BADGE_CLASS)).toBeNull()

    // 检查 user-cell-mooeny（带有类似“纸予 及另外 9 人关注”无 data-testid 的推荐卡片）
    const mooenyBadge = document.querySelector('#user-cell-mooeny .' + FOLLOWER_BADGE_CLASS)
    expect(mooenyBadge).not.toBeNull()
    expect(mooenyBadge?.textContent).toContain('3.52万 粉丝')
    // 关键断言：徽章必须挂载在第一行昵称容器 (#mooeny-name-row) 内，绝不在社交证明头部 (#mooeny-social-header)！
    expect(document.querySelector('#mooeny-name-row .' + FOLLOWER_BADGE_CLASS)).not.toBeNull()
    expect(document.querySelector('#mooeny-social-header .' + FOLLOWER_BADGE_CLASS)).toBeNull()
    expect(document.querySelector('#mooeny-handle-row .' + FOLLOWER_BADGE_CLASS)).toBeNull()

    // 检查 tweet-1（单行时间线推文）
    const tweetBadge = document.querySelector('#tweet-1 .' + FOLLOWER_BADGE_CLASS)
    expect(tweetBadge).not.toBeNull()
    expect(tweetBadge?.textContent).toContain('320万 粉丝')
    expect(tweetBadge?.getAttribute('title')).toBe('粉丝: 3,200,000 · 关注: 500')

    // 检查 article-tweet-1（文章页 / 详情页两行布局）
    const articleBadge = document.querySelector('#article-tweet-1 .' + FOLLOWER_BADGE_CLASS)
    expect(articleBadge).not.toBeNull()
    expect(articleBadge?.textContent).toContain('4020 粉丝')
    // 关键断言：徽章挂载在第一行昵称容器 (#article-name-row) 内，而不是第二行或第三行！
    expect(document.querySelector('#article-name-row .' + FOLLOWER_BADGE_CLASS)).not.toBeNull()
    expect(document.querySelector('#article-handle-row .' + FOLLOWER_BADGE_CLASS)).toBeNull()
  })

  it('若历史渲染已误挂在 socialContext 中，再次更新时自动迁移至昵称行', async () => {
    // 模拟旧版本错误插入在 socialContext 内的旧徽章
    const socialContext = document.querySelector('#recommend-social-context')!
    const bogusBadge = document.createElement('span')
    bogusBadge.className = FOLLOWER_BADGE_CLASS
    bogusBadge.textContent = '旧徽章'
    socialContext.appendChild(bogusBadge)
    expect(socialContext.querySelector('.' + FOLLOWER_BADGE_CLASS)).not.toBeNull()

    // 模拟旧版本错误插入在无 testid 的社交证明头部内的旧徽章
    const mooenySocial = document.querySelector('#mooeny-social-header')!
    const bogusMooeny = document.createElement('span')
    bogusMooeny.className = FOLLOWER_BADGE_CLASS
    bogusMooeny.textContent = '旧徽章2'
    mooenySocial.appendChild(bogusMooeny)
    expect(mooenySocial.querySelector('.' + FOLLOWER_BADGE_CLASS)).not.toBeNull()

    await updateUserFollowerBadges('all')

    // 验证旧徽章已被移出社交证明，且正确挂载在昵称行
    expect(document.querySelector('#recommend-social-context .' + FOLLOWER_BADGE_CLASS)).toBeNull()
    expect(document.querySelector('#recommend-name-row .' + FOLLOWER_BADGE_CLASS)).not.toBeNull()
    expect(document.querySelector('#recommend-name-row .' + FOLLOWER_BADGE_CLASS)?.textContent).toContain('1.56万 粉丝')

    expect(document.querySelector('#mooeny-social-header .' + FOLLOWER_BADGE_CLASS)).toBeNull()
    expect(document.querySelector('#mooeny-name-row .' + FOLLOWER_BADGE_CLASS)).not.toBeNull()
    expect(document.querySelector('#mooeny-name-row .' + FOLLOWER_BADGE_CLASS)?.textContent).toContain('3.52万 粉丝')
  })

  it('mode="list" 时，只在 UserCell 注入，清除推文中的徽章', async () => {
    // 先全量注入
    await updateUserFollowerBadges('all')
    expect(document.querySelector('#tweet-1 .' + FOLLOWER_BADGE_CLASS)).not.toBeNull()
    expect(document.querySelector('#article-tweet-1 .' + FOLLOWER_BADGE_CLASS)).not.toBeNull()

    // 切换到仅列表模式
    await updateUserFollowerBadges('list')
    expect(document.querySelector('#user-cell-1 .' + FOLLOWER_BADGE_CLASS)).not.toBeNull()
    expect(document.querySelector('#user-cell-recommend .' + FOLLOWER_BADGE_CLASS)).not.toBeNull()
    expect(document.querySelector('#user-cell-rnw .' + FOLLOWER_BADGE_CLASS)).not.toBeNull()
    expect(document.querySelector('#user-cell-mooeny .' + FOLLOWER_BADGE_CLASS)).not.toBeNull()
    expect(document.querySelector('#tweet-1 .' + FOLLOWER_BADGE_CLASS)).toBeNull()
    expect(document.querySelector('#article-tweet-1 .' + FOLLOWER_BADGE_CLASS)).toBeNull()
  })

  it('mode="off" 时，清除所有已存在的徽章', async () => {
    await updateUserFollowerBadges('all')
    expect(document.querySelectorAll('.' + FOLLOWER_BADGE_CLASS).length).toBe(7)

    await updateUserFollowerBadges('off')
    expect(document.querySelectorAll('.' + FOLLOWER_BADGE_CLASS).length).toBe(0)
  })

  it('多次执行具有幂等性，不重复插入多个徽章节点', async () => {
    await updateUserFollowerBadges('all')
    await updateUserFollowerBadges('all')
    await updateUserFollowerBadges('all')

    const cell1Badges = document.querySelectorAll('#user-cell-1 .' + FOLLOWER_BADGE_CLASS)
    expect(cell1Badges.length).toBe(1)

    const recommendBadges = document.querySelectorAll('#user-cell-recommend .' + FOLLOWER_BADGE_CLASS)
    expect(recommendBadges.length).toBe(1)

    const rnwBadges = document.querySelectorAll('#user-cell-rnw .' + FOLLOWER_BADGE_CLASS)
    expect(rnwBadges.length).toBe(1)

    const mooenyBadges = document.querySelectorAll('#user-cell-mooeny .' + FOLLOWER_BADGE_CLASS)
    expect(mooenyBadges.length).toBe(1)

    const tweetBadges = document.querySelectorAll('#tweet-1 .' + FOLLOWER_BADGE_CLASS)
    expect(tweetBadges.length).toBe(1)

    const articleBadges = document.querySelectorAll('#article-tweet-1 .' + FOLLOWER_BADGE_CLASS)
    expect(articleBadges.length).toBe(1)
  })
})
