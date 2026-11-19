import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { event, flushMicrotasks } from '../helpers/runtime-port'
import { KeyCreatorRewardsStats, KeyCreatorRewardsHistory, KeyCreatorRewardsPageState, KeyImpressionsDaily } from '../../storage-keys'

let store: Record<string, unknown>
let runtime: any
let payload: string
let status: number
let alarms: any
let account: string
const application = 'page!creators_original_content_rewards\u0000section intro\u0000element application_next\u0000//creators/original_content_rewards/select_posts'

async function refresh(): Promise<any> {
  return new Promise(resolve => runtime.onMessage.emit({ type: 'XF_FETCH_CREATOR_REWARDS' }, { id: 'test-extension' }, resolve))
}

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-19T03:00:00Z'))
  payload = application; status = 200; account = '123'
  store = {
    [KeyCreatorRewardsStats]: JSON.stringify({ impressionsCount: 494600, impressionsText: '494.6K', updatedAt: Date.now() }),
    [KeyCreatorRewardsHistory]: JSON.stringify({ '2026-11-16': 477000, '2026-11-17': 494600 }),
    [KeyImpressionsDaily]: JSON.stringify({ days: { '2026-11-18': { total: 100, verified: 50 } }, updatedAt: Date.now() }),
  }
  runtime = { id: 'test-extension', onConnect: event(), onMessage: event(), onInstalled: event(), onStartup: event() }
  alarms = { create: vi.fn(), get: vi.fn(async name => name === 'XF_ALARM_CREATOR_REWARDS_DAILY' ? undefined : {}), onAlarm: event() }
  vi.stubGlobal('browser', {
    runtime,
    contextMenus: { create: vi.fn((_p, cb) => cb?.()), remove: vi.fn((_id, cb) => cb?.()), onClicked: event() },
    storage: { local: { get: async () => ({ ...store }), set: async (kv: Record<string, unknown>) => { Object.assign(store, kv) } }, onChanged: event() },
    cookies: { get: async ({ name }: { name: string }) => name === 'ct0' ? { value: 'test-csrf' } : name === 'twid' ? { value: `u%3D${account}` } : null },
    alarms,
    tabs: { query: async () => [], create: vi.fn(), sendMessage: vi.fn() },
    permissions: { contains: async () => false }, downloads: { download: vi.fn() },
  })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('/creators/original_content_rewards')
    ? new Response(payload, { status })
    : new Response(JSON.stringify({ data: { viewer_v2: { user_results: { result: { current_time_series: [] } } } } }), { status: 200 })))
  vi.stubGlobal('defineBackground', (fn: () => void) => fn)
  vi.spyOn(console, 'info').mockImplementation(() => {})
  const background = await import('../../entrypoints/background')
  ;(background.default as unknown as () => void)()
  await flushMicrotasks()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('每天北京时间 10:30 触发更新，避免仅靠未对齐的半小时检查', () => {
  expect(alarms.create).toHaveBeenCalledWith('XF_ALARM_CREATOR_REWARDS_DAILY', {
    when: Date.parse('2026-11-20T02:30:00Z'), periodInMinutes: 1440,
  })
})

it('后台请求首次返回申请页：成功保存阶段、保留全部真实读数和历史', async () => {
  const old = { stats: store[KeyCreatorRewardsStats], history: store[KeyCreatorRewardsHistory] }
  expect((await refresh()).ok).toBe(true)
  expect(JSON.parse(store[KeyCreatorRewardsPageState] as string).stage).toBe('application')
  expect(store[KeyCreatorRewardsStats]).toBe(old.stats)
  expect(store[KeyCreatorRewardsHistory]).toBe(old.history)
})
it('申请提交后切换为审核中，保留原始曝光与全部历史', async () => {
  payload = 'page!creators_original_content_rewards\u0000section under_review\u0000element under_review_done\u0000/creators/studio'
  const history = store[KeyCreatorRewardsHistory]
  expect((await refresh()).ok).toBe(true)
  expect(JSON.parse(store[KeyCreatorRewardsPageState] as string).stage).toBe('under_review')
  expect(JSON.parse(store[KeyCreatorRewardsStats] as string).impressionsCount).toBe(494600)
  expect(store[KeyCreatorRewardsHistory]).toBe(history)
})

