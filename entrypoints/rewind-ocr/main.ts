import { createWorker, OEM, PSM, type Worker } from 'tesseract.js'
import { REWIND_OCR_LANGUAGES, readRewindImage } from '../../shared/rewind-ocr'
import { REWIND_MESSAGE, safeRewindImage } from '../../shared/rewind'

let worker: Worker | undefined,
  language = '',
  busy = false
const DATA = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data'
async function cache(lang: string, data?: Uint8Array): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('keyval-store')
    request.onupgradeneeded = () => request.result.createObjectStore('keyval')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result,
        tx = db.transaction('keyval', data ? 'readwrite' : 'readonly'),
        store = tx.objectStore('keyval')
      const key = `./${lang}.traineddata`,
        r = data ? store.put(data, key) : store.getKey(key)
      tx.oncomplete = () => {
        db.close()
        resolve(r.result !== undefined)
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error)
      }
    }
  })
}
async function progress(value?: number) {
  await browser.runtime
    .sendMessage({ type: REWIND_MESSAGE, action: 'progress', progress: value })
    .catch(() => {})
}
async function download(langs: string[]) {
  for (let index = 0; index < langs.length; index++) {
    const lang = langs[index]
    if (await cache(lang)) continue
    const res = await fetch(
      `${DATA}/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
      {
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(120_000),
      },
    )
    if (!res.ok || !res.body) throw new Error('language data')
    const length = Number(res.headers.get('content-length')) || 0,
      reader = res.body.getReader(),
      chunks: Uint8Array[] = []
    let received = 0,
      last = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.length
      if (received > 30 * 1024 * 1024) {
        await reader.cancel()
        throw new Error('language size')
      }
      chunks.push(value)
      if (Date.now() - last > 300) {
        last = Date.now()
        await progress(
          length ? (index + received / length) / langs.length : undefined,
        )
      }
    }
    const bytes = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    await cache(lang, bytes)
  }
}
async function read(src: string, langs: string) {
  if (!safeRewindImage(src) || !REWIND_OCR_LANGUAGES.includes(langs))
    throw new Error('invalid request')
  if (!worker || language !== langs) {
    await worker?.terminate()
    worker = undefined
    await download(langs.split('+'))
    // 第四个参数在初始化前禁用附加语言加载；所有识别语言已在 langs 中明确指定。
    // 避免语言包自带的附加语言配置导致请求乱码文件名，不能等 setParameters 时再设置。
    worker = await createWorker(langs, OEM.LSTM_ONLY, {
      workerPath: new URL('ocr/worker.min.js', browser.runtime.getURL('/'))
        .href,
      // CJK language data includes legacy parameters, even with LSTM recognition.
      // The full core accepts those parameters without emitting missing-parameter warnings.
      corePath: new URL(
        'ocr/tesseract-core-simd.js',
        browser.runtime.getURL('/'),
      ).href,
      workerBlobURL: false,
      cacheMethod: 'readOnly',
      langPath: DATA,
    }, 'tessedit_load_sublangs \n')
    language = langs
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT })
  }
  return readRewindImage(src, async (blob) => {
    const { data } = await worker!.recognize(
      blob,
      {},
      { text: false, blocks: true },
    )
    return (data.blocks || [])
      .flatMap((b) =>
        b.paragraphs.flatMap((p) =>
          p.lines.map((l) =>
            l.words
              .filter((w) => w.confidence >= 60)
              .map((w) => w.text)
              .join(' '),
          ),
        ),
      )
      .join('\n')
      .slice(0, 8000)
  })
}
browser.runtime.onMessage.addListener((m, sender, respond) => {
  if (
    m?.target !== 'xf-rewind-ocr' ||
    sender.id !== browser.runtime.id ||
    sender.tab
  )
    return
  if (busy) {
    respond({ ok: false })
    return
  }
  busy = true
  // Offscreen messages keep a long recognition/download alive across MV3 idle deadlines.
  const heartbeat = setInterval(() => {
    void browser.runtime
      .sendMessage({ type: 'XF_REWIND_OCR_ALIVE' })
      .catch(() => {})
  }, 15_000)
  void read(m.src, m.language)
    .then(
      (text) => respond({ ok: true, text }),
      (error) => {
        console.warn('[oh-my-x] Rewind OCR failed', error)
        respond({ ok: false })
      },
    )
    .finally(() => {
      busy = false
      clearInterval(heartbeat)
    })
  return true
})
