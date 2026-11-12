import { afterEach, describe, it, expect, vi } from 'vitest'
import { installAudienceInterceptor } from '../../shared/audience-interceptor'
import { AUDIENCE_CONTEXT, AUDIENCE_DATA } from '../../shared/audience'
// One installation per document, matching the MAIN-world entrypoint.
const originalFetch = window.fetch,
  originalOpen = XMLHttpRequest.prototype.open,
  originalSend = XMLHttpRequest.prototype.send,
  originalPush = history.pushState,
  originalReplace = history.replaceState
const waiting: Array<(r: any) => void> = []
const fetchMock = vi.fn(
  () => new Promise<any>((resolve) => waiting.push(resolve)),
)
window.fetch = fetchMock as any
installAudienceInterceptor()
afterEach(() => {
  waiting.splice(0)
  vi.restoreAllMocks()
})
const path = '/owner/followers'
const url =
  'https://x.com/i/api/graphql/hash/Followers?variables=' +
  encodeURIComponent(JSON.stringify({ userId: '1' }))
function context(token: string) {
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window,
      origin: location.origin,
      data: {
        type: AUDIENCE_CONTEXT,
        context: { account: '', generation: 0, path: location.pathname, token },
      },
    }),
  )
}
const response = {
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: [{ type: 'TimelineAddEntries', entries: [] }],
          },
        },
      },
    },
  },
}
async function finish() {
  waiting.shift()?.({
    ok: true,
    clone: () => ({ json: async () => response }),
  })
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
describe('audience passive interception', () => {
  it('is off before a handshake, sends no additional network requests, and captures only matching native requests', async () => {
    history.pushState({}, '', path)
    const post = vi.spyOn(window, 'postMessage')
    void window.fetch(url)
    await finish()
    expect(
      post.mock.calls.filter((c) => (c[0] as any).type === AUDIENCE_DATA),
    ).toHaveLength(0)
    context('one')
    const before = fetchMock.mock.calls.length
    void window.fetch(url)
    await finish()
    expect(fetchMock.mock.calls.length - before).toBe(1)
    expect(
      post.mock.calls.filter((c) => (c[0] as any).type === AUDIENCE_DATA),
    ).toHaveLength(1)
  })
  it('captures verified followers only on the matching list route', async () => {
    history.pushState({}, '', '/owner/verified_followers')
    context('verified')
    const post = vi.spyOn(window, 'postMessage')
    void window.fetch(url.replace('/Followers?', '/BlueVerifiedFollowers?'))
    await finish()
    expect(post.mock.calls.filter(c => (c[0] as any).type === AUDIENCE_DATA)).toHaveLength(1)
    expect((post.mock.calls[0][0] as any).packet.kind).toBe('verified_followers')
    history.pushState({}, '', path)
  })
  it('discards a response after navigation away and back, disabling, or context replacement', async () => {
    const post = vi.spyOn(window, 'postMessage')
    context('two')
    void window.fetch(url)
    history.pushState({}, '', '/home')
    history.pushState({}, '', path)
    context('three')
    await finish()
    context('four')
    void window.fetch(url)
    window.dispatchEvent(
      new MessageEvent('message', {
        source: window,
        origin: location.origin,
        data: { type: AUDIENCE_CONTEXT },
      }),
    )
    await finish()
    expect(
      post.mock.calls.filter((c) => (c[0] as any).type === AUDIENCE_DATA),
    ).toHaveLength(0)
  })
})
// Other test files have separate jsdom instances. Restore primitives at file teardown.
import { afterAll } from 'vitest'
afterAll(() => {
  window.fetch = originalFetch
  XMLHttpRequest.prototype.open = originalOpen
  XMLHttpRequest.prototype.send = originalSend
  history.pushState = originalPush
  history.replaceState = originalReplace
})
