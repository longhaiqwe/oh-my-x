// @vitest-environment node
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, expect, it, vi } from 'vitest'
import { createWorker, OEM } from 'tesseract.js'

vi.mock('tesseract.js', () => ({
  OEM: { LSTM_ONLY: 1 },
  PSM: { SPARSE_TEXT: '11' },
  createWorker: vi.fn(async () => ({
    setParameters: vi.fn(),
    recognize: vi.fn(async () => ({ data: { blocks: [] } })),
    terminate: vi.fn(),
  })),
}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.resetModules()
})

it('中英文初始化只加载指定语言，禁用语言包自带的额外语言加载', async () => {
  const dbFactory = new IDBFactory()
  vi.stubGlobal('indexedDB', dbFactory)
  await new Promise<void>((resolve, reject) => {
    const request = dbFactory.open('keyval-store')
    request.onupgradeneeded = () => request.result.createObjectStore('keyval')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction('keyval', 'readwrite')
      for (const lang of ['chi_sim', 'eng'])
        tx.objectStore('keyval').put(new Uint8Array([1]), `./${lang}.traineddata`)
      tx.oncomplete = () => { db.close(); resolve() }
      tx.onerror = () => { db.close(); reject(tx.error) }
    }
  })
  const addListener = vi.fn()
  vi.stubGlobal('browser', {
    runtime: {
      id: 'ocr-test',
      getURL: (path: string) => `chrome-extension://ocr-test${path}`,
      sendMessage: vi.fn(async () => {}),
      onMessage: { addListener },
    },
  })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    new Blob(['image'], { type: 'image/png' }),
  )))
  await import('../../entrypoints/rewind-ocr/main')
  const response = await new Promise(resolve => {
    addListener.mock.calls[0][0](
      { target: 'xf-rewind-ocr', src: 'https://pbs.twimg.com/media/test', language: 'chi_sim+eng' },
      { id: 'ocr-test' },
      resolve,
    )
  })
  expect(response).toEqual({ ok: true, text: '' })
  // 必须在 Init 之前传入第四个参数，事后 setParameters 无法阻止额外语言加载。
  expect(createWorker).toHaveBeenCalledWith(
    'chi_sim+eng',
    OEM.LSTM_ONLY,
    expect.objectContaining({ cacheMethod: 'readOnly' }),
    'tessedit_load_sublangs \n',
  )
})
