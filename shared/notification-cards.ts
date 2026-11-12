/** 通知卡片只整理页面实际提供的数据，不把合并通知推算成逐条互动。 */
export type NotificationKind = 'reply' | 'like' | 'repost' | 'follow' | 'post' | 'other'
export interface NotificationActor { handle: string; name: string; avatar: string; verified: boolean }
export interface NotificationEntry {
  id: string
  readId?: string
  actors: NotificationActor[]
  kind: NotificationKind
  summary: string
  text: string
  timestamp: number
  url: string
  grouped: boolean
}
export interface NotificationReadState { baseline: number; read: Record<string, number>; postReadThrough?: number }
export interface NotificationGroup { actor: NotificationActor; entries: NotificationEntry[]; unread: number }

export function notificationReadKey(entry: NotificationEntry, handle: string): string {
  return `${entry.readId || entry.id}:${handle.toLowerCase()}`
}

/** 已读只增加；延迟的消息响应、跨标签页通知不能撤销已经收到的记录。 */
export function mergeNotificationReadState(current: NotificationReadState | null, incoming: NotificationReadState): NotificationReadState {
  if (!current) return incoming
  const read = { ...current.read }
  for (const [key, time] of Object.entries(incoming.read)) read[key] = Math.max(read[key] || 0, time)
  const merged: NotificationReadState = {
    baseline: Math.max(current.baseline, incoming.baseline),
    read: Object.fromEntries(Object.entries(read).sort((a, b) => a[1] - b[1]).slice(-2000)),
  }
  const postReadThrough = Math.max(current.postReadThrough || 0, incoming.postReadThrough || 0)
  if (postReadThrough) merged.postReadThrough = postReadThrough
  return merged
}

export function notificationFingerprint(value: string): string {
  let a = 2166136261, b = 5381
  for (const char of value) {
    a = Math.imul(a ^ char.charCodeAt(0), 16777619)
    b = Math.imul(b, 33) ^ char.charCodeAt(0)
  }
  return `${(a >>> 0).toString(16)}-${(b >>> 0).toString(16)}`
}

export function notificationIsUnread(entry: NotificationEntry, state: NotificationReadState, handle: string): boolean {
  const baseline = entry.kind === 'post' ? Math.max(state.baseline, state.postReadThrough || 0) : state.baseline
  return entry.timestamp > baseline && !state.read[notificationReadKey(entry, handle)] && !state.read[`${entry.id}:${handle.toLowerCase()}`]
}

export function groupNotifications(entries: NotificationEntry[], state: NotificationReadState): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>()
  for (const entry of [...entries].sort((a, b) => b.timestamp - a.timestamp)) {
    if (entry.kind === 'other' || entry.kind === 'post') continue
    for (const actor of entry.actors) {
      const key = actor.handle.toLowerCase()
      let group = groups.get(key)
      if (!group) { group = { actor, entries: [], unread: 0 }; groups.set(key, group) }
      // 头像列表里只有 handle 时，可从同用户的回复补上昵称。
      if (group.actor.name === group.actor.handle && actor.name !== actor.handle) group.actor = actor
      if (group.entries.some(item => notificationReadKey(item, key) === notificationReadKey(entry, key))) continue
      group.entries.push(entry)
      if (notificationIsUnread(entry, state, key)) group.unread++
    }
  }
  return [...groups.values()]
}

export const NOTIFICATION_STATE_MESSAGE = 'XF_NOTIFICATION_STATE'
export const NOTIFICATION_STATE_KEY = 'notificationCardsReadState'
type Store = { get(key: string): Promise<Record<string, unknown>>; set(value: Record<string, unknown>): Promise<void> }
export interface NotificationStateRequest { type: typeof NOTIFICATION_STATE_MESSAGE; account: string; read?: string[]; postReadThrough?: number; migrate?: { from: string; to: string }[] }

/** 后台串行合并，避免多个标签页同时点击卡片覆盖彼此的已查看记录。 */
export function createNotificationStateWriter(storage: Store, now = Date.now) {
  let queue = Promise.resolve()
  return (request: NotificationStateRequest): Promise<NotificationReadState> => {
    const operation = queue.then(async () => {
      if (!/^(uid:\d+|handle:[a-z0-9_]{1,15})$/.test(request.account)) throw new Error('Invalid notification account')
      const raw = (await storage.get(NOTIFICATION_STATE_KEY))[NOTIFICATION_STATE_KEY]
      const accounts: Record<string, NotificationReadState> = {}
      if (raw && typeof raw === 'object') {
        for (const [account, value] of Object.entries(raw).slice(-20)) {
          if (!/^(uid:\d+|handle:[a-z0-9_]{1,15})$/.test(account) || !value || typeof value !== 'object') continue
          const item = value as NotificationReadState
          if (!Number.isFinite(item.baseline) || item.baseline <= 0) continue
          const read = Object.fromEntries(Object.entries(item.read || {}).filter(([key, time]) =>
            /^[a-f0-9]+-[a-f0-9]+:[a-z0-9_]{1,15}$/.test(key) && Number.isFinite(time) && time > 0,
          ).slice(-2000))
          accounts[account] = { baseline: item.baseline, read }
          if (Number.isFinite(item.postReadThrough) && item.postReadThrough! > 0) accounts[account].postReadThrough = item.postReadThrough
        }
      }
      const current = accounts[request.account] ?? { baseline: now(), read: {} }
      let changed = !accounts[request.account]
      // 替换旧编号而非新增一份收据，保留原查看时间，避免迁移挤占上限并推进已读基线。
      for (const migration of (Array.isArray(request.migrate) ? request.migrate : []).slice(0, 500)) {
        if (!migration || typeof migration.from !== 'string' || typeof migration.to !== 'string') continue
        const { from, to } = migration
        if (![from, to].every(key => /^[a-f0-9]+-[a-f0-9]+:[a-z0-9_]{1,15}$/.test(key)) || from === to || from.split(':')[1] !== to.split(':')[1] || !current.read[from]) continue
        current.read[to] = Math.max(current.read[to] || 0, current.read[from])
        delete current.read[from]
        changed = true
      }
      // 保存被查看的提醒时间，而非点击时间，避免清除点击期间新到达的提醒。
      if (Number.isFinite(request.postReadThrough) && request.postReadThrough! > (current.postReadThrough || 0)) {
        current.postReadThrough = request.postReadThrough
        changed = true
      }
      for (const key of (Array.isArray(request.read) ? request.read : []).slice(0, 500)) {
        if (typeof key !== 'string' || !/^[a-f0-9]+-[a-f0-9]+:[a-z0-9_]{1,15}$/.test(key) || current.read[key]) continue
        current.read[key] = now()
        changed = true
      }
      // 丢弃旧收据时同时推进基线，防止旧通知重新变成未查看。
      const receipts = Object.entries(current.read).sort((a, b) => a[1] - b[1])
      if (receipts.length > 2000) {
        current.baseline = Math.max(current.baseline, receipts[receipts.length - 2001][1])
        current.read = Object.fromEntries(receipts.slice(-2000))
      }
      accounts[request.account] = current
      while (Object.keys(accounts).length > 20) {
        const oldest = Object.keys(accounts).filter(key => key !== request.account).sort((a, b) => accounts[a].baseline - accounts[b].baseline)[0]
        delete accounts[oldest]
      }
      if (changed) await storage.set({ [NOTIFICATION_STATE_KEY]: accounts })
      return current
    })
    queue = operation.then(() => {}, () => {})
    return operation
  }
}
