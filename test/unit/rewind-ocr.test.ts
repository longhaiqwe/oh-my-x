// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import {
  readRewindImage,
  rewindOcrLanguage,
  rewindOcrTasks,
} from '../../shared/rewind-ocr'
import type { RewindPost } from '../../shared/rewind'

describe('回看 OCR 与上游行为一致', () => {
  it.each([
    ['zh-CN', 'chi_sim+eng'],
    ['zh-TW', 'chi_tra+eng'],
    ['zh-Hant', 'chi_tra+eng'],
    ['ja-JP', 'jpn+eng'],
    ['ko-KR', 'kor+eng'],
    ['en-US', 'eng'],
    ['fr', 'eng'],
  ])('%s 使用 %s', (locale, expected) => {
    expect(rewindOcrLanguage(locale)).toBe(expected)
  })
  it('图片、视频封面、链接缩略图都进入队列，已识别的跳过', () => {
    const post = {
      id: '1',
      media: [
        { kind: 'image', src: 'https://pbs.twimg.com/media/a' },
        { kind: 'video', src: 'https://pbs.twimg.com/ext_tw_video_thumb/b' },
        { kind: 'link', src: 'https://pbs.twimg.com/card_img/c' },
        {
          kind: 'image',
          src: 'https://pbs.twimg.com/media/d',
          language: 'eng',
          text: '',
        },
      ],
    } as RewindPost
    expect(rewindOcrTasks([post], 'eng').map((t) => t.src)).toEqual(
      post.media.slice(0, 3).map((m) => m.src),
    )
  })
  it('失效图片返回空文字，下一张继续识别', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(
        new Response(new Blob(['png'], { type: 'image/png' })),
      )
    const recognize = vi.fn().mockResolvedValue('第二张图片文字')
    expect(
      await readRewindImage(
        'https://pbs.twimg.com/media/bad',
        recognize,
        fetcher,
      ),
    ).toBe('')
    expect(
      await readRewindImage(
        'https://pbs.twimg.com/media/good?name=small',
        recognize,
        fetcher,
      ),
    ).toBe('第二张图片文字')
    expect(recognize).toHaveBeenCalledTimes(1)
    expect(String(fetcher.mock.calls[1][0])).toContain('name=medium')
  })
  it('网络或图片解码失败不阻断队列；仍拒绝非 X 来源', async () => {
    const recognize = vi.fn().mockRejectedValue(new Error('decode'))
    expect(
      await readRewindImage(
        'https://pbs.twimg.com/media/a',
        recognize,
        vi.fn().mockRejectedValue(new Error('network')),
      ),
    ).toBe('')
    expect(
      await readRewindImage(
        'https://pbs.twimg.com/media/a',
        recognize,
        vi
          .fn()
          .mockResolvedValue(
            new Response(new Blob(['png'], { type: 'image/png' })),
          ),
      ),
    ).toBe('')
    const fetcher = vi.fn()
    await expect(
      readRewindImage('https://example.com/a', recognize, fetcher),
    ).rejects.toThrow('invalid image')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
