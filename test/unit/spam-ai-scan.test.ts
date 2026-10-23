import { t } from '../../shared/i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  KeySpamAiAutoScope,
  KeySpamAiBotAccounts,
  KeySpamAiEnabled,
  KeySpamAiThreshold,
  KeySpamBlacklist,
  KeySpamDebugMode,
  KeySpamFilterEnabled,
  KeySpamKeywordList,
  KeySpamRulesEnabled,
  KeySpamThreshold,
  KeySpamWhitelist,
} from '../../storage-keys'

const fakeScorer = vi.hoisted(() => ({
  request: vi.fn(),
  version: vi.fn(() => 0),
  onChange: vi.fn((_listener: () => void) => () => {}),
  reset: vi.fn(),
  stop: vi.fn(),
  peek: vi.fn((_id: string) => 'none'),
  status: vi.fn(() => ({ paused: null as any, busy: false })),
  manual: vi.fn((_entries: unknown[]) => 1),
  label: vi.fn((_id: string): 'bot' | 'human' | undefined => undefined),
  setLabel: vi.fn(),
}))
vi.mock('../../content-scripts/spam/ai-scorer', () => ({ aiScorer: fakeScorer }))

const { invalidateSpamConfig, runScan, startSpamObserver, stopSpamObserver } = await import('../../content-scripts/spam/scanner')

function mockConfig({ debug = true, ai = true, scope = 'own', aiThreshold = 70, botAccounts = [] as string[] } = {}) {
  ;(globalThis as any).browser.runtime.id = 'test-runtime'
  ;(globalThis as any).browser.storage.local.get = async () => ({
    [KeySpamFilterEnabled]: 'on',
    [KeySpamThreshold]: 30,
    [KeySpamDebugMode]: debug ? 'on' : 'off',
    [KeySpamKeywordList]: '点击主页',
    [KeySpamRulesEnabled]:
      'marketing_nickname:off,emoji_ratio:off,short_text:off,random_username:off,marketing_keyword:on,pure_emoji:off,decorated_nickname:off,repeated_chars:off,mention_referral:off',
    [KeySpamWhitelist]: '',
    [KeySpamBlacklist]: '',
    [KeySpamAiEnabled]: ai ? 'on' : 'off',
    [KeySpamAiAutoScope]: scope,
    [KeySpamAiThreshold]: aiThreshold,
    [KeySpamAiBotAccounts]: botAccounts,
  })
  invalidateSpamConfig()
}

// 带操作栏的回复（分数标签放在操作栏里）
const actions = '<div role="group"><button data-testid="reply"></button><button data-testid="like"></button></div>'
// 帖子页顶部的「← 帖子」标题栏
const header = '<div data-testid="primaryColumn"><div id="header-row"><div><button data-testid="app-bar-back"></button></div><div>帖子</div><div></div></div></div>'
const tag = (id: string) => document.querySelector<HTMLElement>(`#t${id} [data-xf-ai-tag]`)
const pill = () => document.querySelector<HTMLButtonElement>('[data-xf-ai-pill]')
const done = (score: number) => ({ status: 'done', score, signals: ['S2', 'S11'], reason: '复述原帖' })

function tweet(id: string, handle: string, text: string, time: string, extra = '') {
  return `
    <article data-testid="tweet" id="t${id}">
      <a href="/${handle}" role="link">@${handle}</a>
      <div data-testid="User-Name">${handle}</div>
      <a href="/${handle}/status/${id}"><time datetime="${time}"></time></a>
      <div data-testid="tweetText">${text}</div>
      ${extra}
    </article>`
}

const own = (handle: string) => `<a data-testid="AppTabBar_Profile_Link" href="/${handle}">Profile</a>`
/** 拦截脚本写在推文上的被回复推文；of 默认是这条推文自己的 ID */
function replyTo(id: string, target: string, user: string, of = id) {
  const el = document.querySelector(`#t${id}`)!
  el.setAttribute('data-xf-reply-of', of)
  el.setAttribute('data-xf-reply-to', target)
  el.setAttribute('data-xf-reply-to-user', user)
}
/** 拦截脚本写在推文上的对话 ID */
function conversation(id: string, conversationId: string) {
  const el = document.querySelector(`#t${id}`)!
  el.setAttribute('data-xf-reply-of', id)
  el.setAttribute('data-xf-conversation', conversationId)
}
const bar = (id: string) => document.querySelector(`#t${id} #x-focus-spam-debug-bar`)

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  fakeScorer.request.mockReset()
  fakeScorer.request.mockReturnValue({ status: 'done', score: 82, signals: ['S1', 'S6'], reason: '换个帖子也成立' })
  fakeScorer.stop.mockClear()
  fakeScorer.peek.mockReset()
  fakeScorer.peek.mockReturnValue('none')
  fakeScorer.status.mockReset()
  fakeScorer.status.mockReturnValue({ paused: null, busy: false })
  fakeScorer.manual.mockClear()
  fakeScorer.label.mockReset()
  fakeScorer.label.mockReturnValue(undefined)
  fakeScorer.setLabel.mockReset()
  fakeScorer.version.mockReturnValue(0)
  ;(globalThis as any).browser.runtime.sendMessage = vi.fn(() => Promise.resolve())
})

