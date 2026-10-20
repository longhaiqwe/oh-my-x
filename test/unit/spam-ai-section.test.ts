import { createApp, nextTick, type App as VueApp } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyLanguageSetting } from '../../shared/i18n'
import { REPLY_SCORE_SAMPLE_THREADS } from '../../shared/ai-reply-samples'
import { getTodayKey } from '../../shared/spam-logger'
import {
  KeyAiRepostApiKey,
  KeyAiRepostBaseUrl,
  KeySpamAiEnabled,
  KeySpamAiThreshold,
  KeySpamAiUsage,
} from '../../storage-keys'
import { event, flushMicrotasks } from '../helpers/runtime-port'

const sendAiRequest = vi.hoisted(() => vi.fn())
vi.mock('../../shared/ai-request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/ai-request')>()),
  sendAiRequest,
}))

const { default: SpamAiSection } = await import('../../entrypoints/popup/components/sections/SpamAiSection.vue')

const CJK = /[一-鿿]/
let app: VueApp | undefined
let root: HTMLDivElement
let store: Record<string, unknown>
let storedLabels: unknown[] = []

async function settle() {
  for (let i = 0; i < 4; i++) {
    await flushMicrotasks()
    await nextTick()
  }
}

function mount() {
  app = createApp(SpamAiSection)
  app.mount(root)
  return settle()
}

const button = (text: string) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)

beforeEach(() => {
  storedLabels = []
  store = {
    [KeySpamAiEnabled]: 'on',
    [KeyAiRepostApiKey]: 'test-key',
    [KeyAiRepostBaseUrl]: 'https://ai.example/v1',
    [KeySpamAiThreshold]: 75,
    [KeySpamAiUsage]: { date: getTodayKey(), auto: 12, manual: 3, cached: 40, failed: 1, folded: 5 },
  }
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('browser', {
    runtime: {
      id: 'test-extension',
      onMessage: { addListener: () => {} },
      sendMessage: vi.fn(async (message: any) => (message?.type === 'XF_REPLY_LABEL_LIST' ? { ok: true, labels: storedLabels } : undefined)),
    },
    i18n: { getUILanguage: () => 'en' },
    permissions: { contains: vi.fn().mockResolvedValue(true), request: vi.fn().mockResolvedValue(true) },
    storage: {
      local: {
        get: async (keys?: string | string[]) => {
          const list = keys === undefined ? Object.keys(store) : Array.isArray(keys) ? keys : [keys]
          return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]))
        },
        set: async (kv: Record<string, unknown>) => { Object.assign(store, kv) },
        remove: async () => {},
      },
      onChanged: event(),
    },
  })
  applyLanguageSetting('en')
  sendAiRequest.mockReset()
  root = document.createElement('div')
  document.body.append(root)
})

afterEach(() => {
  app?.unmount()
  app = undefined
  root.remove()
  applyLanguageSetting('auto')
  vi.unstubAllGlobals()
})

