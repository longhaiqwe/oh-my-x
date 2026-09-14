import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import { KeyScheduledPostsCache, KeyScheduledPanorama } from '../../storage-keys'
import { XF_BRIDGE_MARKER, SCHEDULED_TWEETS_TYPE } from '../../shared/bridge'
import { getStorage, setStorage } from '../utilities/storage'

dayjs.extend(relativeTime)

export type DateInput = string | number | Date | dayjs.Dayjs

export interface IntervalTheme {
  category: 'first_soon' | 'first_normal' | 'tight' | 'normal' | 'moderate' | 'long'
  label: string
  bg: string
  accentColor: string
  borderColor: string
  badgeBg: string
}

export interface PersistedScheduledItem {
  restId?: string
  timestamp: number
  formattedTime: string
  text: string
}

/**
 * 格式化相对发布时间
 * 例：43分钟后、1小时后、1小时15分钟后、1天12小时后
 */
export function formatRelativePublishTime(targetDate: Date, now: Date = new Date()): string {
  const diffMs = targetDate.getTime() - now.getTime()
  if (diffMs <= 0) return '即将发布'

  const totalMinutes = Math.floor(diffMs / (60 * 1000))
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const mins = totalMinutes % 60

  if (days > 0) {
    return hours > 0 ? `${days}天${hours}小时后` : `${days}天后`
  }
  if (hours > 0) {
    return mins > 0 ? `${hours}小时${mins}分钟后` : `${hours}小时后`
  }
  if (mins > 0) {
    return `${mins}分钟后`
  }
  return '1分钟内'
}

/**
 * 兼容导出：格式化相对时间
 */
export function formatTimeAgo(inputTime: DateInput | null | undefined): string {
  if (inputTime === null || inputTime === undefined || inputTime === '')
    return ''

  const formattedTime = dayjs(inputTime)
  if (!formattedTime.isValid())
    return ''

  return formatRelativePublishTime(formattedTime.toDate())
}

/**
 * 将毫秒时间间隔转为易读中文（如：30分钟、1小时15分、1天2小时）
 */
export function formatDurationGap(ms: number): string {
  if (ms < 0) ms = 0
  const totalMinutes = Math.floor(ms / (60 * 1000))
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const mins = totalMinutes % 60

  if (days > 0) {
    return hours > 0 ? `${days}天${hours}小时` : `${days}天`
  }
  if (hours > 0) {
    return mins > 0 ? `${hours}小时${mins}分` : `${hours}小时`
  }
  return `${mins}分钟`
}

/**
 * 根据是否为首条及时间间隔获取视觉配色主题
 */
export function getIntervalTheme(isFirst: boolean, gapMs: number): IntervalTheme {
  if (isFirst) {
    const hoursFromNow = gapMs / (3600 * 1000)
    if (hoursFromNow <= 2) {
      return {
        category: 'first_soon',
        label: '即将发布',
        bg: 'rgba(16, 185, 129, 0.08)',
        accentColor: 'rgb(16, 185, 129)',
        borderColor: '#10b981',
        badgeBg: 'rgba(16, 185, 129, 0.15)',
      }
    }
    return {
      category: 'first_normal',
      label: '首条排期',
      bg: 'rgba(14, 165, 233, 0.07)',
      accentColor: 'rgb(14, 165, 233)',
      borderColor: '#0ea5e9',
      badgeBg: 'rgba(14, 165, 233, 0.15)',
    }
  }

  const gapHours = gapMs / (3600 * 1000)

  if (gapHours < 2) {
    // 间隔过密 (< 2 小时) -> 警示琥珀橙
    return {
      category: 'tight',
      label: '间隔过密',
      bg: 'rgba(245, 158, 11, 0.09)',
      accentColor: 'rgb(245, 158, 11)',
      borderColor: '#f59e0b',
      badgeBg: 'rgba(245, 158, 11, 0.18)',
    }
  }

  if (gapHours < 8) {
    // 正常间隔 (2 - 8 小时) -> 清新蓝
    return {
      category: 'normal',
      label: '正常间隔',
      bg: 'rgba(59, 130, 246, 0.07)',
      accentColor: 'rgb(59, 130, 246)',
      borderColor: '#3b82f6',
      badgeBg: 'rgba(59, 130, 246, 0.15)',
    }
  }

  if (gapHours < 24) {
    // 半天/跨夜 (8 - 24 小时) -> 靛蓝
    return {
      category: 'moderate',
      label: '半天/跨夜',
      bg: 'rgba(99, 102, 241, 0.07)',
      accentColor: 'rgb(99, 102, 241)',
      borderColor: '#6366f1',
      badgeBg: 'rgba(99, 102, 241, 0.15)',
    }
  }

  // 跨日间隔 (>= 24 小时) -> 紫罗兰
  return {
    category: 'long',
    label: '跨日间隔',
    bg: 'rgba(168, 85, 247, 0.08)',
    accentColor: 'rgb(168, 85, 247)',
    borderColor: '#a855f7',
    badgeBg: 'rgba(168, 85, 247, 0.15)',
  }
}

