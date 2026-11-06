import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import { AppError } from './errors'

const MAX_SOURCE_BYTES = 50 * 1024 * 1024
const MAX_OUTPUT_BYTES = 64 * 1024 * 1024
const FPS = 10
export interface GifPlan { width: number; height: number; frames: number; duration: number }

export function gifExportPlan(width: number, height: number, duration: number): GifPlan {
  if (![width, height, duration].every(v => Number.isFinite(v) && v > 0)) throw new AppError('error.gifInvalidVideo')
  if (duration > 60) throw new AppError('error.gifTooLong')
  const scale = Math.min(1, 480 / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), frames: Math.ceil(duration * FPS), duration }
}

export function validateGifSource(raw: string): string {
  let url: URL
  try { url = new URL(raw) } catch { throw new AppError('error.gifInvalidSource') }
  if (url.protocol !== 'https:' || url.hostname !== 'video.twimg.com' || url.port || url.username || url.password || !url.pathname.endsWith('.mp4')) {
    throw new AppError('error.gifInvalidSource')
  }
  return url.href
}

/** 在扩展页面获取源文件，限制流式响应大小；不把媒体上传到外部服务。 */
export async function fetchGifSource(raw: string, signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Blob> {
  const response = await fetcher(validateGifSource(raw), { signal, credentials: 'omit', redirect: 'error' })
  if (!response.ok || !response.body) throw new AppError('error.gifFetchFailed')
  const reader = response.body.getReader()
  const chunks: Uint8Array<ArrayBuffer>[] = []
  let size = 0
  try {
    if (Number(response.headers.get('content-length')) > MAX_SOURCE_BYTES) throw new AppError('error.gifTooLarge')
    while (true) {
      signal.throwIfAborted()
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_SOURCE_BYTES) throw new AppError('error.gifTooLarge')
      chunks.push(new Uint8Array(value))
    }
    if (!size) throw new AppError('error.gifFetchFailed')
    return new Blob(chunks, { type: 'video/mp4' })
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/** 一次只保留一帧 RGBA 数据；延迟按百分之一秒取整，避免累计时长误差。 */
export async function encodeGifFrames(
  plan: GifPlan,
  readFrame: (index: number, time: number) => Promise<Uint8ClampedArray>,
  signal: AbortSignal,
  onProgress: (percent: number) => void = () => {},
): Promise<Uint8Array<ArrayBuffer>> {
  const gif = GIFEncoder()
  for (let i = 0; i < plan.frames; i++) {
    signal.throwIfAborted()
    const rgba = await readFrame(i, i / FPS)
    signal.throwIfAborted()
    const palette = quantize(rgba, 256, { format: 'rgb444' })
    const indexed = applyPalette(rgba, palette, 'rgb444')
    const end = Math.min((i + 1) / FPS, plan.duration)
    const delay = Math.max(20, (Math.round(end * 100) - Math.round(i / FPS * 100)) * 10)
    gif.writeFrame(indexed, plan.width, plan.height, { palette, delay, repeat: 0 })
    if (gif.bytesView().byteLength > MAX_OUTPUT_BYTES) throw new AppError('error.gifOutputTooLarge')
    onProgress(Math.round((i + 1) / plan.frames * 100))
    // 允许进度渲染和取消按钮事件执行。
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  signal.throwIfAborted()
  gif.finish()
  return gif.bytes()
}

function waitForVideo(video: HTMLVideoElement, event: string, start: () => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer)
      video.removeEventListener(event, ready)
      video.removeEventListener('error', failed)
      signal.removeEventListener('abort', aborted)
    }
    const ready = () => { cleanup(); resolve() }
    const failed = () => { cleanup(); reject(new AppError('error.gifInvalidVideo')) }
    const aborted = () => { cleanup(); reject(signal.reason) }
    const timer = setTimeout(failed, 15_000)
    video.addEventListener(event, ready, { once: true })
    video.addEventListener('error', failed, { once: true })
    signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) { aborted(); return }
    try { start() } catch (error) { cleanup(); reject(error) }
  })
}

export async function convertVideoToGif(source: Blob, signal: AbortSignal, onProgress: (percent: number) => void): Promise<Blob> {
  const video = document.createElement('video')
  video.muted = true
  video.preload = 'auto'
  const url = URL.createObjectURL(source)
  try {
    await waitForVideo(video, 'loadeddata', () => { video.src = url; video.load() }, signal)
    const plan = gifExportPlan(video.videoWidth, video.videoHeight, video.duration)
    const canvas = document.createElement('canvas')
    canvas.width = plan.width
    canvas.height = plan.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new AppError('error.gifInvalidVideo')
    const bytes = await encodeGifFrames(plan, async (index, time) => {
      if (index > 0) await waitForVideo(video, 'seeked', () => { video.currentTime = time }, signal)
      context.drawImage(video, 0, 0, plan.width, plan.height)
      return context.getImageData(0, 0, plan.width, plan.height).data
    }, signal, onProgress)
    return new Blob([bytes], { type: 'image/gif' })
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}