afterEach(() => {
  window.history.pushState({}, '', '/')
  document.body.innerHTML = ''
  ;(globalThis as any).browser.storage.local.get = async () => ({})
  delete (globalThis as any).browser.runtime.id
  delete (globalThis as any).browser.runtime.sendMessage
  invalidateSpamConfig()
})

describe('主帖滚出页面后', () => {
  it('按记住的主帖 ID 认主帖，页面上第一条回复照常评分，已隐藏的垃圾回复不会被放出来', async () => {
    window.history.pushState({}, '', '/alice/status/1001')
    mockConfig({ debug: false, ai: false })
    document.body.innerHTML =
      tweet('1001', 'alice', '主帖', '2026-10-20T08:00:00.000Z') +
      `<div data-testid="inline_reply_offscreen"></div>` +
      tweet('1002', 'spammer', '点击主页领取福利', '2026-10-20T08:01:00.000Z') +
      tweet('1003', 'bob', '说得对', '2026-10-20T08:02:00.000Z')
    await runScan(true)
    expect(document.querySelector<HTMLElement>('#t1002')!.getAttribute('data-xf-spam-state')).toBe('hidden')

    // 往下翻：X 把主帖和行内回复框移出页面，垃圾回复成了页面上的第一条
    document.querySelector('#t1001')!.remove()
    document.querySelector('[data-testid="inline_reply_offscreen"]')!.remove()
    await runScan(true)
    expect(document.querySelector<HTMLElement>('#t1002')!.getAttribute('data-xf-spam-state')).toBe('hidden')
    expect(document.querySelector<HTMLElement>('#t1002')!.style.display).toBe('none')
  })

  it('没见过主帖时沿用原来的做法：第一条当主帖', async () => {
    window.history.pushState({}, '', '/alice/status/2001')
    mockConfig({ debug: true, ai: false })
    document.body.innerHTML =
      tweet('2002', 'bob', '第一条', '2026-10-20T08:01:00.000Z') +
      tweet('2003', 'carl', '第二条', '2026-10-20T08:02:00.000Z')
    await runScan(true)
    expect(bar('2002')).toBeNull()
    expect(bar('2003')).not.toBeNull()
  })
})

