import { afterEach, expect, it, vi } from 'vitest'
import { startVoiceCapture } from '../../content-scripts/options/voice-reply-recorder'

afterEach(() => vi.unstubAllGlobals())

it('stops a microphone granted after the reply has been abandoned', async () => {
  const stop = vi.fn()
  let grant!: (value: MediaStream) => void
  const getUserMedia = vi.fn(() => new Promise<MediaStream>(resolve => { grant = resolve }))
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })

  const controller = new AbortController()
  const capture = startVoiceCapture({ signal: controller.signal, label: 'Voice reply', onInterrupted: vi.fn() })
  expect(getUserMedia).toHaveBeenCalledWith({ audio: { channelCount: 1 }, video: false })
  controller.abort()
  grant({ getTracks: () => [{ stop }] } as unknown as MediaStream)
  await expect(capture).rejects.toMatchObject({ name: 'AbortError' })
  expect(stop).toHaveBeenCalledTimes(1)
})