/**
 * 解析排期推文文本中的发布时间
 */
export function parseScheduledTimeString(text: string): Date | null {
  if (!text) return null

  // 1. 中文格式
  const cnMatch = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?(?:\s*周[一二三四五六日])?\s*(上午|下午|凌晨|中午|晚上|AM|PM)?\s*(\d{1,2}):(\d{2})/i)
  if (cnMatch) {
    const year = parseInt(cnMatch[1], 10)
    const month = parseInt(cnMatch[2], 10) - 1
    const day = parseInt(cnMatch[3], 10)
    const period = cnMatch[4] ? cnMatch[4].toUpperCase() : ''
    let hour = parseInt(cnMatch[5], 10)
    const minute = parseInt(cnMatch[6], 10)

    if (period === '下午' || period === '晚上' || period === 'PM') {
      if (hour < 12) hour += 12
    } else if (period === '上午' || period === '凌晨' || period === 'AM') {
      if (hour === 12) hour = 0
    } else if (period === '中午') {
      if (hour < 12 && hour !== 12) hour += 12
    }

    const date = new Date(year, month, day, hour, minute, 0)
    if (!isNaN(date.getTime())) return date
  }

  // 2. 英文格式
  const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
  const enMatch = text.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2}),?\s+(\d{4})\s+(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?/i)
  if (enMatch) {
    const month = months[enMatch[1].toLowerCase()]
    const day = parseInt(enMatch[2], 10)
    const year = parseInt(enMatch[3], 10)
    let hour = parseInt(enMatch[4], 10)
    const minute = parseInt(enMatch[5], 10)
    const period = enMatch[6] ? enMatch[6].toUpperCase() : ''

    if (period === 'PM' && hour < 12) hour += 12
    if (period === 'AM' && hour === 12) hour = 0

    const date = new Date(year, month, day, hour, minute, 0)
    if (!isNaN(date.getTime())) return date
  }

  // 3. 标准 ISO / YYYY-MM-DD HH:mm 格式
  const isoMatch = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})/)
  if (isoMatch) {
    const date = new Date(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10), parseInt(isoMatch[4], 10), parseInt(isoMatch[5], 10))
    if (!isNaN(date.getTime())) return date
  }

  return null
}

/**
 * 读取持久化保存的排期列表缓存。
 * 优先读 chrome.storage.local；为空时回退读 MAIN world 拦截器写入的
 * sessionStorage 条目快照（postMessage → storage 链路丢失/晚注册时兜底）。
 */
export async function getPersistedScheduledPosts(): Promise<PersistedScheduledItem[]> {
  // 1. chrome.storage.local 缓存
  try {
    const raw = await getStorage(KeyScheduledPostsCache)
    if (typeof raw === 'string' && raw) {
      const items = JSON.parse(raw) as PersistedScheduledItem[]
      if (Array.isArray(items)) return items
    }
  } catch {}

  // 2. sessionStorage 快照回退
  try {
    const snapshot = sessionStorage.getItem('xf_scheduled_items_last')
    if (snapshot) {
      const raw = JSON.parse(snapshot) as Array<{ restId: string; timestamp: number; text: string }>
      if (Array.isArray(raw)) {
        return raw
          .filter((item) => typeof item.timestamp === 'number' && !isNaN(item.timestamp))
          .map((item) => ({
            restId: item.restId,
            timestamp: item.timestamp,
            formattedTime: dayjs(new Date(item.timestamp)).format('YYYY-MM-DD HH:mm'),
            text: item.text,
          }))
          .sort((a, b) => a.timestamp - b.timestamp)
      }
    }
  } catch {}

  return []
}