describe('AI 判断设置区', () => {
  it('英文界面：所有设置都显示，没有残留中文；今日统计读当天用量', async () => {
    await mount()
    const text = root.textContent ?? ''
    for (const title of ['Check automatically on', 'Collapse threshold', 'Scoring model', 'Daily auto limit', 'Test with samples']) {
      expect(text).toContain(title)
    }
    expect(text).toContain('Today: auto 12 · manual 3 · reused 40 · collapsed 5 · failed 1')
    expect(text).toContain('75')
    expect(CJK.test(text)).toBe(false)
    const placeholders = [...root.querySelectorAll('input')].map((i) => i.getAttribute('placeholder') ?? '')
    expect(placeholders.some((p) => CJK.test(p))).toBe(false)
  })

  it('用样例集测试：逐段发请求，显示相符条数、分类统计和用量；逐条结果可以展开', async () => {
    sendAiRequest.mockImplementation(async (message: any) => {
      const thread = REPLY_SCORE_SAMPLE_THREADS[message.threadIndex]
      return {
        ok: true,
        scores: thread.replies.map((r) => ({ id: r.id, score: r.expect === 'ai' ? 85 : 10, signals: [], reason: 'ok' })),
        usage: { promptTokens: 1000, completionTokens: 200 },
      }
    })
    await mount()
    button('Run test')!.click()
    await settle()
    expect(sendAiRequest).toHaveBeenCalledTimes(REPLY_SCORE_SAMPLE_THREADS.length)
    expect(sendAiRequest.mock.calls.map((c) => c[0])).toEqual(
      REPLY_SCORE_SAMPLE_THREADS.map((_, i) => ({ type: 'XF_TEST_REPLY_SCORE_SAMPLES', threadIndex: i, locale: 'en' })),
    )
    const total = REPLY_SCORE_SAMPLE_THREADS.reduce((n, t) => n + t.replies.length, 0)
    const text = root.textContent ?? ''
    expect(text).toContain(`Matched ${total}/${total}`)
    expect(text).toContain('unsure 0 · missing 0')
    expect(text).toContain(`${1000 * REPLY_SCORE_SAMPLE_THREADS.length} input tokens, ${200 * REPLY_SCORE_SAMPLE_THREADS.length} output tokens`)
    button('Per-reply results')!.click()
    await settle()
    expect(root.querySelectorAll('li')).toHaveLength(total)
  })

  it('某段对话出错时停下并写出原因', async () => {
    sendAiRequest.mockResolvedValueOnce({ ok: false, error: { code: 'error.aiNotAuthorized' } })
    await mount()
    button('Run test')!.click()
    await settle()
    expect(sendAiRequest).toHaveBeenCalledTimes(1)
    expect(root.textContent).toContain('Thread 1 failed:')
  })

  it('没填 API Key：提示去 AI 总结转发里填，测试按钮不可用', async () => {
    delete store[KeyAiRepostApiKey]
    await mount()
    expect(root.textContent).toContain('No API key yet')
    expect(button('Run test')!.disabled).toBe(true)
  })

  it('没授权接口域名：显示授权按钮', async () => {
    ;(globalThis as any).browser.permissions.contains.mockResolvedValue(false)
    await mount()
    expect(root.textContent).toContain('Access to the AI endpoint is not granted')
    button('Grant access')!.click()
    expect((globalThis as any).browser.permissions.request).toHaveBeenCalledWith({ origins: ['https://ai.example/*'] })
  })
})

describe('我的标注', () => {
  const label = (id: string, value: 'bot' | 'human') => ({
    id, label: value, author: 'bob', text: 'reply', parentAuthor: 'alice', parentText: 'post',
    delaySeconds: 30, followers: 64, verified: true, ai: null, labeledAt: Date.UTC(2026, 9, 20),
  })

  it('没有标注时显示「No labels yet」，导出按钮不可用', async () => {
    await mount()
    expect(root.textContent).toContain('No labels yet')
    expect(button('Export labels')!.disabled).toBe(true)
  })

  it('显示条数；导出成 JSONL 文件，文件名带日期', async () => {
    storedLabels = [label('1', 'bot'), label('2', 'human'), label('3', 'bot')]
    const blobs: Blob[] = []
    vi.stubGlobal('URL', Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => { blobs.push(blob); return 'blob:labels' }),
      revokeObjectURL: vi.fn(),
    }))
    const downloads: string[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download) })
    await mount()
    expect(root.textContent).toContain('3 labels: bot 2 · human 1')
    button('Export labels')!.click()
    await settle()
    expect(downloads).toEqual([`oh-my-x-reply-labels-${getTodayKey()}.jsonl`])
    const lines = (await blobs[0].text()).trimEnd().split('\n').map((l) => JSON.parse(l))
    expect(lines.map((l) => [l.id, l.expect])).toEqual([['1', 'ai'], ['2', 'human'], ['3', 'ai']])
    click.mockRestore()
  })
})
