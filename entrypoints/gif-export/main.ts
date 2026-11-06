import { copyGifToClipboard } from '../../shared/gif-clipboard'
import { applyLanguageSetting, initI18n, t } from '../../shared/i18n'
import { AppError, errorText, fromTransferable } from '../../shared/errors'
import { convertVideoToGif, fetchGifSource } from '../../shared/gif-export'
import type { ExtractedTweetMedia } from '../../shared/tweet-media'
import './style.css'

const params = new URLSearchParams(location.search)
const status = document.querySelector<HTMLElement>('#status')!
const progress = document.querySelector<HTMLProgressElement>('#progress')!
const preview = document.querySelector<HTMLImageElement>('#preview')!
const cancel = document.querySelector<HTMLButtonElement>('#cancel')!
const retry = document.querySelector<HTMLButtonElement>('#retry')!
const save = document.querySelector<HTMLAnchorElement>('#save')!
let controller: AbortController
const copy = document.querySelector<HTMLButtonElement>('#copy')!
let outputGif: Blob | undefined
let outputUrl: string | undefined

function clearOutput() {
  preview.removeAttribute('src')
  save.removeAttribute('href')
  if (outputUrl) URL.revokeObjectURL(outputUrl)
  outputUrl = undefined
  outputGif = undefined
  preview.hidden = save.hidden = copy.hidden = true
}

/** runtime 消息不可中断；取消或超时后丢弃迟到的回复。 */
function resolveMedia(tweetId: string, signal: AbortSignal): Promise<ExtractedTweetMedia> {
  return new Promise((resolve, reject) => {
    const aborted = () => { cleanup(); reject(signal.reason) }
    const cleanup = () => signal.removeEventListener('abort', aborted)
    signal.addEventListener('abort', aborted, { once: true })
    if (signal.aborted) { aborted(); return }
    void browser.runtime.sendMessage({ type: 'XF_GET_TWEET_MEDIA', tweetId }).then(result => {
      cleanup()
      if (signal.aborted) return
      if (!result?.ok || !result.media) reject(fromTransferable(result?.error, 'error.gifInvalidSource'))
      else resolve(result.media)
    }, error => { cleanup(); reject(error) })
  })
}

async function run() {
  controller = new AbortController()
  const signal = controller.signal
  clearOutput()
  retry.hidden = true
  cancel.hidden = false
  progress.hidden = false
  progress.removeAttribute('value')
  status.textContent = t('gifExport.resolving')
  try {
    const tweetId = params.get('tweetId') || ''
    if (!/^\d+$/.test(tweetId)) throw new AppError('error.gifInvalidSource')
    const media = await resolveMedia(tweetId, AbortSignal.any([signal, AbortSignal.timeout(30_000)]))
    const item = media.gifs[0] || media.videos[0]
    if (!item?.bestMp4Url) throw new AppError('error.gifInvalidSource')
    status.textContent = t('gifExport.fetching')
    const source = await fetchGifSource(item.bestMp4Url, AbortSignal.any([signal, AbortSignal.timeout(60_000)]))
    const gif = await convertVideoToGif(source, signal, percent => {
      progress.value = percent
      status.textContent = t('gifExport.encoding', { percent })
    })
    signal.throwIfAborted()
    outputGif = gif
    outputUrl = URL.createObjectURL(gif)
    copy.hidden = false
    preview.src = outputUrl
    preview.hidden = false
    save.href = outputUrl
    save.download = `x_${(media.authorHandle || 'gif').replace(/[^a-zA-Z0-9_]/g, '')}_${tweetId}.gif`
    save.hidden = false
    status.textContent = t('gifExport.ready', { size: (gif.size / 1024 / 1024).toFixed(2) })
  } catch (error) {
    status.textContent = signal.aborted ? t('gifExport.cancelled') : t('gifExport.failed', {
      reason: error instanceof DOMException && error.name === 'TimeoutError' ? t('error.gifTimeout') : errorText(error, 'error.gifFetchFailed'),
    })
  } finally {
    cancel.hidden = true
    retry.hidden = false
    progress.hidden = true
  }
}

copy.addEventListener('click', () => {
  if (!outputGif || copy.disabled) return
  copy.disabled = true
  const copiedGif = outputGif
  void copyGifToClipboard(copiedGif).then(() => {
    if (outputGif === copiedGif) status.textContent = t('gifExport.copied')
  }, error => {
    if (outputGif === copiedGif) status.textContent = errorText(error, 'error.gifCopyFailed')
  }).finally(() => { copy.disabled = false })
})

cancel.addEventListener('click', () => controller?.abort())
retry.addEventListener('click', () => void run())
window.addEventListener('pagehide', () => { controller?.abort(); clearOutput() })

void initI18n().then(() => {
  const locale = params.get('locale')
  if (locale === 'zh-CN' || locale === 'en') applyLanguageSetting(locale)
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'
  document.title = `${t('gifExport.title')} · oh-my-x`
  document.querySelector('#title')!.textContent = t('gifExport.title')
  document.querySelector('#note')!.textContent = t('gifExport.note')
  preview.alt = t('gifExport.preview')
  cancel.textContent = t('gifExport.cancel')
  retry.textContent = t('gifExport.retry')
  save.textContent = t('gifExport.save')
  copy.textContent = t('gifExport.copy')
  progress.setAttribute('aria-label', t('gifExport.title'))
  void run()
})