/**
 * 持久化保存排期列表缓存
 */
export async function persistScheduledPosts(items: PersistedScheduledItem[]) {
  try {
    await setStorage({ [KeyScheduledPostsCache]: JSON.stringify(items) })
  } catch {}
}

/**
 * 自动清理已到期/过去的时间戳项
 */
export async function prunePastScheduledPosts() {
  try {
    const raw = await getStorage(KeyScheduledPostsCache)
    if (typeof raw === 'string' && raw) {
      const items = JSON.parse(raw) as PersistedScheduledItem[]
      if (Array.isArray(items) && items.length) {
        const now = Date.now()
        const valid = items.filter((item) => item.timestamp > now)
        if (valid.length !== items.length) {
          await persistScheduledPosts(valid)
        }
      }
    }
  } catch {}
}

let lastScheduledPruneAt = 0
const SCHEDULED_PRUNE_INTERVAL_MS = 60 * 1000

export function maintainScheduledPostsCache(): void {
  const now = Date.now()
  if (now - lastScheduledPruneAt < SCHEDULED_PRUNE_INTERVAL_MS) return
  lastScheduledPruneAt = now
  void prunePastScheduledPosts()
}

/**
 * 监听来自 MAIN world fetch 拦截器的 postMessage，
 * 接收到 FetchScheduledTweets API 完整数据后持久化到 storage。
 * 应在插件初始化时调用一次。
 */
export function listenForScheduledTweetsApi() {
  // 与主世界拦截器共用同一个调试开关：window.__XF_DEBUG_SCHEDULED__
  const debug = () =>
    !!(window as unknown as { __XF_DEBUG_SCHEDULED__?: boolean }).__XF_DEBUG_SCHEDULED__

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    if (!event.data || event.data.type !== SCHEDULED_TWEETS_TYPE) return
    // 仅接受本扩展 MAIN 拦截器的广播（携带桥接标记），忽略其他脚本的同名消息
    if (event.data.__xf !== XF_BRIDGE_MARKER) return

    try {
      const raw = event.data.payload as Array<{
        restId: string
        timestamp: number
        text: string
      }>
      if (!Array.isArray(raw)) return

      if (debug()) console.log('[X Focus 排期持久化] 收到广播', raw.length, '条', raw)

      // 允许空数组：接口返回空列表时同样持久化，清掉已删除排期的旧缓存
      const items: PersistedScheduledItem[] = raw
        .filter((item) => typeof item.timestamp === 'number' && !isNaN(item.timestamp))
        .map((item) => ({
          restId: item.restId,
          timestamp: item.timestamp,
          formattedTime: dayjs(new Date(item.timestamp)).format('YYYY-MM-DD HH:mm'),
          text: item.text,
        }))
        .sort((a, b) => a.timestamp - b.timestamp)

      void persistScheduledPosts(items).then(() => {
        if (debug()) console.log('[X Focus 排期持久化] 已写入 storage', items.length, '条')
      })
    } catch (e) {
      if (debug()) console.warn('[X Focus 排期持久化] 处理失败', e)
    }
  })
}

/**
 * 根据排期文本计算相对时间字符串
 */
export function getScheduledRelativeTime(text: string): string | null {
  const date = parseScheduledTimeString(text)
  if (!date) return null
  return formatRelativePublishTime(date)
}

/**
 * 清除页面上由排期全景功能注入的所有 DOM 元素与样式
 */
export function removeScheduledPanorama() {
  document.querySelectorAll('.xf-schedule-picker-overview').forEach((el) => el.remove())
  document.querySelectorAll('.xf-modal-header-right-badge').forEach((el) => el.remove())
  document.querySelectorAll('.xf-scheduled-right-box').forEach((el) => el.remove())
  document.querySelectorAll('[data-testid="unsentTweet"]').forEach((card) => {
    const cardEl = card as HTMLElement
    cardEl.style.backgroundColor = ''
    cardEl.style.borderTop = ''
    cardEl.style.borderBottom = ''
    delete cardEl.dataset.xfLayoutStyled
  })
}