describe('AI 判断（调试模式）', () => {
  it('调试条显示 AI 分数和信号名；送出的内容带主帖上下文和回复间隔，自己帖子下自动判断', async () => {
    window.history.pushState({}, '', '/alice/status/3001')
    mockConfig()
    document.body.innerHTML =
      own('alice') +
      tweet('3001', 'alice', '上线第三天，转化率从 11% 涨到 19%', '2026-10-20T08:00:00.000Z') +
      tweet('3002', 'bob', '太有启发了！你怎么看？', '2026-10-20T08:01:00.000Z')
    await runScan(true)
    expect(fakeScorer.request).toHaveBeenCalledWith(
      { id: '3002', author: 'bob', text: '太有启发了！你怎么看？', delaySeconds: 60, followers: null, verified: false },
      { id: '3001', author: 'alice', text: '上线第三天，转化率从 11% 涨到 19%' },
      true,
    )
    const row = bar('3002')!.querySelector('[data-xf-ai-row]')!
    expect(row.textContent).toBe('AI 82 · 万能回复、结尾提问 · 换个帖子也成立')
    expect(bar('3001')).toBeNull()
  })

  it('送出作者的粉丝数和蓝 V', async () => {
    window.history.pushState({}, '', '/alice/status/9001')
    mockConfig()
    document.body.innerHTML =
      own('alice') +
      tweet('9001', 'alice', '主帖', '2026-10-20T08:00:00.000Z') +
      `<article data-testid="tweet" id="t9002">
        <a href="/bob" role="link">@bob</a>
        <div data-testid="User-Name" data-xf-screen-name="bob" data-xf-followers-count="64">bob<svg data-testid="icon-verified"></svg></div>
        <a href="/bob/status/9002"><time datetime="2026-10-20T08:01:00.000Z"></time></a>
        <div data-testid="tweetText">这套很实用</div>
      </article>`
    await runScan(true)
    expect(fakeScorer.request.mock.calls[0][0]).toMatchObject({ id: '9002', followers: 64, verified: true })
  })

  it('主帖滚出页面后仍用记住的主帖正文；别人的帖子在「只我的帖子」范围外', async () => {
    window.history.pushState({}, '', '/alice/status/4001')
    mockConfig()
    document.body.innerHTML =
      own('me') +
      tweet('4001', 'alice', '主帖正文', '2026-10-20T08:00:00.000Z') +
      tweet('4002', 'bob', '回复一', '2026-10-20T08:00:30.000Z')
    await runScan(true)
    document.querySelector('#t4001')!.remove()
    fakeScorer.request.mockClear()
    await runScan(true)
    expect(fakeScorer.request).toHaveBeenCalledWith(
      expect.objectContaining({ id: '4002', delaySeconds: 30 }),
      { id: '4001', author: 'alice', text: '主帖正文' },
      false,
    )
  })

  it('范围设成「所有对话」时别人的帖子也自动判断', async () => {
    window.history.pushState({}, '', '/alice/status/5001')
    mockConfig({ scope: 'all' })
    document.body.innerHTML = own('me') + tweet('5001', 'alice', '主帖', '2026-10-20T08:00:00.000Z') + tweet('5002', 'bob', '回复', '2026-10-20T08:01:00.000Z')
    await runScan(true)
    expect(fakeScorer.request.mock.calls[0][2]).toBe(true)
  })

  it('规则已经会隐藏的、自己的回复、纯图片回复不送模型', async () => {
    window.history.pushState({}, '', '/alice/status/6001')
    mockConfig()
    document.body.innerHTML =
      own('alice') +
      tweet('6001', 'alice', '主帖', '2026-10-20T08:00:00.000Z') +
      tweet('6002', 'spammer', '点击主页领取福利', '2026-10-20T08:01:00.000Z') +
      tweet('6003', 'alice', '我自己补充一句', '2026-10-20T08:02:00.000Z') +
      tweet('6004', 'bob', '', '2026-10-20T08:03:00.000Z')
    await runScan(true)
    expect(fakeScorer.request).not.toHaveBeenCalled()
    expect(bar('6002')!.querySelector('[data-xf-ai-row]')).toBeNull()
  })

  it('别人的帖子下，主帖作者自己的回复不送模型，其他人的回复照常送', async () => {
    window.history.pushState({}, '', '/alice/status/6101')
    mockConfig({ scope: 'all' })
    document.body.innerHTML =
      own('me') +
      tweet('6101', 'alice', '主帖', '2026-10-20T08:00:00.000Z') +
      tweet('6102', 'bob', '好爸爸', '2026-10-20T08:01:00.000Z') +
      tweet('6103', 'Alice', '之前教孩子买个股，现在老大 9 岁', '2026-10-20T08:02:00.000Z')
    await runScan(true)
    expect(fakeScorer.request.mock.calls.map(([item]) => (item as { id: string }).id)).toEqual(['6102'])
    expect(bar('6103')!.querySelector('[data-xf-ai-row]')).toBeNull()
  })

  it('回复别人评论的回复带上那条评论；直接回主帖的不带；那条评论不在页面上时只带作者；属性对应别的推文时不算', async () => {
    window.history.pushState({}, '', '/alice/status/6201')
    mockConfig({ scope: 'all' })
    document.body.innerHTML =
      own('me') +
      tweet('6201', 'alice', '主帖', '2026-10-20T08:00:00.000Z') +
      tweet('6202', 'bob', '南山地铁通了好多', '2026-10-20T08:01:00.000Z') +
      tweet('6203', 'carl', '13 号线吗？', '2026-10-20T08:02:00.000Z') +
      tweet('6204', 'dan', '恭喜', '2026-10-20T08:03:00.000Z') +
      tweet('6205', 'eve', '我也是这么想的', '2026-10-20T08:04:00.000Z') +
      tweet('6206', 'fay', '同感', '2026-10-20T08:05:00.000Z')
    replyTo('6202', '6201', 'alice')
    replyTo('6203', '6202', 'bob')
    replyTo('6204', '6201', 'alice')
    replyTo('6205', '6100', 'ghost')
    replyTo('6206', '6202', 'bob', '6299')
    await runScan(true)
    const sent = Object.fromEntries(fakeScorer.request.mock.calls.map(([item]) => [(item as any).id, (item as any).replyTo]))
    expect(sent).toEqual({
      '6202': undefined,
      '6203': { author: 'bob', text: '南山地铁通了好多' },
      '6204': undefined,
      '6205': { author: 'ghost', text: '' },
      '6206': undefined,
    })
  })

  it('被回复推文晚到：拦截脚本发事件后重扫，送出的内容带上被回复的评论', async () => {
    window.history.pushState({}, '', '/alice/status/6301')
    mockConfig({ debug: false, scope: 'all' })
    document.body.innerHTML =
      own('me') +
      tweet('6301', 'alice', '主帖', '2026-10-20T08:00:00.000Z') +
      tweet('6302', 'bob', '南山地铁通了好多', '2026-10-20T08:01:00.000Z', actions) +
      tweet('6303', 'carl', '13 号线吗？', '2026-10-20T08:02:00.000Z', actions)
    const sentFor = (id: string) => fakeScorer.request.mock.calls.filter(([item]) => (item as any).id === id).map(([item]) => (item as any).replyTo)
    startSpamObserver()
    try {
      await vi.waitFor(() => expect(sentFor('6303')).toEqual([undefined]))
      replyTo('6303', '6302', 'bob')
      document.querySelector('#t6303')!.dispatchEvent(new CustomEvent('xf-reply-target-updated', { bubbles: true }))
      await vi.waitFor(() => expect(sentFor('6303').at(-1)).toEqual({ author: 'bob', text: '南山地铁通了好多' }))
    } finally {
      stopSpamObserver()
    }
  })

  describe('帖子页底部「发现更多」的帖子（对话 ID 和主帖不同）', () => {
    const setupDiscover = (base: number) => {
      window.history.pushState({}, '', `/alice/status/${base}`)
      mockConfig({ debug: false, scope: 'all' })
      fakeScorer.request.mockReturnValue(done(40))
      document.body.innerHTML =
        own('me') +
        tweet(String(base), 'alice', '主帖', '2026-10-20T08:00:00.000Z') +
        tweet(String(base + 1), 'bob', '回复', '2026-10-20T08:01:00.000Z', actions) +
        tweet(String(base + 2), 'carl', '推荐的原帖', '2026-10-20T07:00:00.000Z', actions) +
        tweet(String(base + 3), 'spammer', '点击主页领取福利', '2026-10-20T07:30:00.000Z', actions)
      const annotate = () => {
        conversation(String(base), String(base))
        conversation(String(base + 1), String(base))
        conversation(String(base + 2), String(base + 2))
        conversation(String(base + 3), String(base + 3))
      }
      return annotate
    }
    const shown = (id: string) => document.querySelector<HTMLElement>(`#t${id}`)!.style.display !== 'none'

    it('不评分、不送 AI，规则也不隐藏', async () => {
      setupDiscover(6400)()
      await runScan(true)
      expect(fakeScorer.request.mock.calls.map(([item]) => (item as any).id)).toEqual(['6401'])
      expect(shown('6403')).toBe(true)
      expect(document.querySelector('#t6402 [data-xf-ai-tag]')).toBeNull()
      expect(document.querySelector('#t6401 [data-xf-ai-tag]')).not.toBeNull()
    })

    it('对话 ID 晚到：已经隐藏的放出来，分数标签去掉', async () => {
      const annotate = setupDiscover(6410)
      await runScan(true)
      // 拦截脚本还没写上对话 ID：照原来的做法当回复处理
      expect(shown('6413')).toBe(false)
      expect(document.querySelector('#t6412 [data-xf-ai-tag]')).not.toBeNull()
      annotate()
      await runScan(true)
      expect(shown('6413')).toBe(true)
      expect(document.querySelector('#t6412 [data-xf-ai-tag]')).toBeNull()
      expect(document.querySelector('#t6411 [data-xf-ai-tag]')).not.toBeNull()
    })
  })

  it('没开 AI 判断时不送模型，清掉排队和页面上的 AI 标签', async () => {
    window.history.pushState({}, '', '/alice/status/7001')
    document.body.innerHTML = own('alice') + tweet('7001', 'alice', '主帖', '2026-10-20T08:00:00.000Z') + tweet('7002', 'bob', '回复', '2026-10-20T08:01:00.000Z', actions)
    mockConfig({ debug: false, ai: false })
    await runScan(true)
    mockConfig({ debug: true, ai: false })
    await runScan(true)
    expect(fakeScorer.request).not.toHaveBeenCalled()
    expect(fakeScorer.stop).toHaveBeenCalledTimes(2)
    expect(tag('7002')).toBeNull()
  })

  it('AI 结果版本变了，调试条按新状态重画', async () => {
    window.history.pushState({}, '', '/alice/status/8001')
    mockConfig()
    document.body.innerHTML = own('alice') + tweet('8001', 'alice', '主帖', '2026-10-20T08:00:00.000Z') + tweet('8002', 'bob', '回复', '2026-10-20T08:01:00.000Z')
    fakeScorer.request.mockReturnValue({ status: 'pending' })
    await runScan(true)
    expect(bar('8002')!.querySelector('[data-xf-ai-row]')!.textContent).toBe('AI 判断中')

    // 版本没变：不重新处理
    await runScan(false)
    expect(fakeScorer.request).toHaveBeenCalledTimes(1)

    fakeScorer.version.mockReturnValue(1)
    fakeScorer.request.mockReturnValue({ status: 'paused', reason: 'needsConfig', error: { code: 'error.aiNoKey' } })
    await runScan(false)
    expect(bar('8002')!.querySelector('[data-xf-ai-row]')!.textContent).toBe(`AI 暂停：${t('error.aiNoKey')}`)
    fakeScorer.version.mockReturnValue(0)
  })
})

