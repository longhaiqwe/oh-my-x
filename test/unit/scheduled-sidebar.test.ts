import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  buildScheduleDayGroups,
  findScheduledSidebarSlot,
  formatScheduleDayLabel,
} from '../../content-scripts/features/scheduled-sidebar'
import type { PersistedScheduledItem } from '../../content-scripts/options/scheduled-time'
import { KeyScheduledPostsCache, KeyScheduledSidebarCollapsed } from '../../storage-keys'
import { SCHEDULED_FETCH_REQ_TYPE, SCHEDULED_FETCH_RES_TYPE, XF_BRIDGE_MARKER } from '../../shared/bridge'

const at = (month: number, day: number, hour: number, minute: number, year = 2026) =>
  new Date(year, month - 1, day, hour, minute).getTime()

const item = (timestamp: number, text: string): PersistedScheduledItem => ({
  restId: String(timestamp),
  timestamp,
  formattedTime: '',
  text,
})

// 2026-10-17 是周六
const NOW = new Date(2026, 9, 17, 21, 30)

describe('buildScheduleDayGroups', () => {
  it('按天分组，标出当天相邻两条的间隔和跨天间隔，已过时间的条目不显示', () => {
    const groups = buildScheduleDayGroups([
      item(at(10, 18, 9, 39), '蓝 V 订阅成本'),
      item(at(10, 17, 23, 6), 'ChatGPT 操控浏览器'),
      item(at(10, 17, 20, 0), '已经发出的帖子'),
      item(at(10, 18, 8, 48), '国内大模型市场'),
      item(at(10, 18, 11, 22), '第四条'),
    ], NOW)

    expect(groups.map((g) => g.label)).toEqual(['今天 · 10-17', '明天 · 10-18'])
    expect(groups[0].rows.map((r) => r.time)).toEqual(['23:06'])
    expect(groups[0].note?.text).toBe('下一条 1小时36分钟后')
    expect(groups[0].rows[0].theme.category).toBe('first_soon')

    expect(groups[1].note?.text).toBe('跨夜 9小时42分')
    expect(groups[1].rows.map((r) => r.time)).toEqual(['08:48', '09:39', '11:22'])
    expect(groups[1].rows[0].gap).toBeNull()
    expect(groups[1].rows[0].theme.category).toBe('moderate')
    expect(groups[1].rows[1].gap).toMatchObject({ label: '过密', text: '51分钟', tight: true })
    expect(groups[1].rows[2].gap).toMatchObject({ label: '过密', text: '1小时43分', tight: true })
  })

  it('间隔不短于 2 小时写「间隔」，相隔一天以上写「跨日」', () => {
    const groups = buildScheduleDayGroups([
      item(at(10, 18, 9, 0), 'a'),
      item(at(10, 18, 13, 30), 'b'),
      item(at(10, 20, 10, 0), 'c'),
    ], NOW)
    expect(groups.map((g) => g.label)).toEqual(['明天 · 10-18', '周二 · 10-20'])
    expect(groups[0].rows[1].gap).toMatchObject({ label: '间隔', text: '4小时30分', tight: false })
    expect(groups[1].note?.text).toBe('跨日 1天20小时')
  })

  it('没有待发布的条目时返回空数组', () => {
    expect(buildScheduleDayGroups([item(at(10, 17, 8, 0), 'old')], NOW)).toEqual([])
  })
})

describe('formatScheduleDayLabel', () => {
  it('今天、明天、后天，之后写星期；跨年时带年份', () => {
    expect(formatScheduleDayLabel(new Date(at(10, 19, 9, 0)), NOW)).toBe('后天 · 10-19')
    const newYearEve = new Date(2026, 11, 31, 22, 0)
    expect(formatScheduleDayLabel(new Date(at(1, 1, 9, 0, 2027)), newYearEve)).toBe('明天 · 2027-01-01')
    expect(formatScheduleDayLabel(new Date(at(1, 5, 9, 0, 2027)), newYearEve)).toBe('周二 · 2027-01-05')
  })
})