/**
 * 在每个排期帖子右上角（同一行，两端对齐）展示相对时间
 * 持久化数据由 listenForScheduledTweetsApi() 通过 API 拦截完成，此处不再重复写入
 */
export async function addScheduledRelativeTimes(state?: string | number | boolean) {
  try {
    if (state === 'off' || state === 'hide') {
      removeScheduledPanorama()
      return
    }
    if (state === undefined) {
      const stored = await getStorage(KeyScheduledPanorama)
      if (stored === 'off' || stored === 'hide') {
        removeScheduledPanorama()
        return
      }
    }
    const unsentTweets = document.querySelectorAll('[data-testid="unsentTweet"]')
    if (unsentTweets.length) {
      const scheduledItems: Array<{ card: HTMLElement, date: Date, textSpan: Element }> = []

      unsentTweets.forEach((card) => {
        const cardEl = card as HTMLElement
        const textSpan = Array.from(cardEl.querySelectorAll('span, div')).find(el => {
          return el.children.length === 0 && (el.textContent?.includes('将于') || el.textContent?.includes('Will send on'))
        })

        if (!textSpan) return

        const textContent = textSpan.textContent || ''
        const date = parseScheduledTimeString(textContent)
        if (date) {
          scheduledItems.push({ card: cardEl, date, textSpan })
        }
      })

      if (scheduledItems.length) {
        // 按发布时间从早到晚排序
        scheduledItems.sort((a, b) => a.date.getTime() - b.date.getTime())

        const now = new Date()

        scheduledItems.forEach((item, index) => {
          const { card, date, textSpan } = item
          // eslint-disable-next-line @typescript-eslint/no-unused-vars

          const isFirst = index === 0
          const prevDate = isFirst ? null : scheduledItems[index - 1].date
          const gapMs = isFirst ? Math.max(0, date.getTime() - now.getTime()) : Math.max(0, date.getTime() - (prevDate?.getTime() ?? now.getTime()))

          const theme = getIntervalTheme(isFirst, gapMs)
          const relTimeStr = formatRelativePublishTime(date, now)
          const gapStr = isFirst ? '' : formatDurationGap(gapMs)

          card.style.backgroundColor = theme.bg
          card.style.borderTop = `1px solid ${theme.borderColor}55`
          card.style.borderBottom = `1px solid ${theme.borderColor}55`
          card.style.transition = 'background-color 0.2s ease, border-color 0.2s ease'

          if (card.parentElement && card.parentElement.tagName === 'BUTTON') {
            const btn = card.parentElement as HTMLElement
            btn.style.backgroundColor = 'transparent'
          }

          const dirEl = (textSpan.closest('div[dir="ltr"]') || textSpan.parentElement) as HTMLElement
          const leftBox = (dirEl.parentElement as HTMLElement) || dirEl
          const topRow = (leftBox.parentElement as HTMLElement) || leftBox

          // 布局样式每 tick 相同，只在首次设置一次，避免 cssText += 无限增长
          if (!card.dataset.xfLayoutStyled) {
            card.dataset.xfLayoutStyled = '1'
            topRow.style.cssText += 'display: flex !important; flex-direction: row !important; justify-content: space-between !important; align-items: center !important; width: 100% !important;'
            leftBox.style.cssText += 'display: inline-flex !important; align-items: center !important; flex-shrink: 1 !important; overflow: hidden !important;'
            dirEl.style.cssText += 'display: inline-flex !important; align-items: center !important; gap: 4px !important;'
          }

          if (topRow.parentElement && topRow.parentElement !== card) {
            (topRow.parentElement as HTMLElement).style.width = '100%'
          }

          let rightBox = topRow.querySelector('.xf-scheduled-right-box') as HTMLElement | null
          if (!rightBox) {
            rightBox = document.createElement('div')
            rightBox.className = 'xf-scheduled-right-box'
            topRow.appendChild(rightBox)
          }

          rightBox.style.cssText = `
            display: inline-flex !important;
            align-items: center !important;
            gap: 6px !important;
            margin-left: auto !important;
            flex-shrink: 0 !important;
            white-space: nowrap !important;
          `

          let relBadge = rightBox.querySelector('.xf-scheduled-relative-text') as HTMLElement | null
          if (!relBadge) {
            relBadge = document.createElement('span')
            relBadge.className = 'xf-scheduled-relative-text'
            rightBox.appendChild(relBadge)
          }

          relBadge.style.cssText = `
            display: inline-block !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            color: ${theme.accentColor} !important;
            background-color: ${theme.badgeBg} !important;
            border: 1px solid ${theme.borderColor}44 !important;
            padding: 2px 8px !important;
            border-radius: 12px !important;
            line-height: 16px !important;
            white-space: nowrap !important;
          `
          relBadge.textContent = relTimeStr

          let gapBadge = rightBox.querySelector('.xf-scheduled-gap-badge') as HTMLElement | null
          if (isFirst) {
            if (gapBadge) gapBadge.remove()
          } else {
            if (!gapBadge) {
              gapBadge = document.createElement('span')
              gapBadge.className = 'xf-scheduled-gap-badge'
              rightBox.appendChild(gapBadge)
            }
            const gapText = theme.category === 'tight' ? `⚠️ 距上一条 ${gapStr}` : `距上一条 ${gapStr}`
            gapBadge.style.cssText = `
              display: inline-block !important;
              font-size: 11px !important;
              font-weight: 600 !important;
              color: ${theme.accentColor} !important;
              background-color: ${theme.badgeBg} !important;
              border: 1px dashed ${theme.borderColor}88 !important;
              padding: 2px 6px !important;
              border-radius: 10px !important;
              line-height: 16px !important;
              white-space: nowrap !important;
            `
            gapBadge.textContent = gapText
          }
        })
      }
    }

    // 同时尝试检测并装载“安排表”选时间弹窗看板
    void attachSchedulePickerOverview()
  } catch {}
}

