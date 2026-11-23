// @vitest-environment node
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
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
  vi.stubGlobal('IDBKeyRange', IDBKeyRange)
  api = {
    runtime: {
      id: 'extension',
      getURL: (p: string) => `chrome-extension://extension${p}`,
      onMessage: { addListener: (l: any) => (listener = l) },
      onStartup: { addListener: vi.fn() },
    },
    storage: {
      local: {
        get: vi.fn(async () => ({
          [KeyAudienceEnabled]: 'on',
          [KeyExtensionStatus]: 'on',
        })),
        set: vi.fn(async () => {}),
      },
      onChanged: { addListener: vi.fn() },
    },
    alarms: { get: vi.fn(), create: vi.fn(), clear: vi.fn(), onAlarm: { addListener: vi.fn() } },
    cookies: { get: vi.fn(async () => ({ value: 'u=100' })) },
    tabs: { query: vi.fn(), get: vi.fn(async () => ({ id: 5, url: x.url })) },
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
    api.tabs.get.mockResolvedValueOnce({ url: 'https://x.com/other/following' })
    expect((await send('add', payload)).ok).toBe(false)
    expect((await send('add', { ...payload, account: '999' })).ok).toBe(false)
    expect(
      (await send('read', { key: '999:100:following', account: '999' })).ok,
    ).toBe(false)
  })
  it('validates the current tab route after SPA navigation, not the original document URL', async () => {
    api.tabs.get.mockResolvedValue({ url: 'https://x.com/owner/verified_followers' })
    expect((await send('add', { ...payload, packet: { ...payload.packet, kind: 'verified_followers' } })).result?.state).toBe('saved')
    expect((await send('add', payload)).ok).toBe(false)
    api.tabs.get.mockResolvedValue({ url: 'https://evil.example/owner/following' })
    expect((await send('add', payload)).ok).toBe(false)
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
  it('syncs all three lists without an X tab and resumes each unfinished list after restart', async () => {
    const store: Record<string, unknown> = { [KeyAudienceEnabled]: 'on' }
    api.storage.local.get.mockImplementation(async () => ({ ...store }))
    api.storage.local.set.mockImplementation(async (items: object) => Object.assign(store, items))
    api.cookies.get.mockImplementation(async ({ name }: { name: string }) =>
      ({ value: name === 'twid' ? 'u=100' : 'fixture-csrf' }),
    )
    const pages: Record<string, (string | null | undefined)[]> = {}
    vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => {
      const url = new URL(input)
      expect(url.origin).toBe('https://x.com')
      expect(url.pathname).toMatch(/^\/i\/api\/graphql\/[^/]+\//)
      const operation = url.pathname.split('/').at(-1)!
      if (operation === 'viewerQuery')
        return Response.json({ data: { viewer: { user_results: { result: {
          rest_id: '100', id: 'fixture-owner', core: { screen_name: 'owner' },
        } } } } })
      if (operation === 'BlueVerifiedFollowers') return new Response(null, { status: 404 })
      const { userId, screenName, cursor, screen_names } = JSON.parse(url.searchParams.get('variables')!)
      if (operation === 'UsersByScreenNames') {
        return Response.json({ data: { users: screen_names.map((handle: string) => ({
          result: { rest_id: handle.replace('member', ''), relationship_counts: { followers: 4720 } },
        })) } })
      }
      ;(pages[operation] ??= []).push(cursor)
      const id = cursor ? '2' : '1'
      const user = { rest_id: id, core: { screen_name: 'member' + id }, is_followed_by: false }
      if (operation === 'Following') {
        expect(userId).toBe('100')
        const entries = [
          { entryId: 'user-' + id, content: { itemContent: { user_results: { result: user } } } },
          ...(!cursor ? [{ entryId: 'cursor-bottom-0', content: { cursorType: 'Bottom', value: 'following-two' } }] : []),
        ]
        return Response.json({ data: { user: { result: {
          timeline: { timeline: { instructions: [{ type: 'TimelineAddEntries', entries }] } },
        } } } })
      }
      expect(screenName).toBe('owner')
      const timeline = operation === 'followersQuery' ? 'followers_timeline' : 'blue_verified_followers_timeline'
      const entries = [
        { entry_id: 'user-' + id, content: { content: {
          __typename: 'TimelineUser', user_results: { result: user },
        } } },
        ...(!cursor ? [{ entry_id: 'cursor-bottom-0', content: {
          __typename: 'TimelineTimelineCursor', cursor_type: 'Bottom', value: operation + '-two',
        } }] : []),
      ]
      return Response.json({ data: { user_result_by_screen_name: { result: {
        id: 'fixture-owner', [timeline]: { timeline: { instructions: [{ __typename: 'TimelineAddEntries', entries }] } },
      } } } })
    }))
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    try {
      const headers = (csrf: string) => ({ 'x-csrf-token': csrf })
      const read = async (kind: string) => (await send('read', { key: '100:100:' + kind }, extension)).result
      registerAudienceBackground(headers)
      await vi.waitFor(async () => {
        expect((await read('followers'))?.count).toBe(1)
        expect((await read('following'))?.count).toBe(1)
        expect(store.audienceSyncProgress).toBeDefined()
      })
      clock.mockReturnValue(now + 60_001)
      registerAudienceBackground(headers)
      await vi.waitFor(async () => {
        expect((await read('followers'))?.members).toMatchObject([{ followers: 4720 }, { id: '2' }])
        expect((await read('following'))?.members).toMatchObject([{ followsYou: false }, { followsYou: false }])
        expect((await read('verified_followers'))?.count).toBe(1)
        expect(store.audienceSyncProgress).toMatchObject({ lists: { verified_followers: { cursor: 'verifiedFollowersQuery-two' } } })
      })
      clock.mockReturnValue(now + 120_002)
      registerAudienceBackground(headers)
      await vi.waitFor(async () => {
        expect((await read('verified_followers'))?.count).toBe(2)
        expect((await read('followers'))?.members.every((m: {followers?:number}) => m.followers === 4720)).toBe(true)
      })
      expect(pages).toEqual({
        followersQuery: [null, 'followersQuery-two'],
        Following: [undefined, 'following-two'],
        verifiedFollowersQuery: [null, 'verifiedFollowersQuery-two'],
      })
      expect(api.tabs.query).not.toHaveBeenCalled()
      expect(api.tabs.get).not.toHaveBeenCalled()
    } finally {
      clock.mockRestore()
    }
  })
})
