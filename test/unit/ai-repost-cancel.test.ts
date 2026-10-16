import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { updateAiRepostComposerButton } from '../../content-scripts/features/ai-repost'
import { KeyAiRepostApiKey } from '../../storage-keys'
import { portPair, flushMicrotasks } from '../helpers/runtime-port'

let ports: ReturnType<typeof portPair>[]
beforeEach(async () => {
  ports = []
  vi.stubGlobal('browser', {
    storage: { local: { get: async () => ({ [KeyAiRepostApiKey]: 'test-key' }) } },
    runtime: {
      id: 'test-extension',
      connect: vi.fn(() => { const pair = portPair(); ports.push(pair); return pair.client }),
      sendMessage: vi.fn(() => new Promise(() => {})),
    },
  })
  document.body.innerHTML = `<div role="dialog" aria-labelledby="modal-header">
    <div><button aria-haspopup="menu">每个人</button></div>
    <div contenteditable="true" data-testid="tweetTextarea_0">保留我的草稿</div>
    <div data-testid="tweetText">用来总结的原文内容</div>
  </div>`
  await updateAiRepostComposerButton()
})
afterEach(async () => { document.body.innerHTML = ''; await flushMicrotasks(); vi.unstubAllGlobals() })
const trigger = () => document.querySelector<HTMLButtonElement>('.xf-ai-repost-trigger')!

it('cancels immediately, restores the trigger, and ignores late results after reopening', async () => {
  trigger().click()
  await flushMicrotasks()
  expect(trigger().disabled).toBe(true)
  document.querySelector<HTMLButtonElement>('[data-action="close"]')!.click()
  expect(trigger().disabled).toBe(false)
  expect(ports[0].client.disconnect).toHaveBeenCalled()
  trigger().click()
  await flushMicrotasks()
  // Simulate an already queued response from the old connection.
  ports[0].client.onMessage.emit({ ok: true, optionA: '迟到结果', optionB: '迟到结果' })
  await flushMicrotasks()
  expect(document.body.textContent).not.toContain('迟到结果')
  ports[1].server.postMessage({ ok: true, optionA: '新的结果一', optionB: '新的结果二' })
  await flushMicrotasks()
  expect(document.body.textContent).toContain('新的结果一')
  expect(document.querySelector('[contenteditable]')?.textContent).toBe('保留我的草稿')
})

it('disconnects the active request when X removes its composer', async () => {
  trigger().click()
  await flushMicrotasks()
  document.querySelector('[role="dialog"]')!.remove()
  await flushMicrotasks()
  expect(ports[0]?.client.disconnect).toHaveBeenCalled()
})

it('does not start generation if closed while the full source is loading', async () => {
  document.querySelector('[role="dialog"]')!.insertAdjacentHTML('beforeend', '<a href="/author/status/12345"><time>today</time></a>')
  trigger().click()
  await flushMicrotasks()
  expect(ports[0]?.client.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'XF_FETCH_TWEET_FULL_TEXT' }))
  document.querySelector<HTMLButtonElement>('[data-action="close"]')!.click()
  ports[0].client.onMessage.emit({ ok: true, source: { text: '完整原文' } })
  await flushMicrotasks()
  expect(ports).toHaveLength(1)
})