/**
 * 解析“安排表”弹窗中当前选中的 Date
 */
export function getPickedTimeFromModal(modal: Element): Date | null {
  try {
    const selYear = modal.querySelector('#SELECTOR_3') as HTMLSelectElement | null
    const selMonth = modal.querySelector('#SELECTOR_1') as HTMLSelectElement | null
    const selDay = modal.querySelector('#SELECTOR_2') as HTMLSelectElement | null
    const selHour = modal.querySelector('#SELECTOR_4') as HTMLSelectElement | null
    const selMinute = modal.querySelector('#SELECTOR_5') as HTMLSelectElement | null

    if (selYear?.value && selMonth?.value && selDay?.value && selHour?.value !== undefined && selMinute?.value !== undefined) {
      const y = parseInt(selYear.value, 10)
      const m = parseInt(selMonth.value, 10) - 1
      const d = parseInt(selDay.value, 10)
      const h = parseInt(selHour.value, 10)
      const min = parseInt(selMinute.value, 10)
      const dt = new Date(y, m, d, h, min, 0)
      if (!isNaN(dt.getTime())) return dt
    }

    const dateInput = modal.querySelector('input[type="date"]') as HTMLInputElement | null
    const timeInput = modal.querySelector('input[type="time"]') as HTMLInputElement | null
    if (dateInput?.value && timeInput?.value) {
      const [y, m, d] = dateInput.value.split('-').map(Number)
      const [h, min] = timeInput.value.split(':').map(Number)
      const dt = new Date(y, m - 1, d, h, min, 0)
      if (!isNaN(dt.getTime())) return dt
    }

    const headerText = modal.querySelector('.r-7sv4c2 div[dir="ltr"]')?.textContent || modal.textContent || ''
    return parseScheduledTimeString(headerText)
  } catch {
    return null
  }
}

/**
 * 在“安排表”选时间弹窗下装载“排期全景 (全景分布看板)”
 */