describe('AI 判断（正常模式）', () => {
  const page = (mainAuthor: string, replyHtml: string) =>
    header + own('me') + tweet('100', mainAuthor, '主帖正文', '2026-10-20T08:00:00.000Z') + replyHtml

  it('分数没到阈值：回复照常显示，操作栏末尾有分数标签，悬停能看到理由和信号', async () => {
    window.history.pushState({}, '', '/me/status/100')
    mockConfig({ debug: false })
    fakeScorer.request.mockReturnValue(done(40))
    document.body.innerHTML = page('me', tweet('101', 'bob', '这套很实用', '2026-10-20T08:01:00.000Z', actions))
    await runScan(true)
    const reply = document.querySelector<HTMLElement>('#t101')!
    expect(reply.style.display).not.toBe('none')
    expect(tag('101')!.textContent).toBe('AI 40')
    expect(tag('101')!.querySelector('.xf-ai-score')!.getAttribute('title')).toBe('AI 嫌疑分 40/100\n复述原帖\n命中：复述原帖、认同+复述+补一句')
    expect(document.querySelector('#x-focus-spam-debug-bar')).toBeNull()
  })

  it('判断中也显示标签', async () => {
    window.history.pushState({}, '', '/me/status/110')
    mockConfig({ debug: false })
    fakeScorer.request.mockReturnValue({ status: 'pending' })
    document.body.innerHTML = header + own('me') + tweet('110', 'me', '主帖', '2026-10-20T08:00:00.000Z') + tweet('111', 'bob', '回复', '2026-10-20T08:01:00.000Z', actions)
    await runScan(true)
    expect(tag('111')!.textContent).toBe('AI 判断中')
  })

  it('分数到了阈值：折叠成一行，记日志、计一次折叠；点「展开」显示原回复，标签后面有「收起」', async () => {
    window.history.pushState({}, '', '/me/status/120')
    mockConfig({ debug: false, aiThreshold: 70 })
    fakeScorer.request.mockReturnValue(done(85))
    document.body.innerHTML = header + own('me') + tweet('120', 'me', '主帖', '2026-10-20T08:00:00.000Z') + tweet('121', 'bob', '这套很实用', '2026-10-20T08:01:00.000Z', actions)
    await runScan(true)

    const reply = document.querySelector<HTMLElement>('#t121')!
    expect(reply.style.display).toBe('none')
    expect(reply.getAttribute('data-xf-spam-hidden-by')).toBe('ai')
    const fold = reply.previousElementSibling!
    expect(fold.matches('[data-xf-spam-hidden-replacement]')).toBe(true)
    expect(fold.textContent).toContain('AI 85')
    expect(fold.textContent).toContain('已折叠 · 复述原帖、认同+复述+补一句 · @bob')
    expect((globalThis as any).browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'XF_REPLY_SCORE_FOLDED' })

    // 再扫一遍：不重复计数
    await runScan(true)
    expect((globalThis as any).browser.runtime.sendMessage).toHaveBeenCalledTimes(1)

    fold.querySelector<HTMLButtonElement>('.xf-ai-fold-btn')!.click()
    await vi.waitFor(() => expect(reply.style.display).not.toBe('none'))
    expect(reply.previousElementSibling?.matches('[data-xf-spam-hidden-replacement]') ?? false).toBe(false)
    expect(tag('121')!.textContent).toBe('AI 85收起')

    tag('121')!.querySelector<HTMLButtonElement>('.xf-ai-link')!.click()
    await vi.waitFor(() => expect(reply.style.display).toBe('none'))
  })

  it('规则已经隐藏的回复不送模型、没有标签', async () => {
    window.history.pushState({}, '', '/me/status/130')
    mockConfig({ debug: false })
    document.body.innerHTML = header + own('me') + tweet('130', 'me', '主帖', '2026-10-20T08:00:00.000Z') + tweet('131', 'spammer', '点击主页领取福利', '2026-10-20T08:01:00.000Z', actions)
    await runScan(true)
    const reply = document.querySelector<HTMLElement>('#t131')!
    expect(reply.getAttribute('data-xf-spam-hidden-by')).toBe('rule')
    expect(fakeScorer.request).not.toHaveBeenCalled()
    expect(tag('131')).toBeNull()
  })

  it('别人的帖子、范围是「我的帖子」：标题栏按钮显示能手动判断的条数，点了把这些回复送去手动判断', async () => {
    window.history.pushState({}, '', '/alice/status/140')
    mockConfig({ debug: false, scope: 'own' })
    fakeScorer.request.mockReturnValue({ status: 'manual' })
    document.body.innerHTML = header + own('me') + tweet('140', 'alice', '主帖', '2026-10-20T08:00:00.000Z') +
      tweet('141', 'bob', '回复一', '2026-10-20T08:01:00.000Z', actions) +
      tweet('142', 'carl', '回复二', '2026-10-20T08:02:00.000Z', actions)
    await runScan(true)
    expect(fakeScorer.request.mock.calls.map((c) => c[2])).toEqual([false, false])
    expect(pill()!.textContent).toBe('AI 判断本页 2 条')
    expect(pill()!.parentElement!.id).toBe('header-row')
    pill()!.click()
    expect(fakeScorer.manual).toHaveBeenCalledTimes(1)
    const entries = fakeScorer.manual.mock.calls[0][0] as any[]
    expect(entries.map((e) => e.item.id)).toEqual(['141', '142'])
    expect(entries[0].parent).toEqual({ id: '140', author: 'alice', text: '主帖' })
  })

  it('标题栏按钮的其他状态：判断中、已判断、没配置（点了打开设置页）、出错', async () => {
    window.history.pushState({}, '', '/me/status/150')
    mockConfig({ debug: false })
    fakeScorer.request.mockReturnValue({ status: 'pending' })
    document.body.innerHTML = header + own('me') + tweet('150', 'me', '主帖', '2026-10-20T08:00:00.000Z') + tweet('151', 'bob', '回复', '2026-10-20T08:01:00.000Z', actions)

    fakeScorer.peek.mockReturnValue('pending')
    await runScan(true)
    expect(pill()!.textContent).toBe('AI 判断中 · 0/1')

    fakeScorer.peek.mockReturnValue('done')
    await runScan(true)
    expect(pill()!.textContent).toBe('AI 已判断 1 条')
    expect(pill()!.getAttribute('data-clickable')).toBe('0')

    fakeScorer.peek.mockReturnValue('none')
    fakeScorer.status.mockReturnValue({ paused: { reason: 'needsConfig', error: { code: 'error.aiNoKey' } }, busy: false })
    await runScan(true)
    expect(pill()!.textContent).toBe('AI 未配置好 · 打开设置')
    expect(pill()!.title).toBe(t('error.aiNoKey'))
    expect(pill()!.getAttribute('data-tone')).toBe('warn')
    pill()!.click()
    expect((globalThis as any).browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'XF_OPEN_SETTINGS', module: 'settings' })

    fakeScorer.status.mockReturnValue({ paused: { reason: 'error', error: 'network down' }, busy: false })
    await runScan(true)
    expect(pill()!.textContent).toBe('AI 判断失败 · 查看详情')
    pill()!.click()
    expect(fakeScorer.manual).not.toHaveBeenCalled()
    const dialog = document.querySelector<HTMLDialogElement>('[data-xf-ai-error]')!
    expect(dialog.textContent).toContain('network down')
    dialog.querySelector<HTMLButtonElement>('[data-ai-action]')!.click()
    expect(fakeScorer.manual).toHaveBeenCalled()
    expect(document.querySelector('[data-xf-ai-error]')).toBeNull()
  })

  it('没开 AI 判断时不显示标题栏按钮', async () => {
    window.history.pushState({}, '', '/me/status/160')
    mockConfig({ debug: false, ai: false })
    document.body.innerHTML = header + own('me') + tweet('160', 'me', '主帖', '2026-10-20T08:00:00.000Z') + tweet('161', 'bob', '回复', '2026-10-20T08:01:00.000Z', actions)
    await runScan(true)
    expect(pill()).toBeNull()
  })
})

