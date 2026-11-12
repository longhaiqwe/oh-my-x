// @vitest-environment node
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { registerAudienceBackground } from '../../shared/audience-background'
import { AUDIENCE_MESSAGE } from '../../shared/audience'
import { KeyAudienceEnabled, KeyExtensionStatus } from '../../storage-keys'
let listener: any, api: any
const x = {
  id: 'extension',
  url: 'https://x.com/owner/following',
  frameId: 0,
  tab: { id: 5 },
}
const extension = {
  id: 'extension',
  url: 'chrome-extension://extension/options.html',
}
const payload = {
  account: '100',
  generation: 0,
  packet: {
    targetId: '100',
    handle: 'owner',
    kind: 'following',
    members: [
      {
        id: '2',
        handle: 'member',
        followers: 0,
        following: 0,
        followsYou: false,
        observedAt: Date.now(),
      },
    ],
  },
}
const send = (
  action: string,
  data: Record<string, unknown> = {},
  sender: any = x,
) =>
  new Promise<any>((resolve) => {
    const result = listener(
      { type: AUDIENCE_MESSAGE, action, ...data },
      sender,
      resolve,
    )
    if (result !== true) resolve(undefined)
  })
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  api = {
    runtime: {
      id: 'extension',
      getURL: (p: string) => `chrome-extension://extension${p}`,
      onMessage: { addListener: (l: any) => (listener = l) },
    },
    storage: {
      local: {
        get: vi.fn(async () => ({
          [KeyAudienceEnabled]: 'on',
          [KeyExtensionStatus]: 'on',
        })),
        set: vi.fn(async () => {}),
      },
    },
    cookies: { get: vi.fn(async () => ({ value: 'u=100' })) },
    tabs: { query: vi.fn() },
  }
  vi.stubGlobal('browser', api)
  registerAudienceBackground()
})
afterEach(() => vi.unstubAllGlobals())
describe('audience RPC authorization', () => {
  it('allows settings to read saved records without an X tab or cookie', async () => {
    expect((await send('add', payload)).result.state).toBe('saved')
    api.cookies.get.mockClear()
    expect((await send('list', {}, extension)).result).toHaveLength(1)
    const r = await send('read', { key: '100:100:following' }, extension)
    expect(r.result.members[0]).toMatchObject({
      followers: 0,
      following: 0,
      followsYou: false,
    })
    expect(api.cookies.get).not.toHaveBeenCalled()
    expect(api.tabs.query).not.toHaveBeenCalled()
  })
  it('rejects wrong extension IDs, subframes, foreign origins and settings writes', async () => {
    expect(await send('add', payload, { ...x, id: 'other' })).toBeUndefined()
    expect(await send('add', payload, { ...x, frameId: 2 })).toBeUndefined()
    expect(
      await send('add', payload, {
        ...x,
        url: 'https://evil.example/following',
      }),
    ).toBeUndefined()
    expect((await send('add', payload, extension)).ok).toBe(false)
  })
  it('requires enabled capture, exact route and current cookie identity', async () => {
    api.storage.local.get.mockResolvedValue({ [KeyAudienceEnabled]: 'off' })
    expect((await send('add', payload)).result.state).toBe('disabled')
    api.storage.local.get.mockResolvedValue({ [KeyAudienceEnabled]: 'on' })
    expect(
      (
        await send('add', payload, {
          ...x,
          url: 'https://x.com/other/following',
        })
      ).ok,
    ).toBe(false)
    expect((await send('add', { ...payload, account: '999' })).ok).toBe(false)
    expect(
      (await send('read', { key: '999:100:following', account: '999' })).ok,
    ).toBe(false)
  })
  it('strips relationship flags from third-party targets and blocks stale generation after clearing', async () => {
    await send('add', {
      ...payload,
      packet: { ...payload.packet, targetId: '300' },
    })
    expect(
      (await send('read', { key: '100:300:following' })).result.members[0],
    ).not.toHaveProperty('followsYou')
    await send('clear', { account: '100', key: '100:300:following' }, extension)
    expect(
      (
        await send('add', {
          ...payload,
          packet: { ...payload.packet, targetId: '300' },
        })
      ).result.state,
    ).toBe('changed')
  })
})
