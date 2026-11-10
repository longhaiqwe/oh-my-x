// @vitest-environment-options {"url":"https://x.com"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNotificationStateWriter, groupNotifications, notificationFingerprint, notificationIsUnread, NOTIFICATION_STATE_KEY, NOTIFICATION_STATE_MESSAGE } from '../../shared/notification-cards'
import { findNotificationTimeline, getNotificationAccount, parseNotificationArticle } from '../../content-scripts/features/notification-parser'
import { cleanupNotificationCards, setNotificationCardsEnabled, updateNotificationCards } from '../../content-scripts/features/notification-cards'
import { applyLanguageSetting } from '../../shared/i18n'

const date = '2026-11-10T12:00:00.000Z'
const timestamp = Date.parse(date)
function notice(summary = 'Alice 和另外 1 个人点赞了你的帖子', datetime = date) {
  return `<article data-testid="notification"><ul><li><a href="/alice"><img src="https://pbs.twimg.com/profile_images/a.jpg"></a></li><li><a href="/bob"></a></li></ul><div dir="ltr"><span><a href="/alice">Alice</a> ${summary.replace('Alice ', '')}</span><span aria-hidden="true">·</span><span><time datetime="${datetime}">2分钟</time></span></div><div data-testid="tweetText">帖子正文 <a href="/not_an_actor">@not_an_actor</a></div></article>`
}
function tweet(handle = 'alice', id = '123', datetime = date) {
  return `<article data-testid="tweet"><div data-testid="User-Name"><a href="/${handle}">${handle === 'alice' ? 'Alice' : 'Bob'}</a><a href="/${handle}">@${handle}</a><a href="/${handle}/status/${id}"><time datetime="${datetime}">2分钟</time></a><span class="xf-followers">123 粉丝</span></div><div data-testid="tweetText">回复内容 &lt;script&gt;alert(1)&lt;/script&gt;</div><div role="group">10 喜欢</div></article>`
}
function parse(html: string) {
  const container = document.createElement('div'); container.innerHTML = html
  return parseNotificationArticle(container.querySelector('article')!)!
}
function mount(html = notice() + tweet()) {
  document.body.innerHTML = `<nav><a data-testid="AppTabBar_Profile_Link" href="/me">Me</a><a data-testid="AppTabBar_Home_Link"><span style="font-family:TwitterChirp">Home</span></a></nav><main data-testid="primaryColumn"><div role="tablist"><button role="tab" aria-selected="true">全部</button></div><section aria-label="通知"><div id="native-timeline">${html.replaceAll('<article', '<div data-testid="cellInnerDiv"><article').replaceAll('</article>', '</article></div>')}</div></section></main>`
}
let store: Record<string, unknown>
afterEach(() => { setNotificationCardsEnabled(false); vi.unstubAllGlobals() })
beforeEach(() => {
  cleanupNotificationCards(); setNotificationCardsEnabled(false)
  applyLanguageSetting('zh-CN')
  window.history.replaceState({}, '', '/notifications')
  store = {}
  const storage = { get: vi.fn(async () => structuredClone(store)), set: vi.fn(async (value: Record<string, unknown>) => { Object.assign(store, structuredClone(value)) }) }
  const writer = createNotificationStateWriter(storage, () => timestamp - 1000)
  vi.stubGlobal('browser', { storage: { local: storage }, runtime: { id: 'test', sendMessage: vi.fn(async request => ({ ok: true, state: await writer(request) })) } })
  mount()
})

describe('通知 DOM 解析', () => {
  it('从头像和标题提取参与用户，不把正文中的提及当成互动者', () => {
    const entry = parse(notice())
    expect(entry.actors.map(a => a.handle)).toEqual(['alice', 'bob'])
    expect(entry.actors[0]).toMatchObject({ name: 'Alice', avatar: 'https://pbs.twimg.com/profile_images/a.jpg' })
    expect(entry).toMatchObject({ kind: 'like', grouped: true, timestamp, summary: 'Alice 和另外 1 个人点赞了你的帖子' })
    expect(entry.url).toBe('')
  })
  it('通知时间显示变化不产生重复记录，新的绝对时间产生新记录', () => {
    const entry = parse(notice())
    expect(parse(notice().replace('2分钟', '3分钟')).id).toBe(entry.id)
    expect(parse(notice(undefined, '2026-11-10T12:01:00.000Z')).id).not.toBe(entry.id)
  })
  it('回复按原帖标识去重，不受浏览量、粉丝数或相对时间影响', () => {
    const entry = parse(tweet())
    expect(entry).toMatchObject({ kind: 'reply', url: 'https://x.com/alice/status/123', summary: '' })
    expect(entry.text).toContain('<script>')
    expect(parse(tweet().replace('10 喜欢', '11 喜欢').replace('2分钟', '10分钟')).id).toBe(entry.id)
  })
  it.each([
    ['Alice liked your post', 'like'], ['Alice reposted your post', 'repost'], ['Alice followed you', 'follow'],
    ['Alice 的新帖子通知', 'other'],
  ])('识别通知 %s', (summary, kind) => expect(parse(notice(summary)).kind).toBe(kind))
  it('占位节点不入库；未知或站外链接不能变成用户', () => {
    expect(parse('<article data-testid="notification"><a href="/alice"></a></article>')).toBeNull()
    const entry = parse(notice().replaceAll('href="/alice"', 'href="https://example.org/alice"'))
    expect(entry.actors.map(a => a.handle)).toEqual(['bob'])
  })
  it('页面定位只返回原生时间线，账号来源可识别', () => {
    expect(findNotificationTimeline()?.id).toBe('native-timeline')
    expect(getNotificationAccount()).toBe('handle:me')
  })
})

