import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  parseScheduledTimeString,
  formatTimeAgo,
  formatRelativePublishTime,
  formatDurationGap,
  getIntervalTheme,
  getPickedTimeFromModal,
  findTimezoneSection,
  attachSchedulePickerOverview,
  addScheduledRelativeTimes,
  removeScheduledPanorama,
  listenForScheduledTweetsApi,
  getPersistedScheduledPosts,
} from '../../content-scripts/options/scheduled-time'
import { KeyScheduledPostsCache } from '../../storage-keys'
import { XF_BRIDGE_MARKER } from '../../shared/bridge'

// 记录 storage 写入的内存模拟
export function makeStorageSpy() {
  const store: Record<string, unknown> = {}
  const writes: Array<Record<string, unknown>> = []
  return {
    store,
    writes,
    get: async (keys: string | string[]) => {
      const arr = Array.isArray(keys) ? keys : [keys]
      return arr.reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = store[k]
        return acc
      }, {})
    },
    set: async (data: Record<string, unknown>) => {
      writes.push(data)
      Object.assign(store, data)
    },
    remove: async () => {},
  }
}

describe('scheduled-time utility & Schedule Picker Overview', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.useFakeTimers()
    // 固定测试时间为 2026-08-12 15:50:00 (本地时间)
    vi.setSystemTime(new Date(2026, 7, 12, 15, 50, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('formatRelativePublishTime', () => {
    it('正确计算相对发布时间格式 (例: 41分钟后, 1小时58分钟后, 1天12小时后)', () => {
      const now = new Date(2026, 7, 12, 15, 50, 0)
      expect(formatRelativePublishTime(new Date(2026, 7, 12, 16, 31, 0), now)).toBe('41分钟后')
      expect(formatRelativePublishTime(new Date(2026, 7, 12, 17, 48, 0), now)).toBe('1小时58分钟后')
      expect(formatRelativePublishTime(new Date(2026, 7, 13, 15, 50, 0), now)).toBe('1天后')
      expect(formatRelativePublishTime(new Date(2026, 7, 14, 3, 50, 0), now)).toBe('1天12小时后')
    })
  })

  describe('getPickedTimeFromModal', () => {
    it('正确解析“安排表”弹窗中下拉菜单选中的年月日時分', () => {
      const modal = document.createElement('div')
      modal.innerHTML = `
        <select id="SELECTOR_1"><option value="8" selected>8 月</option></select>
        <select id="SELECTOR_2"><option value="12" selected>12</option></select>
        <select id="SELECTOR_3"><option value="2026" selected>2026</option></select>
        <select id="SELECTOR_4"><option value="17" selected>17</option></select>
        <select id="SELECTOR_5"><option value="04" selected>04</option></select>
      `

      const picked = getPickedTimeFromModal(modal)
      expect(picked).not.toBeNull()
      expect(parsedDateString(picked!)).toBe('2026-8-12 17:4')
    })

    function parsedDateString(date: Date): string {
      return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${date.getMinutes()}`
    }
  })

  describe('attachSchedulePickerOverview 可以在“中国标准时间”下方渲染排期全景面板', () => {
    it('装载 xf-schedule-picker-overview 看板', async () => {
      document.body.innerHTML = `
        <div role="dialog" aria-modal="true">
          <h2 id="modal-header">安排表</h2>
          <div dir="ltr">
            <svg viewBox="0 0 24 24"></svg>
            <span>将于 2026年8月12日周三 下午5:04 发布</span>
          </div>
          <select id="SELECTOR_1"><option value="8" selected>8 月</option></select>
          <select id="SELECTOR_2"><option value="12" selected>12</option></select>
          <select id="SELECTOR_3"><option value="2026" selected>2026</option></select>
          <select id="SELECTOR_4"><option value="17" selected>17</option></select>
          <select id="SELECTOR_5"><option value="4" selected>04</option></select>
          <div class="r-7sv4c2">
            <div>时区</div>
            <div>中国标准时间</div>
          </div>
        </div>
      `

      await attachSchedulePickerOverview()

      const overview = document.querySelector('.xf-schedule-picker-overview')
      expect(overview).not.toBeNull()
      expect(overview?.textContent).toContain('排期全景')
      expect(overview?.textContent).toContain('本次拟发')

      // 验证弹窗顶部的 “将于...发布” 同一行放了相对时间 badge
      const headerBadge = document.querySelector('.xf-modal-header-right-badge')
      expect(headerBadge).not.toBeNull()
      expect(headerBadge?.textContent).toBe('1小时14分钟后')

      // 验证 removeScheduledPanorama 能够清除看板与 badge
      removeScheduledPanorama()
      expect(document.querySelector('.xf-schedule-picker-overview')).toBeNull()
      expect(document.querySelector('.xf-modal-header-right-badge')).toBeNull()
    })
  })

  describe('findTimezoneSection 英文界面的时区区块', () => {
    // 结构对照 2026-10-18 X 排期弹窗的真实层级：正文 4 块（将于… / 日期 / 时间 / 时区）
    function renderEnglishModal(timezoneLabel: string, timezoneName: string) {
      document.body.innerHTML = `
        <div role="dialog" aria-modal="true">
          <div>
            <h2 id="modal-header"><span>Schedule</span></h2>
            <div id="modal-body">
              <div><div dir="ltr"><span>Will send on Sun, Oct 18, 2026 at 3:47 PM</span></div></div>
              <div><div role="group">
                <div><span>Date</span></div>
                <div>
                  <div><span>Month</span><select id="SELECTOR_1"><option value="10" selected>October</option></select></div>
                  <div><span>Day</span><select id="SELECTOR_2"><option value="18" selected>18</option></select></div>
                  <div><span>Year</span><select id="SELECTOR_3"><option value="2026" selected>2026</option></select></div>
                </div>
              </div></div>
              <div><div role="group">
                <div><span>Time</span></div>
                <div>
                  <div><span>Hour</span><select id="SELECTOR_4"><option value="15" selected>3</option></select><svg></svg></div>
                  <div><span>Minute</span><select id="SELECTOR_5"><option value="47" selected>47</option></select></div>
                </div>
              </div><div></div></div>
              <div id="tz-section"><div dir="ltr"><span>${timezoneLabel}</span></div><div dir="ltr"><span>${timezoneName}</span></div></div>
            </div>
          </div>
        </div>
      `
      return document.querySelector('[role="dialog"]')!
    }

    it('时区名称是本机时区的英文全称时，按名称找到', () => {
      const localName = new Intl.DateTimeFormat('en', { timeZoneName: 'long' })
        .formatToParts(new Date())
        .find((part) => part.type === 'timeZoneName')!.value
      const modal = renderEnglishModal('Time zone', localName)
      expect(findTimezoneSection(modal)?.id).toBe('tz-section')
    })

    it('夏令时名称（如 British Summer Time）认不出时，按位置找到「时间」后面那一块', () => {
      const modal = renderEnglishModal('Time zone', 'British Summer Time')
      expect(findTimezoneSection(modal)?.id).toBe('tz-section')
    })

    it('排期全景插在英文时区区块后面', async () => {
      renderEnglishModal('Time zone', 'Pacific Daylight Time')
      await attachSchedulePickerOverview()
      expect(document.getElementById('tz-section')?.nextElementSibling?.classList.contains('xf-schedule-picker-overview')).toBe(true)
      removeScheduledPanorama()
    })
  })

  describe('listenForScheduledTweetsApi (FetchScheduledTweets 拦截持久化)', () => {
    beforeEach(() => {
      const storage = makeStorageSpy()
      ;(globalThis as any).browser = { storage: { local: storage } }
      listenForScheduledTweetsApi()
    })

    function dispatchScheduledPayload(payload: unknown) {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: window,
          data: { type: 'XF_SCHEDULED_TWEETS', payload, __xf: XF_BRIDGE_MARKER },
        }),
      )
    }

    it('将 API 完整数据持久化（按时间升序 + 格式化时间）', async () => {
      dispatchScheduledPayload([
        {
          restId: 'b',
          timestamp: 1786549440000,
          text: 'Antigravity 升到 2.7.1',
        },
        {
          restId: 'a',
          timestamp: 1786533060000,
          text: '这几个网站让我找回了小时候的感觉',
        },
      ])

      await vi.advanceTimersByTimeAsync(0)

      const lastWrite = (globalThis as any).browser.storage.local.writes.at(-1)
      const raw = lastWrite?.[KeyScheduledPostsCache]
      expect(typeof raw).toBe('string')

      const items = JSON.parse(raw)
      expect(items).toHaveLength(2)
      // 按 timestamp 升序
      expect(items[0].restId).toBe('a')
      expect(items[1].restId).toBe('b')
      // 完整正文不再截断
      expect(items[0].text).toContain('小时候的感觉')
      // 格式化时间为 YYYY-MM-DD HH:mm
      expect(items[0].formattedTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
    })

    it('接口返回空列表时清空缓存（允许空数组持久化）', async () => {
      dispatchScheduledPayload([])
      await vi.advanceTimersByTimeAsync(0)

      const lastWrite = (globalThis as any).browser.storage.local.writes.at(-1)
      expect(lastWrite?.[KeyScheduledPostsCache]).toBe('[]')
    })

    it('非数组 payload 被忽略，不写入 storage', async () => {
      dispatchScheduledPayload({ data: { viewer: {} } })
      await vi.advanceTimersByTimeAsync(0)

      expect((globalThis as any).browser.storage.local.writes).toHaveLength(0)
    })

    it('未携带桥接标记的广播被忽略（防止其他脚本伪造）', async () => {
      // 与拦截器同 type，但缺少 __xf 标记 → 监听端必须拒绝
      window.dispatchEvent(
        new MessageEvent('message', {
          source: window,
          data: {
            type: 'XF_SCHEDULED_TWEETS',
            payload: [{ restId: 'x', timestamp: Date.now() + 10000, text: '伪造' }],
          },
        }),
      )
      await vi.advanceTimersByTimeAsync(0)

      expect((globalThis as any).browser.storage.local.writes).toHaveLength(0)
    })
  })

  describe('getPersistedScheduledPosts sessionStorage 回退', () => {
    it('storage 为空时回退读取拦截器写入的条目快照', async () => {
      ;(globalThis as any).browser = { storage: { local: makeStorageSpy() } }
      sessionStorage.setItem(
        'xf_scheduled_items_last',
        JSON.stringify([
          { restId: 'x', timestamp: 1786533060000, text: '快照正文' },
          { restId: 'y', timestamp: 1786549440000, text: '第二条' },
        ]),
      )

      const items = await getPersistedScheduledPosts()
      expect(items).toHaveLength(2)
      expect(items[0].restId).toBe('x')
      expect(items[0].text).toBe('快照正文')
      expect(items[0].formattedTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
      // 按时间升序
      expect(items[0].timestamp).toBeLessThan(items[1].timestamp)

      sessionStorage.removeItem('xf_scheduled_items_last')
    })
  })
})