describe('标注', () => {
  const setup = async (path: string, mainId: string, replyId: string, display: unknown, text = '这套很实用') => {
    window.history.pushState({}, '', path)
    mockConfig({ debug: false })
    fakeScorer.request.mockReturnValue(display)
    document.body.innerHTML = header + own('me') + tweet(mainId, 'me', '主帖', '2026-10-20T08:00:00.000Z') + tweet(replyId, 'bob', text, '2026-10-20T08:01:00.000Z', actions)
    await runScan(true)
    return document.querySelector<HTMLElement>(`#t${replyId}`)!
  }
  const labelButton = (root: Element, label: string) => root.querySelector<HTMLButtonElement>(`.xf-ai-label[data-label="${label}"]`)!
  /** 和真实队列一样：标注按推文 ID 分别记，标注一变版本号加 1 */
  const trackLabels = (initial: Record<string, 'bot' | 'human'> = {}) => {
    const labels = new Map(Object.entries(initial))
    let version = 0
    fakeScorer.label.mockImplementation((id: string) => labels.get(id))
    fakeScorer.setLabel.mockImplementation((change: any) => {
      if (change.label) labels.set(change.id, change.label)
      else labels.delete(change.id)
      fakeScorer.version.mockReturnValue(++version)
    })
  }

  it('分数标签后面有「机器人 / 真人」两个按钮；没有分数的回复也有', async () => {
    await setup('/me/status/200', '200', '201', done(40))
    expect(tag('201')!.querySelectorAll('.xf-ai-label')).toHaveLength(2)
    fakeScorer.request.mockReturnValue({ status: 'manual' })
    await setup('/me/status/210', '210', '211', { status: 'manual' })
    expect(tag('211')!.textContent).toBe('')
    expect(tag('211')!.querySelectorAll('.xf-ai-label')).toHaveLength(2)
  })

  it('点「机器人」：交给队列保存（带上回复内容、主帖和当时的分数），账号记成机器人，这条马上折叠', async () => {
    const reply = await setup('/me/status/220', '220', '221', done(40))
    fakeScorer.setLabel.mockImplementation((change: any) => fakeScorer.label.mockReturnValue(change.label ?? undefined))
    labelButton(tag('221')!, 'bot').click()
    expect(fakeScorer.setLabel).toHaveBeenCalledWith({
      id: '221',
      label: 'bot',
      item: expect.objectContaining({ id: '221', author: 'bob', text: '这套很实用' }),
      parent: { id: '220', author: 'me', text: '主帖' },
      ai: { score: 40, signals: ['S2', 'S11'], reason: '复述原帖' },
      botAccount: true,
    })
    await vi.waitFor(() => expect(reply.style.display).toBe('none'))
    const fold = reply.previousElementSibling!
    expect(fold.textContent).toContain('已标为机器人 · 复述原帖、认同+复述+补一句 · @bob')
    expect(labelButton(fold, 'bot').getAttribute('data-active')).toBe('1')

    // 在折叠条上再点一次撤销：账号一起移出；40 分没到阈值，回复显示出来
    labelButton(fold, 'bot').click()
    expect(fakeScorer.setLabel).toHaveBeenLastCalledWith(expect.objectContaining({ id: '221', label: null, botAccount: false }))
    await vi.waitFor(() => expect(reply.style.display).not.toBe('none'))
  })

  it('这条自己标的「机器人」改成「真人」：账号移出', async () => {
    trackLabels({ '226': 'bot' })
    const reply = await setup('/me/status/225', '225', '226', done(40))
    labelButton(reply.previousElementSibling!, 'human').click()
    expect(fakeScorer.setLabel).toHaveBeenLastCalledWith(expect.objectContaining({ id: '226', label: 'human', botAccount: false }))
    await vi.waitFor(() => expect(reply.style.display).not.toBe('none'))
  })

  it('标了「真人」的高分回复不折叠，按钮高亮', async () => {
    fakeScorer.label.mockReturnValue('human')
    const reply = await setup('/me/status/230', '230', '231', done(90))
    expect(reply.style.display).not.toBe('none')
    expect(labelButton(tag('231')!, 'human').getAttribute('data-active')).toBe('1')
  })

  it('没有分数也能标成「机器人」并折叠；折叠条没有分数', async () => {
    fakeScorer.label.mockReturnValue('bot')
    const reply = await setup('/alice/status/240', '240', '241', { status: 'manual' })
    expect(reply.style.display).toBe('none')
    expect(reply.previousElementSibling!.textContent).toBe('已标为机器人 · @bob展开')
  })

  it('标注变了，折叠条按新状态重画', async () => {
    fakeScorer.label.mockReturnValue('bot')
    const reply = await setup('/me/status/250', '250', '251', done(85))
    expect(reply.previousElementSibling!.textContent).toContain('已标为机器人')
    // 真实流程里标注一变，队列的版本号就加 1
    fakeScorer.label.mockReturnValue(undefined)
    fakeScorer.version.mockReturnValue(1)
    await runScan(true)
    fakeScorer.version.mockReturnValue(0)
    expect(reply.style.display).toBe('none')
    expect(reply.previousElementSibling!.textContent).toContain('已折叠 · ')
    expect(reply.previousElementSibling!.textContent).not.toContain('已标为机器人')
  })

  describe('标过机器人的账号', () => {
    const setupAccount = async (base: number) => {
      window.history.pushState({}, '', `/me/status/${base}`)
      mockConfig({ debug: false, scope: 'all', botAccounts: ['bob'] })
      fakeScorer.request.mockReturnValue({ status: 'manual' })
      trackLabels()
      document.body.innerHTML = header + own('me') +
        tweet(String(base), 'me', '主帖', '2026-10-20T08:00:00.000Z') +
        tweet(String(base + 1), 'Bob', '这套很实用', '2026-10-20T08:01:00.000Z', actions) +
        tweet(String(base + 2), 'carl', '我们也这么干过', '2026-10-20T08:02:00.000Z', actions)
      await runScan(true)
      return document.querySelector<HTMLElement>(`#t${base + 1}`)!
    }

    it('这个账号的回复直接折叠，不自动送模型；可以展开，展开后「机器人」亮着、有「收起」', async () => {
      const reply = await setupAccount(270)
      const auto = Object.fromEntries(fakeScorer.request.mock.calls.map(([item, , isAuto]) => [(item as any).id, isAuto]))
      expect(auto).toEqual({ '271': false, '272': true })
      expect(reply.style.display).toBe('none')
      const fold = reply.previousElementSibling!
      expect(fold.textContent).toBe('账号标过机器人 · @Bob展开')
      expect(labelButton(fold, 'bot').title).toContain('这个账号标过机器人')

      fold.querySelector<HTMLButtonElement>('.xf-ai-fold-btn')!.click()
      await vi.waitFor(() => expect(reply.style.display).not.toBe('none'))
      expect(labelButton(tag('271')!, 'bot').getAttribute('data-active')).toBe('1')
      expect(tag('271')!.textContent).toContain('收起')
    })

    it('在这条上点亮着的「机器人」：撤销这个账号，回复显示出来', async () => {
      const reply = await setupAccount(280)
      labelButton(reply.previousElementSibling!, 'bot').click()
      expect(fakeScorer.setLabel).toHaveBeenLastCalledWith(expect.objectContaining({ id: '281', label: null, botAccount: false }))
      await vi.waitFor(() => expect(reply.style.display).not.toBe('none'))
    })

    it('在这条上标「真人」：只放出这一条，账号不变', async () => {
      const reply = await setupAccount(290)
      document.body.insertAdjacentHTML('beforeend', tweet('293', 'bob', '另一条', '2026-10-20T08:03:00.000Z', actions))
      await runScan(true)
      labelButton(reply.previousElementSibling!, 'human').click()
      const change = fakeScorer.setLabel.mock.calls.at(-1)![0] as any
      expect(change).toMatchObject({ id: '291', label: 'human' })
      expect('botAccount' in change).toBe(false)
      await vi.waitFor(() => expect(reply.style.display).not.toBe('none'))
      expect(document.querySelector<HTMLElement>('#t293')!.style.display).toBe('none')
    })
  })

  it('点了「展开」的回复再标「机器人」，马上重新折叠', async () => {
    const reply = await setup('/me/status/260', '260', '261', done(85))
    reply.previousElementSibling!.querySelector<HTMLButtonElement>('.xf-ai-fold-btn')!.click()
    await vi.waitFor(() => expect(reply.style.display).not.toBe('none'))
    fakeScorer.setLabel.mockImplementation((change: any) => fakeScorer.label.mockReturnValue(change.label ?? undefined))
    labelButton(tag('261')!, 'bot').click()
    await vi.waitFor(() => expect(reply.style.display).toBe('none'))
  })
})