describe('本地未查看状态', () => {
  it('历史首次加载不标新，后续新记录按用户分别清除角标', () => {
    const entry = parse(notice())
    expect(groupNotifications([entry], { baseline: timestamp, read: {} }).every(g => g.unread === 0)).toBe(true)
    const state = { baseline: timestamp - 1000, read: { [`${entry.id}:alice`]: timestamp } }
    expect(groupNotifications([entry, entry], state).map(g => g.unread)).toEqual([0, 1])
    expect(notificationIsUnread({ ...entry, timestamp: 0 }, state, 'bob')).toBe(false)
  })
  it('并发写入合并，账号隔离，首次基线不被后续读取重置', async () => {
    const storage = browser.storage.local
    let now = timestamp
    const writer = createNotificationStateWriter(storage, () => now)
    const request = { type: NOTIFICATION_STATE_MESSAGE, account: 'handle:me' } as const
    await writer(request); now += 1000
    await Promise.all([writer({ ...request, read: ['a-b:alice'] }), writer({ ...request, read: ['c-d:bob'] })])
    const state = await writer(request)
    expect(state.baseline).toBe(timestamp)
    expect(Object.keys(state.read)).toEqual(['a-b:alice', 'c-d:bob'])
    expect((await writer({ ...request, account: 'handle:other' })).read).toEqual({})
    await expect(writer({ ...request, account: '__proto__' })).rejects.toThrow()
    expect(await writer(request)).toEqual(state)
  })
  it('收据上限推进基线，避免清理后旧通知重新标新', async () => {
    const read = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`${i.toString(16)}-a:alice`, timestamp + i]))
    store[NOTIFICATION_STATE_KEY] = { 'handle:me': { baseline: timestamp - 1000, read } }
    const writer = createNotificationStateWriter(browser.storage.local, () => timestamp + 3000)
    const state = await writer({ type: NOTIFICATION_STATE_MESSAGE, account: 'handle:me', read: ['abcd-b:alice'] })
    expect(Object.keys(state.read)).toHaveLength(2000)
    expect(state.baseline).toBe(timestamp)
  })
  it('账号缓存不会超过 20 个；读取不会触发无意义的重复写入', async () => {
    const writer = createNotificationStateWriter(browser.storage.local, () => timestamp)
    for (let i = 0; i < 21; i++) await writer({ type: NOTIFICATION_STATE_MESSAGE, account: `uid:${i}` })
    expect(Object.keys(store[NOTIFICATION_STATE_KEY] as object)).toHaveLength(20)
    const writes = vi.mocked(browser.storage.local.set).mock.calls.length
    await writer({ type: NOTIFICATION_STATE_MESSAGE, account: 'uid:20' })
    expect(vi.mocked(browser.storage.local.set).mock.calls.length).toBe(writes)
  })
})