export async function attachSchedulePickerOverview() {
  try {
    const stored = await getStorage(KeyScheduledPanorama)
    if (stored === 'off' || stored === 'hide') {
      removeScheduledPanorama()
      return
    }

    const modals = Array.from(document.querySelectorAll('div[role="dialog"], div[aria-modal="true"]'))
    const scheduleModal = modals.find((modal) => {
      const headerText = modal.querySelector('#modal-header')?.textContent || modal.textContent || ''
      return (headerText.includes('安排表') || headerText.includes('Schedule')) && modal.querySelector('#SELECTOR_1, #SELECTOR_4, input[type="date"]')
    }) as HTMLElement | null

    if (!scheduleModal) return

    // 寻找“中国标准时间”对应的容器
    const timezoneSpan = Array.from(scheduleModal.querySelectorAll('span, div')).find((el) => {
      return el.children.length === 0 && (el.textContent?.includes('中国标准时间') || el.textContent?.includes('Standard Time') || el.textContent?.includes('时区'))
    })

    const timezoneSection = (timezoneSpan?.closest('.r-7sv4c2') || timezoneSpan?.parentElement?.parentElement) as HTMLElement | null
    if (!timezoneSection) return

    let overviewContainer = scheduleModal.querySelector('.xf-schedule-picker-overview') as HTMLElement | null
    if (!overviewContainer) {
      overviewContainer = document.createElement('div')
      overviewContainer.className = 'xf-schedule-picker-overview'
      timezoneSection.insertAdjacentElement('afterend', overviewContainer)

      // 绑定表单变动监听，实现实时变动重绘
      const handleModalChange = () => renderSchedulePickerOverview(scheduleModal, overviewContainer!)
      scheduleModal.querySelectorAll('select, input').forEach((input) => {
        input.addEventListener('change', handleModalChange)
        input.addEventListener('input', handleModalChange)
      })
    }

    await renderSchedulePickerOverview(scheduleModal, overviewContainer)
  } catch {}
}

/**
 * 渲染“安排表”看板的核心逻辑
 */
