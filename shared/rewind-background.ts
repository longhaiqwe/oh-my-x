import {
  KeyExtensionStatus,
  KeyRewindEnabled,
  KeyRewindOcr,
  KeyRewindOcrState,
  KeyRewindRevision,
} from '../storage-keys'
import { AppError, toTransferable } from './errors'
import { rewindOcrLanguage, rewindOcrTasks } from './rewind-ocr'
import { createRewindRepository } from './rewind-db'
import {
  REWIND_MESSAGE,
  REWIND_OCR_ORIGINS,
  queryRewind,
  sanitizeRewindPost,
  type RewindOcrState,
} from './rewind'

const X_URLS = [
  'https://x.com/*',
  'https://twitter.com/*',
  'https://mobile.twitter.com/*',
]
type Sender = {
  id?: string
  url?: string
  frameId?: number
  tab?: { id?: number; cookieStoreId?: string }
}
const isX = (url: string) =>
  /^https:\/\/(x\.com|twitter\.com|mobile\.twitter\.com)\//.test(url)
const parseAccount = (value: string) => {
  try {
    return decodeURIComponent(value)
      .replace(/"/g, '')
      .match(/^u=(\d+)$/)?.[1]
  } catch {
    return undefined
  }
}
export function registerRewindBackground() {
  const db = createRewindRepository()
  let running: Promise<void> | undefined,
    epoch = 0,
    creating: Promise<void> | undefined
  let lastAccount = '',
    failed = false
  async function changed() {
    await browser.storage.local.set({
      [KeyRewindRevision]: crypto.randomUUID(),
    })
  }
  async function state(value: RewindOcrState) {
    await browser.storage.local.set({ [KeyRewindOcrState]: value })
  }
  async function context(sender?: Sender) {
    const extension =
      !sender || sender.url?.startsWith(browser.runtime.getURL('/'))
    let url = sender?.url,
      tabId = sender?.tab?.id,
      storeId = sender?.tab?.cookieStoreId
    if (extension) {
      const tabs = await browser.tabs.query({
        url: X_URLS,
        currentWindow: true,
      })
      const tab = tabs.sort(
        (a, b) =>
          Number(b.active) - Number(a.active) ||
          (b.lastAccessed || 0) - (a.lastAccessed || 0),
      )[0]
      url = tab?.url
      tabId = tab?.id
      storeId = undefined
    }
    if (!url || !isX(url)) throw new AppError('error.accountChanged')
    const cookie = await browser.cookies.get({
      url: new URL(url).origin,
      name: 'twid',
      ...(storeId ? { storeId } : {}),
    })
    const account = parseAccount(cookie?.value || '')
    if (!account) throw new AppError('error.accountChanged')
    let handle = ''
    if (extension && tabId != null) {
      const page = await browser.tabs
        .sendMessage(tabId, { type: REWIND_MESSAGE, action: 'context' })
        .catch(() => null)
      if (page?.account !== account) throw new AppError('error.accountChanged')
      handle = page.handle || ''
    }
    return { account, handle, tabId, url }
  }
  async function stopOcr() {
    epoch++
    if (creating) await creating.catch(() => {})
    if (await browser.offscreen.hasDocument())
      await browser.offscreen.closeDocument().catch(() => {})
  }
  async function ensureOffscreen() {
    if (await browser.offscreen.hasDocument()) return
    if (!creating)
      creating = browser.offscreen
        .createDocument({
          url: browser.runtime.getURL('/rewind-ocr.html'),
          reasons: ['WORKERS'],
          justification:
            'Recognize text in saved X images locally for Rewind search.',
        })
        .finally(() => {
          creating = undefined
        })
    await creating
  }
  async function pump() {
    if (running || failed) return
    running = (async () => {
      const token = epoch
      try {
        const settings = await browser.storage.local.get([
          KeyRewindOcr,
          KeyExtensionStatus,
        ])
        if (
          settings[KeyRewindOcr] !== 'on' ||
          settings[KeyExtensionStatus] === 'off'
        )
          return
        if (
          !(await browser.permissions.contains({ origins: REWIND_OCR_ORIGINS }))
        )
          throw new Error('permission')
        const owner = await context()
        lastAccount = owner.account
        const snapshot = await db.read(owner.account)
        const language = rewindOcrLanguage(browser.i18n.getUILanguage())
        const tasks = rewindOcrTasks(snapshot.posts, language)
        if (!tasks.length) {
          await state({ phase: 'ready' })
          return
        }
        await ensureOffscreen()
        // Bound each service-worker run; the alarm resumes from persisted results.
        for (let i = 0; i < Math.min(tasks.length, 30); i++) {
          if (token !== epoch) return
          const current = await context()
          if (current.account !== owner.account) return
          await state({ phase: 'working', left: tasks.length - i })
          const response = await browser.runtime.sendMessage({
            target: 'xf-rewind-ocr',
            action: 'read',
            ...tasks[i],
            language,
          })
          if (token !== epoch) return
          if (!response?.ok) throw new Error('ocr')
          if ((await context()).account !== owner.account) return
          if (
            await db.ocr(
              owner.account,
              snapshot.generation,
              tasks[i].id,
              tasks[i].src,
              String(response.text || ''),
              language,
            )
          )
            await changed()
        }
        if (token === epoch)
          await state(
            tasks.length > 30
              ? { phase: 'working', left: tasks.length - 30 }
              : { phase: 'ready' },
          )
      } catch (error) {
        // A newly opened/reloading X tab may not have an account context yet.
        // Defer until the next alarm; this is not an OCR engine failure.
        if (error instanceof AppError && error.code === 'error.accountChanged')
          return
        if (token === epoch) {
          failed = true
          await state({ phase: 'error' })
        }
      } finally {
        running = undefined
        if (await browser.offscreen.hasDocument())
          await browser.offscreen.closeDocument().catch(() => {})
      }
    })()
    await running
  }
  async function open() {
    const tabs = await browser.tabs.query({ url: X_URLS, currentWindow: true })
    const tab = tabs.sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        (b.lastAccessed || 0) - (a.lastAccessed || 0),
    )[0]
    if (tab?.id != null) {
      await browser.tabs.update(tab.id, { active: true })
      await browser.tabs.sendMessage(tab.id, {
        type: REWIND_MESSAGE,
        action: 'open',
      })
      return
    }
    const created = await browser.tabs.create({ url: 'https://x.com/home' })
    if (created.id != null)
      await browser.storage.session.set({
        [`rewindPending:${created.id}`]: Date.now(),
      })
  }
  browser.commands?.onCommand.addListener((command) => {
    if (command === 'open-rewind') void open().catch(() => {})
  })
  browser.alarms?.create('xf-rewind-ocr', { periodInMinutes: 1 })
  browser.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === 'xf-rewind-ocr') void pump()
  })
  browser.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return
    if (changes[KeyRewindOcr] || changes[KeyExtensionStatus]) {
      failed = false
      void stopOcr()
        .then(async () => {
          if (running) await running
          const s = await browser.storage.local.get([
            KeyRewindOcr,
            KeyExtensionStatus,
          ])
          if (s[KeyRewindOcr] === 'on' && s[KeyExtensionStatus] !== 'off')
            void pump()
          else await state({ phase: 'off' })
        })
        .catch(() => {})
    }
  })
  browser.runtime.onMessage.addListener((m, sender, respond) => {
    if (m?.type !== REWIND_MESSAGE || sender.id !== browser.runtime.id) return
    if (m.action === 'progress') {
      if (
        sender.url?.split('#')[0] === browser.runtime.getURL('/rewind-ocr.html')
      )
        void state({
          phase: 'download',
          ...(typeof m.progress === 'number'
            ? { progress: Math.max(0, Math.min(1, m.progress)) }
            : {}),
        })
      return
    }
    const extension =
      sender.url?.startsWith(browser.runtime.getURL('/')) &&
      /\/(popup|options)\.html(?:[#?]|$)/.test(sender.url)
    if (!extension && (!isX(sender.url || '') || sender.frameId !== 0)) return
    if (['context', 'open'].includes(m.action)) return // These messages target content scripts only.
    void (async () => {
      if (m.action === 'launch') {
        await open()
        return {}
      }
      if (m.action === 'settings') {
        await browser.tabs.create({
          url: browser.runtime.getURL('/options.html#layout/rewind'),
        })
        return {}
      }
      if (m.action === 'hello') {
        const key = `rewindPending:${sender.tab?.id}`,
          pending = await browser.storage.session.get(key)
        if (pending[key]) {
          await browser.storage.session.remove(key)
          if (Date.now() - Number(pending[key]) < 60_000)
            await browser.tabs.sendMessage(sender.tab!.id!, {
              type: REWIND_MESSAGE,
              action: 'open',
            })
        }
        return {}
      }
      const owner = await context(sender)
      if (m.account && m.account !== owner.account)
        throw new AppError('error.accountChanged')
      if (m.action === 'add') {
        if (extension || new URL(owner.url).pathname !== '/home')
          throw new AppError('error.libraryBadSource')
        const settings = await browser.storage.local.get([
          KeyExtensionStatus,
          KeyRewindEnabled,
        ])
        if (
          settings[KeyExtensionStatus] === 'off' ||
          settings[KeyRewindEnabled] !== 'on'
        )
          return {}
        const items = (Array.isArray(m.posts) ? m.posts : [])
          .slice(0, 20)
          .map((p: unknown) => sanitizeRewindPost(p))
          .filter(
            (
              p: ReturnType<typeof sanitizeRewindPost>,
            ): p is NonNullable<typeof p> => !!p,
          )
        if (await db.add(owner.account, Number(m.generation), items)) {
          await changed()
          void pump()
        }
        return {}
      }
      if (m.action === 'clear') {
        await stopOcr()
        const generation = await db.clear(owner.account)
        await changed()
        failed = false
        return { generation }
      }
      if (m.action === 'retryOcr') {
        failed = false
        void pump()
        return {}
      }
      if (m.action === 'query' || m.action === 'status') {
        const settings = await browser.storage.local.get([
          KeyRewindEnabled,
          KeyRewindOcr,
          KeyRewindOcrState,
        ])
        if (lastAccount && lastAccount !== owner.account) {
          failed = false
          void stopOcr()
        }
        return {
          ...owner,
          ...queryRewind(await db.read(owner.account), {
            ...m,
            ocr: settings[KeyRewindOcr] === 'on',
            limit: m.action === 'status' ? 1 : m.limit,
          }),
          recording: settings[KeyRewindEnabled] === 'on',
          ocr: settings[KeyRewindOcr] === 'on',
          ocrState: settings[KeyRewindOcrState] || { phase: 'off' },
        }
      }
      throw new AppError('error.libraryBadSource')
    })().then(
      (result) => respond({ ok: true, result }),
      (error) =>
        respond({
          ok: false,
          error: toTransferable(error, 'error.readFailed'),
        }),
    )
    return true
  })
}
