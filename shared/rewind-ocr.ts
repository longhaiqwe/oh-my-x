import { safeRewindImage, type RewindPost } from './rewind'

export const REWIND_OCR_LANGUAGES = [
  'eng',
  'chi_sim+eng',
  'chi_tra+eng',
  'jpn+eng',
  'kor+eng',
]

// Follow the browser language, independently of oh-my-x's interface language.
export function rewindOcrLanguage(locale: string): string {
  const language = locale.toLowerCase()
  if (language.startsWith('zh'))
    return /tw|hk|mo|hant/.test(language) ? 'chi_tra+eng' : 'chi_sim+eng'
  if (language.startsWith('ja')) return 'jpn+eng'
  if (language.startsWith('ko')) return 'kor+eng'
  return 'eng'
}

export function rewindOcrTasks(posts: RewindPost[], language: string) {
  return posts.flatMap((post) =>
    post.media
      .filter((media) => media.language !== language)
      .map((media) => ({ id: post.id, src: media.src })),
  )
}

// Initialize/download the engine before this function. Only an individual image's
// fetch/decode/recognition failure is skipped; an unavailable engine remains retryable.
export async function readRewindImage(
  src: string,
  recognize: (image: Blob) => Promise<string>,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  if (!safeRewindImage(src)) throw new Error('invalid image')
  const url = new URL(src)
  if (url.pathname.startsWith('/media/')) url.searchParams.set('name', 'medium')
  try {
    const response = await fetcher(url, {
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    })
    if (
      !response.ok ||
      Number(response.headers.get('content-length')) > 10 * 1024 * 1024
    )
      return ''
    const blob = await response.blob()
    if (blob.size > 10 * 1024 * 1024 || !blob.type.startsWith('image/'))
      return ''
    return (await recognize(blob)).slice(0, 8000)
  } catch {
    return ''
  }
}
