import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { extractLocalRepostSource, updateAiRepostComposerButton } from '../../content-scripts/features/ai-repost'
import { sendAiRequest } from '../../shared/ai-request'
import { KeyAiRepostEnabled, KeyAiServiceApiKey } from '../../storage-keys'
import { flushMicrotasks } from '../helpers/runtime-port'

vi.mock('../../shared/ai-request', () => ({ sendAiRequest: vi.fn(), OPEN_SETTINGS: 'XF_OPEN_SETTINGS' }))

const composer = (id: string) => `<div id="${id}">
  <div style="display:flex;flex-direction:row">
    <div class="avatar"></div>
    <div class="content" style="display:flex;flex-direction:column">
      <div class="reply-to">回复 @author</div>
      <div class="editor-row" style="display:flex;flex-direction:row">
        <div class="DraftEditor-root"><div class="DraftEditor-editorContainer">
          <div contenteditable="true" data-testid="tweetTextarea_0">保留草稿</div>
        </div></div>
      </div>
      <div data-testid="toolBar"><button data-testid="tweetButtonInline">回复</button></div>
    </div>
  </div>
</div>`
const tweet = (id: string, text: string) => `<article data-testid="tweet">
  <div data-testid="User-Name">作者 @author</div>
  <a href="/author/status/${id}"><time>今天</time></a>
  <div data-testid="tweetText">${text}</div>
</article>`
const root = () => document.querySelector<HTMLElement>('#inline [data-xf-inline-composer]')!
const trigger = () => root().querySelector<HTMLButtonElement>('.xf-ai-repost-trigger')!
const originalUrl = window.location.href
const storageGet = vi.fn<() => Promise<Record<string, string>>>()

beforeEach(() => {
  window.history.replaceState({}, '', '/author/status/222')
  document.body.innerHTML = tweet('111', '讨论串的上级帖子') + tweet('222', '正在回复的原文') + composer('inline')
  storageGet.mockResolvedValue({ [KeyAiServiceApiKey]: 'test-key' })
  vi.stubGlobal('browser', {
    ...browser,
    runtime: { ...browser.runtime, id: 'test-extension' },
    storage: { local: { get: storageGet } },
  })
  vi.mocked(sendAiRequest).mockReset()
})
afterEach(async () => {
  document.body.innerHTML = ''
  await flushMicrotasks()
  window.history.replaceState({}, '', originalUrl)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('AI summary in inline reply composers', () => {
  it('places a single stable entry above the editor and keeps separate composers isolated', async () => {
    document.body.insertAdjacentHTML('beforeend', composer('second') + `<div role="dialog" aria-labelledby="modal-header">
      <div contenteditable="true" data-testid="tweetTextarea_0">弹窗草稿</div>
    </div>`)
    await updateAiRepostComposerButton()
    const button = trigger()
    const bar = button.parentElement!
    expect(bar.nextElementSibling).toBe(root().querySelector('.editor-row'))
    expect(root().querySelector('.reply-to')?.nextElementSibling).toBe(bar)
    for (let i = 0; i < 3; i++) await updateAiRepostComposerButton()
    expect(trigger()).toBe(button)
    expect(document.querySelectorAll('.xf-ai-repost-trigger')).toHaveLength(3)
    expect(document.querySelector('#second .xf-ai-repost-trigger')).not.toBeNull()
    expect(document.querySelector('[role="dialog"] .xf-ai-repost-trigger')).not.toBeNull()
  })

  it('uses the current post even when an ancestor comes first or another post was clicked', async () => {
    await updateAiRepostComposerButton()
    document.querySelector<HTMLElement>('article')!.click()
    root().querySelector('[contenteditable]')!.textContent = '草稿里的链接 https://x.com/other/status/999'
    expect(extractLocalRepostSource(root())).toEqual({
      tweetId: '222',
      source: { authorName: '作者 @author', authorHandle: 'author', title: undefined, text: '正在回复的原文' },
    })
    document.querySelectorAll('article')[1].remove()
    expect(extractLocalRepostSource(root())).toEqual({ tweetId: '222', source: null })
  })

  it('opens the panel, generates from the reply target, and fills only its own editor', async () => {
    document.body.insertAdjacentHTML('beforeend', composer('second'))
    vi.mocked(sendAiRequest)
      .mockResolvedValueOnce({ ok: true, source: { text: '正在回复的完整原文' } })
      .mockResolvedValueOnce({ ok: true, optionA: '总结草稿 A', optionB: '总结草稿 B' })
    await updateAiRepostComposerButton()
    trigger().click()
    await flushMicrotasks()
    expect(sendAiRequest).toHaveBeenNthCalledWith(1,
      { type: 'XF_FETCH_TWEET_FULL_TEXT', tweetId: '222' }, expect.any(AbortSignal))
    expect(sendAiRequest).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ source: expect.objectContaining({ text: '正在回复的完整原文' }) }), expect.any(AbortSignal))
    root().querySelector<HTMLElement>('[data-option="A"]')!.click()
    expect(root().querySelector('[contenteditable]')?.textContent).toBe('总结草稿 A')
    expect(document.querySelector('#second [contenteditable]')?.textContent).toBe('保留草稿')
  })

  it('removes inline entries and panels when the feature is disabled', async () => {
    vi.mocked(sendAiRequest).mockImplementation(() => new Promise(() => {}))
    await updateAiRepostComposerButton()
    trigger().click()
    await flushMicrotasks()
    storageGet.mockResolvedValue({ [KeyAiRepostEnabled]: 'off' })
    await updateAiRepostComposerButton()
    expect(document.querySelector('.xf-ai-repost-trigger, .xf-ai-repost-fallback-bar, .xf-ai-repost-panel')).toBeNull()
  })

  it('does not borrow a publish button across multiple editors or an unrelated dialog', async () => {
    document.body.innerHTML = `<main>
      <div contenteditable="true" data-testid="tweetTextarea_0"></div>
      <div contenteditable="true" data-testid="tweetTextarea_1"></div>
      <button data-testid="tweetButtonInline">回复</button>
    </main><div role="dialog">${composer('unrelated-dialog')}</div>`
    await updateAiRepostComposerButton()
    expect(document.querySelector('.xf-ai-repost-trigger')).toBeNull()
  })
})