describe('通知页集成', () => {
  async function enable() { setNotificationCardsEnabled(true); await updateNotificationCards() }
  const card = (handle: string) => document.querySelector<HTMLButtonElement>(`[data-person="${handle}"]`)!
  it('使用原生字体，保留原生标签和列表，点击展开转义后的真实内容', async () => {
    await enable()
    expect(document.querySelectorAll('.xf-nc-card')).toHaveLength(2)
    expect(document.querySelector('#xf-notification-cards')?.getAttribute('style')).toContain('TwitterChirp')
    expect(document.querySelector('[role="tablist"]')?.textContent).toBe('全部')
    expect(document.querySelector('#native-timeline')?.getAttribute('data-xf-notification-hidden')).toBe('true')
    card('alice').click(); await new Promise(resolve => setTimeout(resolve, 0))
    expect(document.querySelector('.xf-nc-detail')?.textContent).toContain('<script>alert(1)</script>')
    expect(document.querySelector('.xf-nc-detail script')).toBeNull()
    expect(card('alice').getAttribute('aria-expanded')).toBe('true')
    expect(card('alice').querySelector('.xf-nc-badge')).toBeNull()
    expect(card('bob').querySelector('.xf-nc-badge')).not.toBeNull()
    document.querySelector<HTMLButtonElement>('[data-action="list"]')!.click()
    expect(document.querySelector('#native-timeline')?.hasAttribute('data-xf-notification-hidden')).toBe(false)
    expect(document.querySelectorAll('#native-timeline article')).toHaveLength(2)
  })
  it('虚拟列表卸载后仍保留当前页已获取记录；重挂不重复', async () => {
    await enable()
    document.querySelector('#native-timeline')!.innerHTML = `<div data-testid="cellInnerDiv">${tweet('bob', '456')}</div>`
    await updateNotificationCards(); await updateNotificationCards()
    card('alice').click()
    expect(document.querySelectorAll('.xf-nc-detail .xf-nc-event')).toHaveLength(2)
  })
  it('关闭、离开通知页时恢复原始 DOM；账户和通知标签不混用', async () => {
    await enable()
    setNotificationCardsEnabled(false)
    expect(document.querySelector('#xf-notification-cards')).toBeNull()
    expect(document.querySelector('#native-timeline')?.hasAttribute('data-xf-notification-hidden')).toBe(false)
    await enable()
    window.history.replaceState({}, '', '/notifications/mentions')
    mount(tweet('bob', '456')); await updateNotificationCards()
    expect(document.querySelectorAll('.xf-nc-card')).toHaveLength(1)
    expect(card('bob')).toBeTruthy()
    document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')!.setAttribute('href', '/other')
    mount(tweet('alice', '789'))
    document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')!.setAttribute('href', '/other')
    await updateNotificationCards()
    expect(card('bob')).toBeNull()
    window.history.replaceState({}, '', '/home'); await updateNotificationCards()
    expect(document.querySelector('#xf-notification-cards')).toBeNull()
  })
  it('后台失联时不隐藏原列表', async () => {
    vi.mocked(browser.runtime.sendMessage).mockRejectedValue(new Error('disconnected'))
    await enable()
    expect(document.querySelector('#native-timeline')?.hasAttribute('data-xf-notification-hidden')).toBe(false)
  })
  it('无法识别用户的通知保留摘要，未知节点提供原始列表提示', async () => {
    mount(notice().replaceAll('href="/alice"', 'href="https://example.org/alice"').replaceAll('href="/bob"', 'href="https://example.org/bob"') + '<article data-testid="notification">Unknown format</article>')
    await enable()
    expect(document.querySelector('.xf-nc-other')?.textContent).toContain('Alice 和另外 1 个人点赞了你的帖子')
    expect(document.querySelector('#xf-notification-cards')?.textContent).toContain('还有 1 条通知暂未识别')
  })
  it('保存失败不清除角标，并提示用户重试', async () => {
    await enable()
    vi.mocked(browser.runtime.sendMessage).mockRejectedValueOnce(new Error('quota'))
    card('alice').click(); await new Promise(resolve => setTimeout(resolve, 0))
    expect(card('alice').querySelector('.xf-nc-badge')?.textContent).toBe('2')
    expect(document.querySelector('.xf-nc-status')?.textContent).toContain('保存失败')
  })
  it('在读取后台状态期间切换账号，不把旧账号记录显示给新账号', async () => {
    let resolve!: (value: unknown) => void
    vi.mocked(browser.runtime.sendMessage).mockImplementationOnce(() => new Promise(done => { resolve = done }))
    setNotificationCardsEnabled(true)
    const first = updateNotificationCards()
    mount(tweet('bob', '900'))
    document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')!.setAttribute('href', '/other')
    const second = updateNotificationCards()
    resolve({ ok: true, state: { baseline: timestamp, read: {} } })
    await Promise.all([first, second])
    expect(document.querySelectorAll('.xf-nc-card')).toHaveLength(1)
    expect(card('bob')).toBeTruthy()
    expect(card('alice')).toBeNull()
  })
  it('新数据到达时已展开卡片不自动清除新角标', async () => {
    await enable(); card('alice').click(); await new Promise(resolve => setTimeout(resolve, 0))
    document.querySelector('#native-timeline')!.insertAdjacentHTML('afterbegin', `<div data-testid="cellInnerDiv">${tweet('alice', '999', '2026-11-10T12:03:00.000Z')}</div>`)
    await updateNotificationCards()
    expect(card('alice').querySelector('.xf-nc-badge')?.textContent).toBe('1')
    expect(notificationFingerprint('a')).not.toBe(notificationFingerprint('b'))
  })
  it('X 原地更新通知时间和文字时自动更新，不依赖其他页面变更', async () => {
    await enable(); card('alice').click(); await new Promise(resolve => setTimeout(resolve, 0))
    const article = document.querySelector('#native-timeline article[data-testid="notification"]')!
    article.querySelector('time')!.setAttribute('datetime', '2026-11-10T12:05:00.000Z')
    article.querySelector('[data-testid="tweetText"]')!.textContent = '新通知内容'
    await new Promise(resolve => setTimeout(resolve, 180))
    expect(card('alice').querySelector('.xf-nc-badge')?.textContent).toBe('1')
    expect(document.querySelector('.xf-nc-detail')?.textContent).toContain('新通知内容')
  })
})
