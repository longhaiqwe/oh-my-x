import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCurrentUserHandle,
  getTweetAuthorHandle,
  extractTweetIdFromArticle,
  findTweetElementById,
  getRandomLikeDelay,
  AutoLikeReplyManager,
} from '../../content-scripts/features/auto-like-reply'
import { KeyAutoLikeOnReply } from '../../storage-keys'
import { XF_BRIDGE_MARKER, REPLY_POSTED_TYPE } from '../../shared/bridge'

describe('auto-like-reply', () => {
  let storageMock: Record<string, any> = {}

  beforeEach(() => {
    document.body.innerHTML = ''
    storageMock = {
      [KeyAutoLikeOnReply]: 'on',
    }
    AutoLikeReplyManager.getInstance().destroy()

    vi.stubGlobal('browser', {
      runtime: {
        id: 'test-runtime',
        onMessage: { addListener: () => {} },
      },
      storage: {
        local: {
          get: vi.fn(async (keys: any) => {
            if (typeof keys === 'string') {
              return { [keys]: storageMock[keys] }
            }
            if (Array.isArray(keys)) {
              return Object.fromEntries(keys.map((k) => [k, storageMock[k]]))
            }
            return { ...storageMock }
          }),
          set: vi.fn(async (data: any) => {
            Object.assign(storageMock, data)
          }),
        },
      },
    })
  })

  describe('用户信息与推文解析', () => {
    it('getCurrentUserHandle 从侧边栏 Profile 链接解析当前用户', () => {
      document.body.innerHTML = `
        <a data-testid="AppTabBar_Profile_Link" href="/my_handle">Profile</a>
      `
      expect(getCurrentUserHandle()).toBe('my_handle')
    })

    it('getCurrentUserHandle 从账户切换按钮解析当前用户', () => {
      document.body.innerHTML = `
        <div data-testid="SideNav_AccountSwitcher_Button">
          <span>My Name</span>
          <span>@AliceUser</span>
        </div>
      `
      expect(getCurrentUserHandle()).toBe('aliceuser')
    })

    it('getTweetAuthorHandle 从推文 article 中解析作者 handle，排除引用推文', () => {
      const article = document.createElement('article')
      article.setAttribute('data-testid', 'tweet')
      article.innerHTML = `
        <div data-testid="User-Name">
          <a role="link" href="/bob_author">Bob</a>
        </div>
        <div data-testid="quoteTweet">
          <a role="link" href="/quoted_user">Quoted User</a>
        </div>
      `
      expect(getTweetAuthorHandle(article)).toBe('bob_author')
    })

    it('extractTweetIdFromArticle 提取推文 ID，排除引用推文链接', () => {
      const article = document.createElement('article')
      article.setAttribute('data-testid', 'tweet')
      article.innerHTML = `
        <a href="/bob_author/status/1841234567890">
          <time datetime="2026-10-07T00:00:00.000Z">Oct 7</time>
        </a>
        <div data-testid="quoteTweet">
          <a href="/quoted/status/9999999999999">Quoted</a>
        </div>
      `
      expect(extractTweetIdFromArticle(article)).toBe('1841234567890')
    })

    it('findTweetElementById 正确在页面中定位指定 ID 的推文', () => {
      document.body.innerHTML = `
        <article data-testid="tweet">
          <a href="/user1/status/1111111111">Time 1</a>
        </article>
        <article data-testid="tweet">
          <a href="/user2/status/2222222222">Time 2</a>
        </article>
      `
      const el = findTweetElementById('2222222222')
      expect(el).not.toBeNull()
      expect(extractTweetIdFromArticle(el!)).toBe('2222222222')
    })
  })

  describe('AutoLikeReplyManager 自动点赞逻辑', () => {
    it('对未点赞的推文自动触发 click 点赞', async () => {
      const article = document.createElement('article')
      article.setAttribute('data-testid', 'tweet')
      article.innerHTML = `
        <a href="/other_user/status/12345">Link</a>
        <div role="group">
          <button data-testid="like" aria-label="Like"></button>
        </div>
      `
      document.body.appendChild(article)

      const likeBtn = article.querySelector<HTMLButtonElement>('button[data-testid="like"]')!
      const clickSpy = vi.spyOn(likeBtn, 'click')

      const manager = AutoLikeReplyManager.getInstance()
      const result = await manager.autoLike('12345', article, 'other_user')

      expect(result).toBe(true)
      expect(clickSpy).toHaveBeenCalledTimes(1)
    })

    it('如果推文已经处于已赞状态，不重复点击（避免取消点赞）', async () => {
      const article = document.createElement('article')
      article.setAttribute('data-testid', 'tweet')
      article.innerHTML = `
        <a href="/other_user/status/12345">Link</a>
        <div role="group">
          <button data-testid="unlike" aria-label="Liked"></button>
        </div>
      `
      document.body.appendChild(article)

      const unlikeBtn = article.querySelector<HTMLButtonElement>('button[data-testid="unlike"]')!
      const clickSpy = vi.spyOn(unlikeBtn, 'click')

      const manager = AutoLikeReplyManager.getInstance()
      const result = await manager.autoLike('12345', article, 'other_user')

      expect(result).toBe(true)
      expect(clickSpy).not.toHaveBeenCalled()
    })

    it('回复自己的推文时（Thread 串楼）跳过自动点赞', async () => {
      // 模拟当前登录用户是 my_self
      document.body.innerHTML = `
        <a data-testid="AppTabBar_Profile_Link" href="/my_self">Profile</a>
      `

      const article = document.createElement('article')
      article.setAttribute('data-testid', 'tweet')
      article.innerHTML = `
        <a href="/my_self/status/12345">Link</a>
        <div role="group">
          <button data-testid="like" aria-label="Like"></button>
        </div>
      `
      document.body.appendChild(article)

      const likeBtn = article.querySelector<HTMLButtonElement>('button[data-testid="like"]')!
      const clickSpy = vi.spyOn(likeBtn, 'click')

      const manager = AutoLikeReplyManager.getInstance()
      const result = await manager.autoLike('12345', article, 'my_self')

      expect(result).toBe(false)
      expect(clickSpy).not.toHaveBeenCalled()
    })

    it('当配置设置为 off 时，不执行自动点赞', async () => {
      storageMock[KeyAutoLikeOnReply] = 'off'

      const article = document.createElement('article')
      article.setAttribute('data-testid', 'tweet')
      article.innerHTML = `
        <a href="/other_user/status/12345">Link</a>
        <div role="group">
          <button data-testid="like" aria-label="Like"></button>
        </div>
      `
      document.body.appendChild(article)

      const likeBtn = article.querySelector<HTMLButtonElement>('button[data-testid="like"]')!
      const clickSpy = vi.spyOn(likeBtn, 'click')

      const manager = AutoLikeReplyManager.getInstance()
      const result = await manager.autoLike('12345', article, 'other_user')

      expect(result).toBe(false)
      expect(clickSpy).not.toHaveBeenCalled()
    })
  })

  describe('getRandomLikeDelay 拟人化随机延迟', () => {
    it('生成的随机延迟在指定的 [minMs, maxMs] 区间内', () => {
      for (let i = 0; i < 50; i++) {
        const delay = getRandomLikeDelay(300, 2000)
        expect(delay).toBeGreaterThanOrEqual(300)
        expect(delay).toBeLessThanOrEqual(2000)
      }
    })
  })

  describe('交互事件与广播监听集成', () => {
    let manager: AutoLikeReplyManager

    beforeEach(() => {
      manager = AutoLikeReplyManager.getInstance()
      manager.destroy()
      manager.setDelayRange([0, 0])
      manager.init()
    })

    it('点击评论的回复按钮时记录 pendingTarget', () => {
      const article = document.createElement('article')
      article.setAttribute('data-testid', 'tweet')
      article.innerHTML = `
        <a role="link" href="/target_user">Target</a>
        <a href="/target_user/status/888888">Time</a>
        <div role="group">
          <button data-testid="reply">Reply</button>
        </div>
      `
      document.body.appendChild(article)

      const replyBtn = article.querySelector<HTMLButtonElement>('button[data-testid="reply"]')!
      replyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      const target = manager.getPendingTarget()
      expect(target).not.toBeNull()
      expect(target?.tweetId).toBe('888888')
      expect(target?.authorHandle).toBe('target_user')
    })

    it('点击发送回复按钮时触发自动点赞', async () => {
      const article = document.createElement('article')
      article.setAttribute('data-testid', 'tweet')
      article.innerHTML = `
        <a role="link" href="/target_user">Target</a>
        <a href="/target_user/status/888888">Time</a>
        <div role="group">
          <button data-testid="like">Like</button>
        </div>
      `
      document.body.appendChild(article)

      const likeBtn = article.querySelector<HTMLButtonElement>('button[data-testid="like"]')!
      const clickSpy = vi.spyOn(likeBtn, 'click')

      manager.setPendingTarget({
        element: article,
        tweetId: '888888',
        authorHandle: 'target_user',
        timestamp: Date.now(),
      })

      const submitBtn = document.createElement('button')
      submitBtn.setAttribute('data-testid', 'tweetButton')
      document.body.appendChild(submitBtn)

      submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 20))

      expect(clickSpy).toHaveBeenCalledTimes(1)
    })

    it('按下 Cmd+Enter 发送回复时触发自动点赞', async () => {
      const article = document.createElement('article')
      article.setAttribute('data-testid', 'tweet')
      article.innerHTML = `
        <a role="link" href="/target_user">Target</a>
        <a href="/target_user/status/888888">Time</a>
        <div role="group">
          <button data-testid="like">Like</button>
        </div>
      `
      document.body.appendChild(article)

      const likeBtn = article.querySelector<HTMLButtonElement>('button[data-testid="like"]')!
      const clickSpy = vi.spyOn(likeBtn, 'click')

      manager.setPendingTarget({
        element: article,
        tweetId: '888888',
        authorHandle: 'target_user',
        timestamp: Date.now(),
      })

      const textarea = document.createElement('div')
      textarea.setAttribute('data-testid', 'tweetTextarea_0')
      textarea.setAttribute('contenteditable', 'true')
      document.body.appendChild(textarea)
      textarea.focus()

      textarea.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          metaKey: true,
          bubbles: true,
        })
      )
      await new Promise((r) => setTimeout(r, 20))

      expect(clickSpy).toHaveBeenCalledTimes(1)
    })

    it('接收到 REPLY_POSTED_TYPE 消息时通过 ID 自动寻址点赞', async () => {
      const article = document.createElement('article')
      article.setAttribute('data-testid', 'tweet')
      article.innerHTML = `
        <a role="link" href="/target_user">Target</a>
        <a href="/target_user/status/777777">Time</a>
        <div role="group">
          <button data-testid="like">Like</button>
        </div>
      `
      document.body.appendChild(article)

      const likeBtn = article.querySelector<HTMLButtonElement>('button[data-testid="like"]')!
      const clickSpy = vi.spyOn(likeBtn, 'click')

      window.dispatchEvent(
        new MessageEvent('message', {
          source: window,
          data: {
            __xf: XF_BRIDGE_MARKER,
            type: REPLY_POSTED_TYPE,
            payload: { inReplyToTweetId: '777777' },
          },
        })
      )
      await new Promise((r) => setTimeout(r, 20))

      expect(clickSpy).toHaveBeenCalledTimes(1)
    })

    it('过期的 pendingTarget (大于 60 秒) 不会被错误使用', async () => {
      const article = document.createElement('article')
      article.setAttribute('data-testid', 'tweet')
      article.innerHTML = `
        <a role="link" href="/old_user">Target</a>
        <a href="/old_user/status/999999">Time</a>
        <div role="group">
          <button data-testid="like">Like</button>
        </div>
      `
      document.body.appendChild(article)

      const likeBtn = article.querySelector<HTMLButtonElement>('button[data-testid="like"]')!
      const clickSpy = vi.spyOn(likeBtn, 'click')

      // 设置 70 秒前的 pendingTarget
      manager.setPendingTarget({
        element: article,
        tweetId: '999999',
        authorHandle: 'old_user',
        timestamp: Date.now() - 70000,
      })

      const submitBtn = document.createElement('button')
      submitBtn.setAttribute('data-testid', 'tweetButton')
      document.body.appendChild(submitBtn)

      submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await new Promise((r) => setTimeout(r, 20))

      // 因为已过期且无其他推文上下文，不应点击旧推文
      expect(clickSpy).not.toHaveBeenCalled()
    })

    it('在弹窗打开时提交回复，等待弹窗关闭后才触发点赞', async () => {
      // 背景中的原推文
      const timelineArticle = document.createElement('article')
      timelineArticle.setAttribute('data-testid', 'tweet')
      timelineArticle.innerHTML = `
        <a role="link" href="/timeline_user">User</a>
        <a href="/timeline_user/status/555555">Time</a>
        <div role="group">
          <button data-testid="like">Like</button>
        </div>
      `
      document.body.appendChild(timelineArticle)

      const likeBtn = timelineArticle.querySelector<HTMLButtonElement>('button[data-testid="like"]')!
      const clickSpy = vi.spyOn(likeBtn, 'click')

      // 前台弹窗
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      const submitBtn = document.createElement('button')
      submitBtn.setAttribute('data-testid', 'tweetButton')
      dialog.appendChild(submitBtn)
      document.body.appendChild(dialog)

      manager.setPendingTarget({
        element: timelineArticle,
        tweetId: '555555',
        authorHandle: 'timeline_user',
        timestamp: Date.now(),
      })

      submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))

      // 弹窗仍在 DOM 中时，尚未点击
      await new Promise((r) => setTimeout(r, 10))
      expect(clickSpy).not.toHaveBeenCalled()

      // 模拟 X 发送完毕后移除弹窗
      dialog.remove()
      await new Promise((r) => setTimeout(r, 30))

      expect(clickSpy).toHaveBeenCalledTimes(1)
    })
  })
})
