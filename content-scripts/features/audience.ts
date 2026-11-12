import {
  KeyAudienceEnabled,
  KeyAudienceRevision,
  KeyExtensionStatus,
} from '../../storage-keys'
import {
  AUDIENCE_CONTEXT,
  AUDIENCE_DATA,
  audienceKey,
  audienceRoute,
  mergeAudienceMember,
  sanitizeAudienceMember,
  type AudienceContext,
  type AudienceMeta,
  type AudiencePacket,
  type AudienceSnapshot,
} from '../../shared/audience'
import { audienceRequest } from '../../shared/audience-client'
import {
  closeAudiencePanel,
  openAudiencePanel,
} from '../../shared/audience-panel'
import { t, onLocaleChange } from '../../shared/i18n'
import { getRewindAccount } from '../options/rewind-account'
import { getThemeColors } from '../utilities/colors'
let started = false
export function startAudience() {
  if (started || location.hostname === 'pro.x.com') return
  started = true
  let enabled = false,
    context: AudienceContext | undefined,
    snapshot: AudienceSnapshot | undefined,
    bar: HTMLButtonElement | undefined
  let panel: ReturnType<typeof openAudiencePanel> | undefined,
    error = '',
    state = '',
    serial = 0,
    checking = false,
    disposed = false
  let queue = Promise.resolve()
  const identity = () =>
    `${location.pathname}|${getRewindAccount()?.account || ''}`
  let lastIdentity = ''
  function broadcast() {
    window.postMessage(
      { type: AUDIENCE_CONTEXT, context: enabled ? context : undefined },
      location.origin,
    )
  }
  function reset() {
    serial++
    context = undefined
    snapshot = undefined
    error = ''
    state = ''
    bar?.remove()
    bar = undefined
    closeAudiencePanel()
    panel = undefined
    broadcast()
  }
  const empty = (): AudienceSnapshot => {
    const route = audienceRoute(location.pathname)!
    return {
      key: '',
      account: context?.account || '',
      targetId: '',
      handle: route.handle,
      kind: route.kind,
      batch: 'temporary',
      startedAt: Date.now(),
      updatedAt: Date.now(),
      count: 0,
      bytes: 0,
      members: [],
    }
  }
  function render() {
    if (!enabled || !audienceRoute(location.pathname) || (!context && !error)) {
      bar?.remove()
      bar = undefined
      return
    }
    const tabs = document.querySelector(
      '[data-testid="primaryColumn"] [role="tablist"]',
    )
    if (!tabs) return
    if (!bar?.isConnected) {
      bar = document.createElement('button')
      bar.type = 'button'
      bar.id = 'xf-audience-entry'
      bar.addEventListener('click', () => {
        if (!context) {
          void refresh(true)
          return
        }
        panel = openAudiencePanel(snapshot || empty(), {
          temporary: !context?.account,
          status:
            error ||
            (state === 'capacity' ? t('audience.capacity') : undefined),
          restart: () => void restart(),
          onClose: () => (panel = undefined),
        })
      })
      tabs.insertAdjacentElement('afterend', bar)
    }
    const c = getThemeColors()
    bar.style.cssText = `display:block;width:100%;min-height:44px;padding:12px 16px;border:0;border-bottom:1px solid ${c.border};background:${c.bg};color:${c.fg};text-align:left;font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;`
    bar.textContent =
      error ||
      t('audience.entry', {
        count: snapshot?.members.length || 0,
        kind: t(
          audienceRoute(location.pathname)!.kind === 'followers'
            ? 'audience.followers'
            : 'audience.following',
        ),
      })
    bar.title = t('audience.emptyHint')
    // The open analysis window keeps its original sample; new native pages appear after reopening.
  }
  async function readCurrent(token = serial) {
    if (!context?.account) return
    const route = audienceRoute(context.path)!,
      owner = context.account
    const metas = await audienceRequest<AudienceMeta[]>('list', {
      account: owner,
    })
    if (token !== serial) return
    const meta = metas.find(
      (m) =>
        m.kind === route.kind &&
        m.handle.toLowerCase() === route.handle.toLowerCase(),
    )
    const value = meta
      ? await audienceRequest<AudienceSnapshot | null>('read', {
          key: meta.key,
          account: owner,
        })
      : null
    if (token !== serial) return
    snapshot = value || undefined
    render()
  }
  async function restart() {
    if (!snapshot?.key || !context?.account) return
    const token = serial,
      key = snapshot.key,
      account = context.account
    try {
      await audienceRequest('clear', { key, account })
      if (token !== serial) return
      reset()
      lastIdentity = ''
      await refresh()
    } catch {
      error = t('audience.failure')
      render()
    }
  }
  async function refresh(force = false) {
    if (disposed || checking) return
    const current = identity()
    if (current !== lastIdentity) {
      reset()
      lastIdentity = current
      force = true
    }
    if (!enabled || !audienceRoute(location.pathname)) {
      render()
      return
    }
    if (!force && context) {
      broadcast()
      render()
      return
    }
    checking = true
    const token = serial,
      path = location.pathname,
      account = getRewindAccount()?.account || ''
    try {
      let generation = 0
      if (account) {
        const result = await audienceRequest<{
          account: string
          generation: number
        }>('hello', { account })
        if (result.account !== account) return
        generation = result.generation
      }
      if (token !== serial || current !== identity() || !enabled) return
      if (!context || context.generation !== generation) {
        if (context) {
          closeAudiencePanel()
          panel = undefined
        }
        context = { account, generation, path, token: crypto.randomUUID() }
      }
      broadcast()
      await readCurrent(token)
      error = ''
      render()
    } catch {
      if (token === serial) {
        error = t('audience.failure')
        context = undefined
        broadcast()
        render()
      }
    } finally {
      checking = false
    }
  }
  function message(event: MessageEvent) {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.type !== AUDIENCE_DATA ||
      !enabled ||
      !context
    )
      return
    const c = event.data.context,
      packet = event.data.packet as AudiencePacket,
      current = context
    if (
      c?.token !== current.token ||
      c.path !== location.pathname ||
      current.account !== (getRewindAccount()?.account || '') ||
      !packet ||
      !Array.isArray(packet.members)
    )
      return
    const route = audienceRoute(location.pathname)
    if (
      !route ||
      packet.kind !== route.kind ||
      typeof packet.handle !== 'string' ||
      packet.handle.toLowerCase() !== route.handle.toLowerCase() ||
      !/^\d{1,30}$/.test(packet.targetId)
    )
      return
    const token = serial
    queue = queue
      .then(async () => {
        if (token !== serial || !enabled || current.token !== context?.token)
          return
        if (!current.account) {
          const initial = snapshot || {
            ...empty(),
            targetId: packet.targetId,
            key: audienceKey('', packet.targetId, packet.kind),
          }
          const members = new Map(initial.members.map((m) => [m.id, m]))
          for (const item of packet.members.slice(0, 1000)) {
            const m = sanitizeAudienceMember(item)
            if (m) {
              delete m.followsYou
              if (members.has(m.id) || members.size < (packet.kind === 'followers' ? 20000 : 10000))
                members.set(m.id, mergeAudienceMember(members.get(m.id), m))
            }
          }
          snapshot = {
            ...initial,
            members: [...members.values()],
            count: members.size,
            updatedAt: Date.now(),
          }
          render()
          return
        }
        const result = await audienceRequest<{ state: string; key?: string }>(
          'add',
          { account: current.account, generation: current.generation, packet },
        )
        if (token !== serial) return
        state = result.state
        if (result.state === 'changed') {
          reset()
          lastIdentity = ''
          void refresh()
          return
        }
        if (result.key) {
          const value = await audienceRequest<AudienceSnapshot | null>('read', {
            key: result.key,
            account: current.account,
          })
          if (token !== serial) return
          snapshot = value || undefined
        }
        error = ''
        render()
      })
      .catch(() => {
        if (token === serial) {
          error = t('audience.failure')
          render()
        }
      })
  }
  async function settings() {
    const s = await browser.storage.local.get([
      KeyAudienceEnabled,
      KeyExtensionStatus,
    ])
    if (disposed) return
    const next =
      s[KeyAudienceEnabled] === 'on' && s[KeyExtensionStatus] !== 'off'
    if (enabled !== next) {
      enabled = next
      reset()
      lastIdentity = ''
    }
    await refresh(true)
  }
  function changed(changes: Record<string, unknown>, area: string) {
    if (area !== 'local') return
    if (KeyAudienceEnabled in changes || KeyExtensionStatus in changes)
      void settings().catch(() => {})
    else if (KeyAudienceRevision in changes) void refresh(true)
  }
  window.addEventListener('message', message)
  browser.storage.onChanged.addListener(changed)
  const timer = setInterval(() => void refresh(), 750),
    unsubscribe = onLocaleChange(render)
  window.addEventListener(
    'pagehide',
    () => {
      disposed = true
      reset()
      clearInterval(timer)
      unsubscribe()
      window.removeEventListener('message', message)
      browser.storage.onChanged.removeListener(changed)
    },
    { once: true },
  )
  void settings().catch(() => {})
}