const SIDEBAR_WITH_SEARCH = `
  <div data-testid="sidebarColumn">
    <div class="col">
      <div class="search-wrap">
        <div class="fixed">
          <form role="search"><input data-testid="SearchBox_Search_Input" /></form>
          <div role="listbox">搜索建议</div>
        </div>
      </div>
      <div class="placeholder"></div>
      <div class="content"><aside>Premium</aside><section>趋势</section></div>
    </div>
  </div>
`

describe('findScheduledSidebarSlot', () => {
  it('放在搜索框那一块和它下面的空白占位之后', () => {
    document.body.innerHTML = SIDEBAR_WITH_SEARCH
    const slot = findScheduledSidebarSlot(document.querySelector('[data-testid="sidebarColumn"]')!)
    expect(slot).toEqual({ after: document.querySelector('.placeholder') })
  })

  it('没有搜索框时放在第一个正文区块前面', () => {
    document.body.innerHTML = `
      <div data-testid="sidebarColumn"><div class="col">
        <div class="w1"><aside>推荐关注</aside></div>
        <div class="w2"><section>趋势</section></div>
      </div></div>`
    const slot = findScheduledSidebarSlot(document.querySelector('[data-testid="sidebarColumn"]')!)
    expect(slot).toEqual({ before: document.querySelector('.w1') })
  })

  it('右侧栏正文还没加载出来时不放', () => {
    document.body.innerHTML = `
      <div data-testid="sidebarColumn"><div class="col">
        <div class="search-wrap"><form role="search"></form></div>
        <div class="placeholder"></div>
      </div></div>`
    expect(findScheduledSidebarSlot(document.querySelector('[data-testid="sidebarColumn"]')!)).toBeNull()
  })
})

