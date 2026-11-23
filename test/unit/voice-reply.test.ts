import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { updateVoiceReplyComposers } from '../../content-scripts/options/voice-reply'
import { startVoiceCapture } from '../../content-scripts/options/voice-reply-recorder'

vi.mock('../../content-scripts/options/voice-reply-recorder', () => ({
  MAX_VOICE_REPLY_MS: 30_000,
  MIN_VOICE_REPLY_MS: 1000,
  supportsVoiceCapture: () => true,
  startVoiceCapture: vi.fn(),
}))

const recording = new Blob(['test voice'], { type: 'video/mp4' })
const capture = vi.mocked(startVoiceCapture)
const composer = (inline: boolean) => `
  <div>
    <div data-testid="tweetTextarea_0_label"><div contenteditable="true" data-testid="tweetTextarea_0"></div></div>
    <div data-testid="toolBar"><div data-testid="ScrollSnap-List">
      <input data-testid="fileInput" type="file" accept="image/jpeg,video/mp4">
      <button type="button" aria-label="Media"></button>
    </div></div>
    <button type="button" data-testid="${inline ? 'tweetButtonInline' : 'tweetButton'}">Reply</button>
  </div>`

function find<T extends HTMLElement = HTMLButtonElement>(id: string): T {
  return document.querySelector<T>(`[data-testid="${id}"]`)!
}

async function record() {
  find('xf-voice-reply-record').click()
  await vi.advanceTimersByTimeAsync(1100)
  find('xf-voice-reply-stop').click()
  await vi.advanceTimersByTimeAsync(0)
}

describe('voice replies in the X composer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    capture.mockReset()
    capture.mockResolvedValue({ stop: async () => recording })
    vi.stubGlobal('DataTransfer', class {
      private fileList: File[] = []
      readonly items = { add: (file: File) => this.fileList.push(file) }
      get files() { return this.fileList }
    })
    vi.stubGlobal('URL', class extends URL {
      static createObjectURL = vi.fn(() => 'blob:preview')
      static revokeObjectURL = vi.fn()
    })
  })

  afterEach(() => {
    document.body.replaceChildren()
    updateVoiceReplyComposers()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    history.replaceState(null, '', '/')
  })

  it('mounts once on inline replies, not on the home composer', () => {
    document.body.innerHTML = composer(true)
    history.replaceState(null, '', '/home')
    updateVoiceReplyComposers()
    expect(find('xf-voice-reply-record')).toBeNull()
    history.replaceState(null, '', '/jack/status/20')
    updateVoiceReplyComposers()
    updateVoiceReplyComposers()
    expect(document.querySelectorAll('[data-testid="xf-voice-reply-record"]')).toHaveLength(1)
  })

  it('requires a preceding reply preview in a modal and excludes quotes', () => {
    history.replaceState(null, '', '/compose/post')
    document.body.innerHTML = `<div role="dialog" aria-labelledby="modal-header">${composer(false)}<article data-testid="tweet"></article></div>`
    updateVoiceReplyComposers()
    expect(find('xf-voice-reply-record')).toBeNull()
    document.querySelector('[role="dialog"]')!.prepend(document.querySelector('article')!)
    updateVoiceReplyComposers()
    expect(find('xf-voice-reply-record')).not.toBeNull()
  })

  it('gives the current X input one MP4 only after confirmation and never submits', async () => {
    history.replaceState(null, '', '/jack/status/20')
    document.body.innerHTML = composer(true)
    const input = find<HTMLInputElement>('fileInput')
    Object.defineProperty(input, 'files', { writable: true, value: [] })
    const added = vi.fn(() => {
      const attachment = document.createElement('div')
      attachment.dataset.testid = 'attachments'
      attachment.append(document.createElement('video'))
      input.closest('[data-testid="toolBar"]')!.before(attachment)
    })
    const submit = vi.fn()
    input.addEventListener('change', added)
    find('tweetButtonInline').addEventListener('click', submit)
    updateVoiceReplyComposers()
    await record()
    expect(added).not.toHaveBeenCalled()
    expect(find('xf-voice-reply-listen')).not.toBeNull()
    find('xf-voice-reply-attach').click()
    await vi.advanceTimersByTimeAsync(0)
    expect(added).toHaveBeenCalledTimes(1)
    expect(input.files?.[0]).toMatchObject({ name: 'ohmyx-voice-reply.mp4', type: 'video/mp4' })
    expect(submit).not.toHaveBeenCalled()
  })

  it('keeps the recording when an existing attachment prevents handoff', async () => {
    history.replaceState(null, '', '/jack/status/20')
    document.body.innerHTML = composer(true)
    updateVoiceReplyComposers()
    await record()
    const input = find<HTMLInputElement>('fileInput')
    const added = vi.fn()
    input.addEventListener('change', added)
    const attachment = document.createElement('div')
    attachment.dataset.testid = 'attachments'
    attachment.append(document.createElement('img'))
    input.closest('[data-testid="toolBar"]')!.before(attachment)
    find('xf-voice-reply-attach').click()
    expect(added).not.toHaveBeenCalled()
    expect(find('xf-voice-reply-listen')).not.toBeNull()
    expect(document.querySelector('[role="alert"]')?.textContent).toBeTruthy()
  })

  it('keeps the preview while X replaces its media input', async () => {
    history.replaceState(null, '', '/jack/status/20')
    document.body.innerHTML = composer(true)
    updateVoiceReplyComposers()
    await record()
    const input = find<HTMLInputElement>('fileInput')
    const toolbar = input.parentElement!
    input.remove()
    updateVoiceReplyComposers()
    expect(find('xf-voice-reply-listen')).not.toBeNull()
    find('xf-voice-reply-attach').click()
    expect(document.querySelector('[role="alert"]')?.textContent).toBeTruthy()
    const replacement = input.cloneNode() as HTMLInputElement
    toolbar.prepend(replacement)
    updateVoiceReplyComposers()
    Object.defineProperty(replacement, 'files', { writable: true, value: [] })
    const received = vi.fn()
    replacement.addEventListener('change', received)
    find('xf-voice-reply-attach').click()
    expect(received).toHaveBeenCalledTimes(1)
  })

  it('cancels microphone access when the reply target changes', async () => {
    history.replaceState(null, '', '/jack/status/20')
    document.body.innerHTML = composer(true)
    updateVoiceReplyComposers()
    find('xf-voice-reply-record').click()
    const signal = capture.mock.calls[0][0].signal
    expect(signal.aborted).toBe(false)
    history.replaceState(null, '', '/jack/status/21')
    updateVoiceReplyComposers()
    expect(signal.aborted).toBe(true)
    expect(find('xf-voice-reply-stop')).toBeNull()
  })
})