it('已启用的收益面板保存发放信息，不覆盖曝光；规则中的 30 美元不计为已发放', async () => {
  const oldStats = store[KeyCreatorRewardsStats]
  const oldHistory = store[KeyCreatorRewardsHistory]
  const dashboard = 'page!creators_original_content_rewards\0section\tdashboard\0close_payouts_info\0最低发放金额为 $30。'
  payload = `${dashboard}\0\x05$0.00\x03\0���\0\x12累计收益发放\0付款\0下次发放日期\x03\0\x0cNov 20, 2026J`
  expect((await refresh()).ok).toBe(true)
  expect(JSON.parse(store[KeyCreatorRewardsPageState] as string)).toMatchObject({
    stage: 'active', paidAmount: '$0.00', nextPayoutDate: '2026-11-20',
  })
  expect(store[KeyCreatorRewardsStats]).toBe(oldStats)
  expect(store[KeyCreatorRewardsHistory]).toBe(oldHistory)

  vi.advanceTimersByTime(1000)
  payload = dashboard
  expect((await refresh()).ok).toBe(true)
  expect(JSON.parse(store[KeyCreatorRewardsPageState] as string)).toEqual({ stage: 'active', updatedAt: Date.now() })
})

it('只记录累计金额实际变化，重复刷新不新增，并按账号保留记录', async () => {
  const key = 'creatorRewardsPayoutHistory'
  const getLedger = (id: string) => (store[key] as any)?.[id]
  const load = async (amount: string) => {
    vi.setSystemTime(Date.now() + 86_400_000)
    payload = `page!creators_original_content_rewards\0section\tdashboard\0${amount}\x03\0累计收益发放`
    expect((await refresh()).ok).toBe(true)
  }
  await load('$100.00')
  expect(getLedger('123')).toMatchObject({ totalCents: 10000, records: [] })
  const baselineAt = Date.now()
  await load('$150.05')
  expect(getLedger('123').records).toEqual([{ fromAt: baselineAt, observedAt: Date.now(), changeCents: 5005 }])
  await load('$150.05')
  expect(getLedger('123').records).toHaveLength(1)
  await load('')
  expect(getLedger('123').totalCents).toBe(15005)
  account = '456'
  await load('$600.00')
  expect(getLedger('456')).toMatchObject({ totalCents: 60000, records: [] })
  expect(getLedger('123').records).toHaveLength(1)
})
it('没有历史数据的账户首次就进入申请页，同样成功且不写零值', async () => {
  delete store[KeyCreatorRewardsStats]; delete store[KeyCreatorRewardsHistory]
  expect((await refresh()).ok).toBe(true)
  expect(store[KeyCreatorRewardsStats]).toBeUndefined()
  expect(store[KeyCreatorRewardsHistory]).toBeUndefined()
  expect(JSON.parse(store[KeyCreatorRewardsPageState] as string).stage).toBe('application')
})
it('正常延迟或空响应：保留进度并报暂缺数据，不能识别成申请页或零曝光', async () => {
  payload = 'original_content_rewards creators'
  const response = await refresh()
  expect(response.ok).toBe(false)
  expect(response.error.code).toBe('error.rewardsParse')
  expect(JSON.parse(store[KeyCreatorRewardsStats] as string).impressionsCount).toBe(494600)
  expect(store[KeyCreatorRewardsPageState]).toBeUndefined()
})
it('已知申请状态下出现网络失败，不能清除达标状态与历史读数', async () => {
  await refresh()
  const page = store[KeyCreatorRewardsPageState]
  status = 503
  expect((await refresh()).error.code).toBe('error.rewardsHttp')
  expect(store[KeyCreatorRewardsPageState]).toBe(page)
  expect(JSON.parse(store[KeyCreatorRewardsStats] as string).impressionsCount).toBe(494600)
})
it('延迟更新时先返回昨天的值，随后跨过目标，记录真实数字而不产生清零', async () => {
  payload = 'Have at least 500K Verified Home Timeline impressions\n494.6K\nDoes not include replies'
  const history = store[KeyCreatorRewardsHistory]
  await refresh()
  expect(store[KeyCreatorRewardsHistory]).toBe(history)
  vi.advanceTimersByTime(600000)
  payload = 'Have at least 500K Verified Home Timeline impressions\n503.1K\nDoes not include replies'
  expect((await refresh()).ok).toBe(true)
  expect(JSON.parse(store[KeyCreatorRewardsStats] as string).impressionsCount).toBe(503100)
  expect(JSON.parse(store[KeyCreatorRewardsStats] as string).progressPercent).toBe(100)
  expect(JSON.parse(store[KeyCreatorRewardsHistory] as string)['2026-11-18']).toBe(503100)
})
