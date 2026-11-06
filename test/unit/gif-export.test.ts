import { expect, it, vi } from 'vitest'
import { gifExportPlan, validateGifSource, fetchGifSource, encodeGifFrames } from '../../shared/gif-export'

it('缩小长边但不放大小图，保持时长并限制资源占用', () => {
  expect(gifExportPlan(1920, 1080, 2.25)).toEqual({ width: 480, height: 270, frames: 23, duration: 2.25 })
  expect(gifExportPlan(80, 120, 1)).toMatchObject({ width: 80, height: 120, frames: 10 })
  for (const duration of [0, NaN, Infinity, 60.1]) expect(() => gifExportPlan(100, 100, duration)).toThrow()
  expect(() => gifExportPlan(0, 100, 1)).toThrow()
})

it('只读取 X 视频域的 HTTPS MP4', () => {
  expect(validateGifSource('https://video.twimg.com/tweet_video/a.mp4?tag=1')).toContain('a.mp4')
  for (const url of ['https://example.com/a.mp4', 'http://video.twimg.com/a.mp4', 'https://video.twimg.com.evil.com/a.mp4', 'https://video.twimg.com/a.m3u8', 'file:///a.mp4']) {
    expect(() => validateGifSource(url)).toThrow()
  }
})

it('拒绝超过下载大小上限的响应', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('', { headers: { 'content-length': String(51 * 1024 * 1024) } }))
  await expect(fetchGifSource('https://video.twimg.com/a.mp4', new AbortController().signal, fetcher)).rejects.toThrow()
})

it('编码真实 GIF89a 数据、循环扩展和帧延迟', async () => {
  const frames = [new Uint8ClampedArray([255, 0, 0, 255]), new Uint8ClampedArray([0, 0, 255, 255])]
  const bytes = await encodeGifFrames({ width: 1, height: 1, frames: 2, duration: 0.2 }, async (i) => frames[i], new AbortController().signal)
  expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe('GIF89a')
  expect(new TextDecoder().decode(bytes)).toContain('NETSCAPE2.0')
  expect(bytes.at(-1)).toBe(0x3b)
  // 每帧都有 graphic control extension，延迟 10 个百分之一秒。
  const delays: number[] = []
  for (let i = 0; i < bytes.length - 5; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4) delays.push(bytes[i + 4] + bytes[i + 5] * 256)
  }
  expect(delays).toEqual([10, 10])
})

it('取消后不再读取动画帧，也不生成部分 GIF', async () => {
  const controller = new AbortController()
  const readFrame = vi.fn(async () => {
    controller.abort()
    return new Uint8ClampedArray([255, 0, 0, 255])
  })
  await expect(encodeGifFrames({ width: 1, height: 1, frames: 3, duration: 0.3 }, readFrame, controller.signal)).rejects.toThrow()
  expect(readFrame).toHaveBeenCalledTimes(1)
})

it('无 content-length 时仍按流式字节数限制大小', async () => {
  let cancelled = false
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(51 * 1024 * 1024)) },
    cancel() { cancelled = true },
  })
  const fetcher = vi.fn().mockResolvedValue(new Response(stream))
  await expect(fetchGifSource('https://video.twimg.com/a.mp4', new AbortController().signal, fetcher)).rejects.toThrow()
  expect(cancelled).toBe(true)
})

it('HTTP 错误与空源文件均不能进入转码', async () => {
  for (const response of [new Response('error', { status: 403 }), new Response('')]) {
    await expect(fetchGifSource('https://video.twimg.com/a.mp4', new AbortController().signal, vi.fn().mockResolvedValue(response))).rejects.toThrow()
  }
})

it('转换的最后一帧延迟保留非整数时长', async () => {
  const pixels = new Uint8ClampedArray([0, 0, 255, 255])
  const bytes = await encodeGifFrames({ width: 1, height: 1, frames: 3, duration: 0.25 }, async () => pixels, new AbortController().signal)
  const delays: number[] = []
  for (let i = 0; i < bytes.length - 5; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4) delays.push(bytes[i + 4] + bytes[i + 5] * 256)
  }
  expect(delays).toEqual([10, 10, 5])
})