async function renderSchedulePickerOverview(modal: HTMLElement, container: HTMLElement) {
  const pickedDate = getPickedTimeFromModal(modal)
  const cachedItems = await getPersistedScheduledPosts()
  const now = new Date()

  // 1. 在弹窗顶部的 “将于 2026年X月X日...发布” 同一行添加/更新两端分散对齐的相对时间 Badge
  const headerSpan = Array.from(modal.querySelectorAll('span, div')).find((el) => {
    return el.children.length === 0 && (el.textContent?.includes('将于') || el.textContent?.includes('Will send on'))
  })

  if (headerSpan && pickedDate) {
    const headerDir = (headerSpan.closest('div[dir="ltr"]') || headerSpan.parentElement) as HTMLElement
    if (headerDir) {
      // 只设置一次：本函数会被动态循环高频调用，每次 += 会让 cssText 无限增长
      if (!headerDir.dataset.xfHeaderStyled) {
        headerDir.style.cssText += 'display: flex !important; flex-direction: row !important; justify-content: space-between !important; align-items: center !important; width: 100% !important;'
        headerDir.dataset.xfHeaderStyled = '1'
      }

      if (!headerDir.querySelector('.xf-modal-header-left')) {
        const leftSpan = document.createElement('span')
        leftSpan.className = 'xf-modal-header-left'
        leftSpan.style.cssText = 'display: inline-flex; align-items: center; gap: 4px;'
        while (headerDir.firstChild) {
          leftSpan.appendChild(headerDir.firstChild)
        }
        headerDir.appendChild(leftSpan)
      }

      let rightBadge = headerDir.querySelector('.xf-modal-header-right-badge') as HTMLElement | null
      if (!rightBadge) {
        rightBadge = document.createElement('span')
        rightBadge.className = 'xf-modal-header-right-badge'
        headerDir.appendChild(rightBadge)
      }

      const relStr = formatRelativePublishTime(pickedDate, now)
      rightBadge.style.cssText = `
        display: inline-block !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        color: rgb(29, 155, 240) !important;
        background-color: rgba(29, 155, 240, 0.12) !important;
        border: 1px solid rgba(29, 155, 240, 0.3) !important;
        padding: 2px 8px !important;
        border-radius: 12px !important;
        white-space: nowrap !important;
        margin-left: auto !important;
      `
      rightBadge.textContent = relStr
    }
  }

  // 整理所有排期节点 (包含历史缓存 + 当前选定的拟排期)
  interface CombinedNode {
    date: Date
    isNewPicked: boolean
    text: string
  }

  const nodes: CombinedNode[] = cachedItems
    .map((item) => ({ date: new Date(item.timestamp), isNewPicked: false, text: item.text }))
    .filter((item) => !isNaN(item.date.getTime()))

  if (pickedDate) {
    nodes.push({
      date: pickedDate,
      isNewPicked: true,
      text: '[本次拟安排推文]',
    })
  }

  // 按时间升序排序
  nodes.sort((a, b) => a.date.getTime() - b.date.getTime())

  // 计算当前选定节点在排期队列中的索引与前后间隔
  const pickedIndex = nodes.findIndex((n) => n.isNewPicked)

  // 渲染节点列表
  let timelineItemsHtml = ''
  nodes.forEach((node, idx) => {
    const isFirst = idx === 0
    const prevNode = isFirst ? null : nodes[idx - 1]
    const gapMs = isFirst ? Math.max(0, node.date.getTime() - now.getTime()) : Math.max(0, node.date.getTime() - (prevNode?.date.getTime() ?? now.getTime()))

    const theme = getIntervalTheme(isFirst, gapMs)
    const relTime = formatRelativePublishTime(node.date, now)
    const gapStr = isFirst ? '' : formatDurationGap(gapMs)
    const dateStr = dayjs(node.date).format('YYYY-MM-DD HH:mm')

    // 节点间连接指示器
    if (idx > 0) {
      const isTight = gapMs < 2 * 3600 * 1000
      const connectorColor = isTight ? '#d97706' : '#657786'
      const connectorText = gapStr

      timelineItemsHtml += `
        <div style="display:flex; align-items:center; gap:6px; margin: 3px 0 3px 18px; font-size:11px; font-weight:600; color:${connectorColor};">
          <span style="border-left: 2px dashed ${connectorColor}; height: 14px; display: inline-block;"></span>
          <span>${connectorText}</span>
        </div>
      `
    }

    if (node.isNewPicked) {
      const chipPos = `<span style="display: inline-flex !important; align-items: center !important; justify-content: center !important; height: 22px !important; box-sizing: border-box !important; background: rgba(29, 155, 240, 0.2); color: rgb(29, 155, 240); padding: 0 8px !important; border-radius: 10px; font-size: 11px; font-weight: 700; white-space: nowrap;">#${pickedIndex + 1}</span>`

      timelineItemsHtml += `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:9px 14px; background:rgba(29,155,240,0.14); border:2px solid rgb(29,155,240); border-radius:10px; box-shadow: 0 2px 8px rgba(29,155,240,0.2);">
          <div style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; flex:1; overflow:hidden;">
            <span style="display: inline-flex !important; align-items: center !important; justify-content: center !important; height: 22px !important; box-sizing: border-box !important; font-size: 12px !important; font-weight: 700 !important; color: rgb(29, 155, 240) !important; background: rgba(29, 155, 240, 0.2) !important; padding: 0 8px !important; border-radius: 10px !important; border: 1px solid rgba(29, 155, 240, 0.4) !important; white-space: nowrap !important;">${relTime}</span>
            <span style="display: inline-flex !important; align-items: center !important; justify-content: center !important; height: 22px !important; box-sizing: border-box !important; font-size: 12px !important; font-weight: 700 !important; color: #fff !important; background: rgb(29, 155, 240) !important; padding: 0 8px !important; border-radius: 10px !important; border: 1px solid rgb(29, 155, 240) !important; white-space: nowrap !important;">本次拟发</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px; margin-left:12px; white-space:nowrap;">
            ${chipPos}
            <span style="display: inline-flex !important; align-items: center !important; line-height: 1 !important; font-size:12px; color:var(--color-text-secondary, #536471); font-family: monospace, sans-serif;">${dateStr}</span>
          </div>
        </div>
      `
    } else {
      timelineItemsHtml += `
        <div style="display:flex; align-items:center; justify-content:space-between; padding:9px 14px; background:${theme.bg}; border:1px solid ${theme.borderColor}55; border-radius:8px;">
          <div style="display:flex; align-items:center; gap:10px; font-size:13px; color:var(--color-text-primary, #0f1419); flex:1; overflow:hidden;">
            <span style="display: inline-flex !important; align-items: center !important; justify-content: center !important; line-height: 1 !important; font-size:12px; font-weight:700; color:${theme.accentColor}; background:${theme.badgeBg}; padding:3px 8px; border-radius:10px; border:1px solid ${theme.borderColor}33; white-space:nowrap;">${relTime}</span>
            <span style="display: inline-flex !important; align-items: center !important; line-height: 1.2 !important; font-size:12px; color:var(--color-text-secondary, #536471); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${node.text}</span>
          </div>
          <span style="display: inline-flex !important; align-items: center !important; line-height: 1 !important; font-size:12px; color:var(--color-text-secondary, #536471); font-family: monospace, sans-serif; white-space:nowrap; margin-left:12px;">${dateStr}</span>
        </div>
      `
    }
  })

  container.style.cssText = `
    margin-top: 8px !important;
    padding: 10px 12px !important;
    background-color: transparent !important;
    border: 1px solid rgba(29, 155, 240, 0.25) !important;
    border-radius: 12px !important;
    box-sizing: border-box !important;
    width: 100% !important;
  `

  const html = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px solid rgba(255, 255, 255, 0.12);">
      <div style="display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; color: rgb(29, 155, 240);">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 4V3h2v1h6V3h2v1h1.5C19.89 4 21 5.12 21 6.5v12c0 1.38-1.11 2.5-2.5 2.5h-13C4.12 21 3 19.88 3 18.5v-12C3 5.12 4.12 4 5.5 4H7zm0 2H5.5c-.27 0-.5.22-.5.5v12c0 .28.23.5.5.5h13c.28 0 .5-.22.5-.5v-12c0-.28-.22-.5-.5-.5H17v1h-2V6H9v1H7V6z"/>
        </svg>
        <span>排期全景</span>
      </div>
      <span style="font-size: 12px; font-weight: 600; color: #8b98a5; background: rgba(255, 255, 255, 0.08); padding: 3px 10px; border-radius: 12px; white-space: nowrap;">
        共 ${cachedItems.length}${pickedDate ? ' <span style="color: rgb(29, 155, 240); font-weight: 700; background: rgba(29, 155, 240, 0.18); padding: 1px 6px; border-radius: 8px; margin: 0 2px;">+1</span>' : ''} 条
      </span>
    </div>

    <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:3px; margin-bottom:6px; padding:0 2px;">
      <span style="font-size:10px; color:#8b98a5; font-weight:600; margin-right:2px; white-space:nowrap;">间隔阈值</span>
      <span style="display:inline-flex; align-items:center; gap:3px; font-size:10px; font-weight:600; color:rgb(245,158,11); white-space:nowrap;">
        <span style="width:7px; height:7px; border-radius:50%; background:rgb(245,158,11); display:inline-block; flex-shrink:0;"></span>过密 &lt;2h
      </span>
      <span style="color:#ccc; font-size:10px; line-height:1;">·</span>
      <span style="display:inline-flex; align-items:center; gap:3px; font-size:10px; font-weight:600; color:rgb(59,130,246); white-space:nowrap;">
        <span style="width:7px; height:7px; border-radius:50%; background:rgb(59,130,246); display:inline-block; flex-shrink:0;"></span>正常 2–8h
      </span>
      <span style="color:#ccc; font-size:10px; line-height:1;">·</span>
      <span style="display:inline-flex; align-items:center; gap:3px; font-size:10px; font-weight:600; color:rgb(99,102,241); white-space:nowrap;">
        <span style="width:7px; height:7px; border-radius:50%; background:rgb(99,102,241); display:inline-block; flex-shrink:0;"></span>跨夜 8–24h
      </span>
      <span style="color:#ccc; font-size:10px; line-height:1;">·</span>
      <span style="display:inline-flex; align-items:center; gap:3px; font-size:10px; font-weight:600; color:rgb(168,85,247); white-space:nowrap;">
        <span style="width:7px; height:7px; border-radius:50%; background:rgb(168,85,247); display:inline-block; flex-shrink:0;"></span>跨日 ≥24h
      </span>
    </div>

    <div style="display: flex; flex-direction: column; gap: 4px; max-height: 360px; min-height: 160px; overflow-y: auto; padding-right: 4px;">
      ${timelineItemsHtml}
    </div>
  `

  // 内容未变则跳过重绘：本函数由动态循环高频调用，无脑重建 innerHTML 会闪烁、且无法选中复制
  if (container.dataset.xfOverviewSig === html) return
  container.innerHTML = html
  container.dataset.xfOverviewSig = html
}