it('shows refresh guidance for invalidated extension even without waiting replies and removes details on navigation', async () => {
  window.history.pushState({}, '', '/me/status/950')
  mockConfig({ debug: false })
  document.body.innerHTML = header + own('me') + tweet('950', 'me', '主帖', '2026-10-20T08:00:00.000Z')
  fakeScorer.status.mockReturnValue({ paused: { reason: 'error', error: 'Extension context invalidated.' }, busy: false })
  await runScan(true)
  expect(pill()!.textContent).toContain('扩展连接已失效')
  pill()!.click()
  const dialog = document.querySelector<HTMLDialogElement>('[data-xf-ai-error]')!
  expect(dialog.textContent).toContain('刷新当前 X 页面')
  expect(dialog.querySelector('[data-ai-action]')!.textContent).toBe('刷新页面')
  expect(fakeScorer.manual).not.toHaveBeenCalled()
  window.history.pushState({}, '', '/home')
  await runScan(true)
  expect(document.querySelector('[data-xf-ai-error]')).toBeNull()
})

it('updates one reply and the progress counter while other replies are still streaming', async () => {
  window.history.pushState({}, '', '/me/status/960')
  mockConfig({ debug: false })
  document.body.innerHTML = header + own('me') + tweet('960', 'me', '主帖', '2026-10-20T08:00:00.000Z')
    + tweet('961', 'bob', '回复一', '2026-10-20T08:01:00.000Z', actions)
    + tweet('962', 'carl', '回复二', '2026-10-20T08:02:00.000Z', actions)
  fakeScorer.status.mockReturnValue({ paused: null, busy: true })
  fakeScorer.request.mockReturnValue({ status: 'pending' })
  fakeScorer.peek.mockReturnValue('pending')
  await runScan(true)
  expect(pill()!.textContent).toBe('AI 判断中 · 0/2')
  expect(pill()!.getAttribute('data-busy')).toBe('1')
  fakeScorer.peek.mockImplementation((id: string) => id === '961' ? 'done' : 'pending')
  fakeScorer.request.mockImplementation((item: any) => item.id === '961' ? done(20) : { status: 'pending' })
  await runScan(true)
  expect(tag('961')!.textContent).toBe('AI 20')
  expect(tag('962')!.textContent).toBe('AI 判断中')
  expect(pill()!.textContent).toBe('AI 判断中 · 1/2')
  expect(pill()!.title).toContain('每条判断完成后立即显示')
})

it('bounds render scheduling so streamed results do not wait indefinitely for browser idle time', async () => {
  const { startSpamObserver, stopSpamObserver } = await import('../../content-scripts/spam/scanner')
  const idle = vi.fn()
  vi.stubGlobal('requestIdleCallback', idle)
  window.history.pushState({}, '', '/me/status/970')
  mockConfig({ debug: false })
  document.body.innerHTML = header + own('me') + tweet('970', 'me', '主帖', '2026-10-20T08:00:00.000Z')
  startSpamObserver()
  try {
    const notify = fakeScorer.onChange.mock.calls.at(-1)?.[0] as unknown as () => void
    notify()
    expect(idle).toHaveBeenCalledWith(expect.any(Function), { timeout: 200 })
  } finally {
    stopSpamObserver()
    idle.mock.calls[0]?.[0]()
    vi.unstubAllGlobals()
  }
})
