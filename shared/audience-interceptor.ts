import {
  AUDIENCE_CONTEXT,
  AUDIENCE_DATA,
  audienceRoute,
  parseAudienceResponse,
  type AudienceContext,
} from './audience'
/** Passive observation only. Never fetches a page or scrolls the native timeline. */
export function installAudienceInterceptor() {
  let context: AudienceContext | undefined,
    navigation = 0
  const account = () => {
    try {
      return (
        decodeURIComponent(
          document.cookie.match(/(?:^|;\s*)twid=([^;]+)/)?.[1] || '',
        )
          .replace(/"/g, '')
          .match(/^u=(\d+)$/)?.[1] || ''
      )
    } catch {
      return ''
    }
  }
  window.addEventListener('message', (event) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      event.data?.type !== AUDIENCE_CONTEXT
    )
      return
    const c = event.data.context
    context =
      c &&
      typeof c.token === 'string' &&
      c.path === location.pathname &&
      c.account === account()
        ? c
        : undefined
  })
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method]
    history[method] = function (...args: Parameters<History[typeof method]>) {
      const before = location.pathname,
        result = original.apply(this, args)
      if (before !== location.pathname) {
        navigation++
        context = undefined
      }
      return result
    }
  }
  window.addEventListener('popstate', () => {
    navigation++
    context = undefined
  })
  const capture = (url: string) =>
    context &&
    audienceRoute(location.pathname) &&
    /\/graphql\/[^/]+\/(Followers|Following)(?:\?|$)/.test(url)
      ? { ...context, navigation, time: Date.now() }
      : undefined
  const receive = (
    url: string,
    data: unknown,
    c: ReturnType<typeof capture>,
  ) => {
    if (
      !c ||
      c.token !== context?.token ||
      c.navigation !== navigation ||
      c.path !== location.pathname ||
      c.account !== account()
    )
      return
    const packet = parseAudienceResponse(url, data, c.path, c.time)
    if (packet)
      window.postMessage(
        { type: AUDIENCE_DATA, context: c, packet },
        location.origin,
      )
  }
  const fetch = window.fetch
  window.fetch = function (...args) {
    const url =
      typeof args[0] === 'string'
        ? args[0]
        : args[0] instanceof URL
          ? args[0].href
          : args[0].url
    const captured = capture(url),
      promise = fetch.apply(this, args)
    if (captured)
      void promise
        .then((r) => {
          if (r.ok)
            return r
              .clone()
              .json()
              .then((data) => receive(url, data, captured))
        })
        .catch(() => {})
    return promise
  }
  const open = XMLHttpRequest.prototype.open,
    send = XMLHttpRequest.prototype.send
  const urls = new WeakMap<XMLHttpRequest, string>()
  XMLHttpRequest.prototype.open = function (
    method,
    url,
    async = true,
    username?,
    password?,
  ) {
    urls.set(this, String(url))
    return open.call(
      this,
      method,
      url,
      async as boolean,
      username as string | null | undefined,
      password as string | null | undefined,
    )
  }
  XMLHttpRequest.prototype.send = function (...args) {
    const url = urls.get(this) || '',
      captured = capture(url)
    if (captured) {
      const finish = () => {
        this.removeEventListener('loadend', finish)
        try {
          if (this.status >= 200 && this.status < 300)
            receive(
              url,
              this.responseType === 'json'
                ? this.response
                : JSON.parse(this.responseText),
              captured,
            )
        } catch {}
      }
      this.addEventListener('loadend', finish)
    }
    return send.apply(this, args)
  }
}