describe('右侧栏排期面板', () => {
  type SidebarModule = typeof import('../../content-scripts/features/scheduled-sidebar')
  let mod: SidebarModule
  let store: Record<string, unknown>
  let writes: Array<Record<string, unknown>>
  let postMessage: MockInstance<(message: unknown, targetOrigin: string) => void>

  const panel = () => document.getElementById('xf-sched-side')
  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  }

  async function mount(items: PersistedScheduledItem[], { autoRefresh = false } = {}) {
    store[KeyScheduledPostsCache] = JSON.stringify(items)
    if (!autoRefresh) localStorage.setItem('xf_sched_side_synced_at', String(Date.now()))
    mod.setScheduledSidebarEnabled(true)
    await mod.updateScheduledSidebar()
    await flush()
  }

  function lastRequestId(): string {
    const calls = postMessage.mock.calls.filter(([data]) => (data as { type?: string }).type === SCHEDULED_FETCH_REQ_TYPE)
    return (calls[calls.length - 1][0] as { requestId: string }).requestId
  }

  function respond(data: Record<string, unknown>) {
    window.dispatchEvent(new MessageEvent('message', {
      source: window,
      data: { type: SCHEDULED_FETCH_RES_TYPE, requestId: lastRequestId(), __xf: XF_BRIDGE_MARKER, ...data },
    }))
  }

  beforeEach(async () => {
    vi.useFakeTimers({ now: NOW })
    vi.resetModules()
    localStorage.clear()
    sessionStorage.clear()
    document.cookie = 'twid=u%3D42'
    document.body.innerHTML = SIDEBAR_WITH_SEARCH
    store = {}
    writes = []
    ;(globalThis as any).browser = {
      runtime: { id: 'test' },
      storage: {
        local: {
          get: async (keys: string | string[]) =>
            Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((k) => [k, store[k]])),
          set: async (data: Record<string, unknown>) => {
            writes.push(data)
            Object.assign(store, data)
          },
          remove: async () => {},
        },
        onChanged: { addListener: () => {} },
      },
    }
    postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {})
    mod = await import('../../content-scripts/features/scheduled-sidebar')
  })

  afterEach(() => {
    mod.setScheduledSidebarEnabled(false)
    postMessage.mockRestore()
    vi.useRealTimers()
  })

  it('插在搜索框下面，按天列出待发布的定时帖', async () => {
    await mount([
      item(at(10, 17, 23, 6), 'ChatGPT 操控浏览器'),
      item(at(10, 18, 8, 48), '国内大模型市场'),
      item(at(10, 18, 9, 39), '蓝 V 订阅成本'),
    ])

    const el = panel()!
    expect(document.querySelector('.placeholder')!.nextElementSibling).toBe(el)
    expect(el.querySelector('.xf-sched-side-count')!.textContent).toBe('3 条')
    expect([...el.querySelectorAll('.xf-sched-side-day-label')].map((n) => n.textContent)).toEqual(['今天 · 10-17', '明天 · 10-18'])
    expect([...el.querySelectorAll('.xf-sched-side-time')].map((n) => n.textContent)).toEqual(['23:06', '08:48', '09:39'])
    expect(el.querySelector('.xf-sched-side-gap.is-tight')!.textContent).toBe('过密 51分钟')
    expect(el.querySelector('.xf-sched-side-link')!.getAttribute('href')).toBe('/compose/post/unsent/scheduled')
  })

  it('正文按文本显示，不当作 HTML 解析', async () => {
    await mount([item(at(10, 17, 23, 0), '<img src=x onerror=alert(1)> 正文')])
    expect(panel()!.querySelector('img')).toBeNull()
    expect(panel()!.querySelector('.xf-sched-side-text')!.textContent).toBe('<img src=x onerror=alert(1)> 正文')
  })

  it('没有定时帖时写明没有', async () => {
    await mount([])
    expect(panel()!.querySelector('.xf-sched-side-empty')!.textContent).toBe('没有待发布的定时帖')
    expect(panel()!.querySelector('.xf-sched-side-count')!.textContent).toBe('0 条')
  })

  it('收起后只留标题行，并记住收起状态', async () => {
    await mount([item(at(10, 17, 23, 6), 'a')])
    panel()!.querySelector<HTMLButtonElement>('[data-action="toggle"]')!.click()
    expect(panel()!.querySelector('.xf-sched-side-body')).toBeNull()
    expect(panel()!.querySelector('[data-action="toggle"]')!.textContent).toBe('展开')
    expect(writes.at(-1)).toEqual({ [KeyScheduledSidebarCollapsed]: 'on' })
  })

  it('点刷新向拦截器请求重新读取，拿到结果后更新列表', async () => {
    await mount([item(at(10, 17, 23, 6), '旧的')])
    panel()!.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.click()
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: SCHEDULED_FETCH_REQ_TYPE, __xf: XF_BRIDGE_MARKER }),
      location.origin,
    )
    expect(panel()!.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.disabled).toBe(true)

    respond({ ok: true, items: [
      { restId: '1', timestamp: at(10, 18, 10, 0), text: '新的一条' },
      { restId: '2', timestamp: at(10, 18, 7, 0), text: '更早的一条' },
    ] })
    await flush()

    expect([...panel()!.querySelectorAll('.xf-sched-side-text')].map((n) => n.textContent)).toEqual(['更早的一条', '新的一条'])
    expect(panel()!.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.disabled).toBe(false)
  })

  it('读取失败时显示原因，原有列表保留', async () => {
    await mount([item(at(10, 17, 23, 6), '保留的')])
    panel()!.querySelector<HTMLButtonElement>('[data-action="refresh"]')!.click()
    respond({ ok: false, error: '请求过于频繁，请稍后重试' })
    await flush()
    expect(panel()!.querySelector('.xf-sched-side-error')!.textContent).toBe('读取失败：请求过于频繁，请稍后重试')
    expect(panel()!.querySelector('.xf-sched-side-text')!.textContent).toBe('保留的')
  })

  it('距上次读取超过 30 分钟时自动读一次，之后不重复', async () => {
    await mount([], { autoRefresh: true })
    const requests = () => postMessage.mock.calls.filter(([data]) => (data as { type?: string }).type === SCHEDULED_FETCH_REQ_TYPE)
    expect(requests()).toHaveLength(1)
    respond({ ok: true, items: [] })
    await flush()
    vi.advanceTimersByTime(2 * 60 * 1000)
    await mod.updateScheduledSidebar()
    expect(requests()).toHaveLength(1)
  })

  it('被页面移除后重新插回；关闭开关后移除', async () => {
    await mount([item(at(10, 17, 23, 6), 'a')])
    panel()!.remove()
    await mod.updateScheduledSidebar()
    expect(panel()).not.toBeNull()

    mod.setScheduledSidebarEnabled(false)
    expect(panel()).toBeNull()
    await mod.updateScheduledSidebar()
    expect(panel()).toBeNull()
  })
})
