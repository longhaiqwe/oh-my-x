// 生产构建的 OCR 回归测试：真实 worker、语言数据与中英文图片，不访问 X 账号。
// REWIND_TESSDATA_DIR：含 eng/chi_sim/chi_tra/jpn/kor.traineddata 的目录（解压后）。
// Playwright 与 Chromium 路径变量与 test-rewind-extension.mjs 相同。
import assert from 'node:assert/strict'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const dataDir = process.env.REWIND_TESSDATA_DIR
if (!dataDir) throw Error('请设置 REWIND_TESSDATA_DIR，指向解压后的语言数据目录')
const { chromium } = await import(process.env.REWIND_PLAYWRIGHT_MODULE || 'playwright-core')
const profile = await mkdtemp(path.join(tmpdir(), 'ohmyx-ocr-'))
let context
try {
  const extension = path.join(profile, 'extension')
  await cp(path.resolve('build/chrome-mv3'), extension, { recursive: true })
  const manifestPath = path.join(extension, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.host_permissions.push('https://pbs.twimg.com/*')
  await writeFile(manifestPath, JSON.stringify(manifest))
  context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.REWIND_CHROMIUM || chromium.executablePath(),
    headless: false,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--headless=new', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  })
  const sw = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker')
  const id = new URL(sw.url()).host
  const page = await context.newPage()
  const errors = []
  page.on('console', message => {
    if (/Error opening data file|Failed loading language|TESSDATA_PREFIX|Parameter not found/.test(message.text()))
      errors.push(message.text())
  })
  page.on('pageerror', error => errors.push(error.message))
  // 使用同一入口的普通扩展页，便于拦截测试图片；后台仍通过正式消息接口调用。
  await page.goto(`chrome-extension://${id}/rewind-ocr.html`)
  for (const lang of ['eng', 'chi_sim', 'chi_tra', 'jpn', 'kor']) {
    const data = (await readFile(path.join(dataDir, `${lang}.traineddata`))).toString('base64')
    await page.evaluate(({ lang, data }) => new Promise((resolve, reject) => {
      const request = indexedDB.open('keyval-store')
      request.onupgradeneeded = () => request.result.createObjectStore('keyval')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('keyval', 'readwrite')
        const bytes = Uint8Array.from(atob(data), char => char.charCodeAt(0))
        tx.objectStore('keyval').put(bytes, `./${lang}.traineddata`)
        tx.oncomplete = () => { db.close(); resolve() }
        tx.onerror = () => { db.close(); reject(tx.error) }
      }
    }), { lang, data })
  }
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 900
    canvas.height = 320
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'black'
    ctx.font = '48px Arial'
    ctx.fillText('REWIND LOCAL SEARCH 123', 25, 80)
    ctx.font = '48px "PingFang SC", sans-serif'
    ctx.fillText('回看图片文字搜索', 25, 180)
    ctx.font = '48px "PingFang TC", sans-serif'
    ctx.fillText('回看圖片文字搜尋', 25, 280)
    return canvas.toDataURL().split(',')[1]
  })
  await page.route('https://pbs.twimg.com/**', route => route.fulfill({
    status: 200, contentType: 'image/png', body: Buffer.from(png, 'base64'),
  }))
  // 重复简中与英语，覆盖切换语言、销毁旧 worker 和重新读取缓存。
  for (const language of ['chi_sim+eng', 'chi_tra+eng', 'jpn+eng', 'kor+eng', 'eng', 'chi_sim+eng', 'eng']) {
    const result = await sw.evaluate(language => chrome.runtime.sendMessage({
      target: 'xf-rewind-ocr', src: 'https://pbs.twimg.com/media/ocr-fixture.png', language,
    }), language)
    assert.equal(result?.ok, true, JSON.stringify(result))
    assert.match(result.text, /LOCAL SEARCH/)
    if (language === 'chi_sim+eng') assert.match(result.text.replace(/\s/g, ''), /回看图片文字搜索/)
    if (language === 'chi_tra+eng') assert.match(result.text.replace(/\s/g, ''), /回看圖片文字搜尋/)
    assert.deepEqual(errors, [])
    console.log(`${language}: 识别通过，无语言加载错误`)
  }
} finally {
  await context?.close()
  await rm(profile, { recursive: true, force: true })
}
