import {
  AUDIENCE_CONTEXT,
  AUDIENCE_DATA,
  audienceRoute,
  getClassicAudienceEndpoint,
  parseAudienceResponse,
  type AudienceContext,
  type AudiencePacket,
} from './audience'

const HANDSHAKE_WINDOW_MS = 10_000
const listOperation = /\/graphql\/[^/]+\/(Followers|BlueVerifiedFollowers|Following|followersQuery|verifiedFollowersQuery|followingQuery)(?:\?|$)/

export function installAudienceInterceptor() {
  let context: AudienceContext | undefined
  let early: { time: number; path: string; account: string; endpoint?: string; packet: AudiencePacket } | undefined
  let disabled = false
  let navigation = 0
  const account = () => {
    try {
      return decodeURIComponent(document.cookie.match(/(?:^|;\s*)twid=([^;]+)/)?.[1] || '')
        .replace(/"/g, '').match(/^u=(\d+)$/)?.[1] || ''
    } catch {
      return ''
    }
  }

  function publish(c: AudienceContext, packet: AudiencePacket, endpoint?: string) {
    window.postMessage({ type: AUDIENCE_DATA, context: c, packet, endpoint }, location.origin)
  }

  window.addEventListener('message', (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.type !== AUDIENCE_CONTEXT
    )
      return
    disabled = event.data.enabled === false
    const c = event.data.context as AudienceContext | undefined
    const owner = account()
    context = !disabled && c && typeof c.token === 'string' &&
      c.path === location.pathname && c.account === owner ? c : undefined
    if (early && (disabled || early.account !== owner || Date.now() - early.time > HANDSHAKE_WINDOW_MS))
      early = undefined
    if (context && early) {
      if (early.path === context.path && early.time > (context.clearedAt ?? 0))
        publish(context, early.packet, early.endpoint)
      early = undefined
    }
  })

  function navigate() {
    navigation++
    context = undefined
    early = undefined
  }

  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method]
    history[method] = function (...args: Parameters<History[typeof method]>) {
      const before = location.pathname
      const result = original.apply(this, args)
      if (before !== location.pathname) navigate()
      return result
    }
  }
  window.addEventListener('popstate', navigate)

  function capture(url: string, method: string) {
    const path = location.pathname
    const route = audienceRoute(path)
    if (disabled || method.toUpperCase() !== 'GET' || !listOperation.test(url) || !route) return
    const owner = account()
    const active = context?.account === owner ? context : undefined
    const endpoint = getClassicAudienceEndpoint(url, route.kind)?.href
    if (!active && !(route.kind === 'verified_followers' && endpoint)) return
    return { context: active, path, owner, navigation, time: Date.now(), endpoint }
  }

  function receive(url: string, data: unknown, captured: ReturnType<typeof capture>) {
    if (
      !captured ||
      captured.navigation !== navigation ||
      captured.path !== location.pathname ||
      captured.owner !== account() ||
      disabled ||
      (captured.context && captured.context.token !== context?.token)
    )
      return
    const packet = parseAudienceResponse(url, data, captured.path, captured.time)
    if (!packet) return
    const active = context?.account === captured.owner ? context : undefined
    if (active) {
      if (captured.time > (active.clearedAt ?? 0)) publish(active, packet, captured.endpoint)
    } else if (captured.endpoint) {
      early = {
        time: captured.time, path: captured.path, account: captured.owner,
        endpoint: captured.endpoint, packet,
      }
    }
  }

  const fetch = window.fetch
  window.fetch = function (...args) {
    const [input, init] = args
    const request = input instanceof Request ? input : undefined
    const url = typeof input === 'string' ? input : request?.url ?? String(input)
    const captured = capture(url, init?.method ?? request?.method ?? 'GET')
    const promise = fetch.apply(this, args)
    if (captured)
      void promise.then((r) => {
        if (r.ok) return r.clone().json().then((data) => receive(url, data, captured))
      }).catch(() => {})
    return promise
  }

  const open = XMLHttpRequest.prototype.open
  const send = XMLHttpRequest.prototype.send
  const requests = new WeakMap<XMLHttpRequest, { url: string; method: string }>()
  XMLHttpRequest.prototype.open = function (method, url, async = true, username?, password?) {
    requests.set(this, { url: String(url), method })
    return open.call(
      this, method, url, async as boolean,
      username as string | null | undefined, password as string | null | undefined,
    )
  }
  XMLHttpRequest.prototype.send = function (...args) {
    const request = requests.get(this)
    const captured = request && capture(request.url, request.method)
    if (captured) {
      const finish = () => {
        this.removeEventListener('loadend', finish)
        try {
          if (this.status >= 200 && this.status < 300)
            receive(request.url, this.responseType === 'json' ? this.response : JSON.parse(this.responseText), captured)
        } catch {}
      }
      this.addEventListener('loadend', finish)
    }
    return send.apply(this, args)
  }
}
