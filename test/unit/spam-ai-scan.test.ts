import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  KeySpamAiAutoScope,
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
  onChange: vi.fn(() => () => {}),
  reset: vi.fn(),
  stop: vi.fn(),
  peek: vi.fn((_id: string) => 'none'),
  status: vi.fn(() => ({ paused: null as any, busy: false })),
  manual: vi.fn((_entries: unknown[]) => 1),
}))
vi.mock('../../content-scripts/spam/ai-scorer', () => ({ aiScorer: fakeScorer }))

const { invalidateSpamConfig, runScan } = await import('../../content-scripts/spam/scanner')

function mockConfig({ debug = true, ai = true, scope = 'own', aiThreshold = 70 } = {}) {
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
const bar = (id: string) => document.querySelector(`#t${id} #x-focus-spam-debug-bar`)

beforeEach(() => {
  fakeScorer.request.mockReset()
  fakeScorer.request.mockReturnValue({ status: 'done', score: 82, signals: ['S1', 'S6'], reason: '换个帖子也成立' })
  fakeScorer.stop.mockClear()
  fakeScorer.peek.mockReset()
  fakeScorer.peek.mockReturnValue('none')
  fakeScorer.status.mockReset()
  fakeScorer.status.mockReturnValue({ paused: null, busy: false })
  fakeScorer.manual.mockClear()
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
    expect(bar('8002')!.querySelector('[data-xf-ai-row]')!.textContent).toBe('AI 暂停：请先配置 AI API Key')
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
    expect(pill()!.textContent).toBe('AI 判断中 · 已判断 0 条')

    fakeScorer.peek.mockReturnValue('done')
    await runScan(true)
    expect(pill()!.textContent).toBe('AI 已判断 1 条')
    expect(pill()!.getAttribute('data-clickable')).toBe('0')

    fakeScorer.peek.mockReturnValue('none')
    fakeScorer.status.mockReturnValue({ paused: { reason: 'needsConfig', error: { code: 'error.aiNoKey' } }, busy: false })
    await runScan(true)
    expect(pill()!.textContent).toBe('AI 未配置好 · 打开设置')
    expect(pill()!.title).toBe('请先配置 AI API Key')
    expect(pill()!.getAttribute('data-tone')).toBe('warn')
    pill()!.click()
    expect((globalThis as any).browser.runtime.sendMessage).toHaveBeenCalledWith({ type: 'XF_OPEN_SETTINGS' })

    fakeScorer.status.mockReturnValue({ paused: { reason: 'error', error: 'network down' }, busy: false })
    await runScan(true)
    expect(pill()!.textContent).toBe('AI 出错了 · 点此重试')
    pill()!.click()
    expect(fakeScorer.manual).toHaveBeenCalled()
  })

  it('没开 AI 判断时不显示标题栏按钮', async () => {
    window.history.pushState({}, '', '/me/status/160')
    mockConfig({ debug: false, ai: false })
    document.body.innerHTML = header + own('me') + tweet('160', 'me', '主帖', '2026-10-20T08:00:00.000Z') + tweet('161', 'bob', '回复', '2026-10-20T08:01:00.000Z', actions)
    await runScan(true)
    expect(pill()).toBeNull()
  })
})
