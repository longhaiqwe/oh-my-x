// Run against a production build, using an isolated browser profile and synthetic X data.
// Set REWIND_PLAYWRIGHT_MODULE and REWIND_CHROMIUM when Playwright is not installed locally.
const { chromium } = await import(
  process.env.REWIND_PLAYWRIGHT_MODULE || 'playwright-core'
)
import { mkdtemp, rm, cp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
const artifacts = process.env.REWIND_SCREENSHOT_DIR
const testLanguage = process.env.REWIND_TEST_LANGUAGE || 'en'
async function screenshot(page, name) {
  if (artifacts) {
    await mkdir(artifacts, { recursive: true })
    await page.screenshot({ path: path.join(artifacts, name) })
  }
}
const profile = await mkdtemp(path.join(tmpdir(), 'ohmyx-rewind-'))
const extension = path.join(profile, 'extension')
await cp(path.resolve('build/chrome-mv3'), extension, { recursive: true })
// Only the temporary copy receives test permissions; the distributable keeps optional permissions.
const manifest = JSON.parse(
  await readFile(path.join(extension, 'manifest.json'), 'utf8'),
)
manifest.host_permissions.push(
  'https://pbs.twimg.com/*',
  'https://cdn.jsdelivr.net/*',
)
await writeFile(path.join(extension, 'manifest.json'), JSON.stringify(manifest))
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.REWIND_CHROMIUM || chromium.executablePath(),
  headless: false,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: [
    '--headless=new',
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
  viewport: { width: 1440, height: 1000 },
})
try {
  const cdp = await context.newCDPSession(context.pages()[0])
  // Playwright page routing does not cover offscreen documents. Intercept only the fixture image with CDP.
  let languageDownloads = 0
  const attached = new Set()
  const attach = async ({ targetInfo: t }) => {
    if (t.url.includes('rewind-ocr') && !attached.has(t.targetId)) {
      attached.add(t.targetId)
      const { sessionId } = await cdp.send('Target.attachToTarget', {
        targetId: t.targetId,
        flatten: false,
      })
      await cdp.send('Target.sendMessageToTarget', {
        sessionId,
        message: JSON.stringify({ id: 1, method: 'Runtime.enable' }),
      })
      await cdp.send('Target.sendMessageToTarget', {
        sessionId,
        message: JSON.stringify({ id: 2, method: 'Log.enable' }),
      })
      await cdp.send('Target.sendMessageToTarget', {
        sessionId,
        message: JSON.stringify({ id: 3, method: 'Network.enable' }),
      })
      await cdp.send('Target.sendMessageToTarget', {
        sessionId,
        message: JSON.stringify({
          id: 4,
          method: 'Fetch.enable',
          params: { patterns: [{ urlPattern: 'https://pbs.twimg.com/*' }] },
        }),
      })
    }
  }
  cdp.on('Target.targetCreated', attach)
  cdp.on('Target.targetInfoChanged', attach)
  cdp.on('Target.receivedMessageFromTarget', async ({ message, sessionId }) => {
    const m = JSON.parse(message)
    if (m.method === 'Fetch.requestPaused')
      await cdp.send('Target.sendMessageToTarget', {
        sessionId,
        message: JSON.stringify({
          id: 10,
          method: 'Fetch.fulfillRequest',
          params: {
            requestId: m.params.requestId,
            responseCode: m.params.request.url.includes('rewind-missing') ? 404 : 200,
            responseHeaders: [{ name: 'Content-Type', value: 'image/png' }],
            body: png,
          },
        }),
      })
    if (
      m.method === 'Network.responseReceived' &&
      m.params.response.url.includes('cdn.jsdelivr.net')
    )
      languageDownloads++
    if (
      [
        'Runtime.exceptionThrown',
        'Runtime.consoleAPICalled',
        'Network.loadingFailed',
      ].includes(m.method)
    )
      console.log('OCR debug', message)
  })
  await cdp.send('Target.setDiscoverTargets', { discover: true })
  let sw =
    context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'))
  await new Promise((r) => setTimeout(r, 1500))
  sw = context.serviceWorkers()[0]
  const id = new URL(sw.url()).host
  console.log('worker', sw.url())
  sw.on('console', (m) => {
    if (m.type() === 'error') console.log('worker error:', m.text())
  })
  await sw.evaluate(async () =>
    chrome.storage.local.set({
      extensionStatus: 'on',
      rewindEnabled: 'on',
      rewindNav: 'on',
      ownPostAutoSync: 'off',
      spamFilterEnabled: 'off',
      tweetFilterEnabled: 'off',
      uiLanguage: 'zh-CN',
    }),
  )
  await context.addCookies([
    {
      name: 'twid',
      value: 'u%3D12345',
      domain: '.x.com',
      path: '/',
      secure: true,
    },
  ])
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:white;color:#0f1419;font:16px system-ui}header{position:fixed;left:20px;width:180px}nav a{display:flex;padding:12px;color:inherit;text-decoration:none}nav a>div{display:flex;gap:12px}nav svg{width:24px;height:24px}.native-icon{fill:currentColor}main{margin-left:240px;width:600px}article{height:280px;padding:16px;border-bottom:1px solid #ddd}article [data-testid=tweetText]{margin-top:30px}</style></head><body><header role="banner"><nav role="navigation"><a data-testid="AppTabBar_Home_Link" href="/home"><div><svg class="native-icon" viewBox="0 0 24 24"></svg><span>主页</span></div></a><a data-testid="AppTabBar_Profile_Link" href="/reader_demo"><div><svg></svg><span>个人资料</span></div></a></nav></header><main role="main"><div data-testid="primaryColumn">${[1, 2, 3, 4, 5].map((i) => `<article data-testid="tweet"><div data-testid="User-Name"><span>测试作者${i}</span><a href="/author/status/${i}"><time datetime="2026-11-10T06:00:00Z">今天</time></a></div><div data-testid="tweetText">这是回看测试记录${i}，验证记录、搜索和刷新持久性。</div></article>`).join('')}</div></main></body></html>`
  await context.route('https://x.com/**', (r) =>
    r.fulfill({ status: 200, contentType: 'text/html', body: html }),
  )
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.goto('https://x.com/home')
  await page.locator('.xf-rewind-nav').waitFor({ timeout: 15000 })
  const iconFill = await page.locator('.xf-rewind-nav svg path').evaluate(el => getComputedStyle(el).fill)
  if (iconFill !== 'none') throw Error('X native fill overrides the Rewind outline')
  await page.waitForTimeout(2500)
  await page.locator('.xf-rewind-nav').click()
  await page
    .locator('#xf-rewind-root .post')
    .first()
    .waitFor({ timeout: 10000 })
  console.log(
    'initial posts',
    await page.locator('#xf-rewind-root .post').count(),
  )
  if (await page.locator('#xf-rewind-root .post').count() !== 3)
    throw Error('visible capture count')
  await screenshot(page, 'desktop.png')
  await page.locator('#xf-rewind-root input').fill('记录2')
  await page.waitForTimeout(500)
  console.log(
    'search posts',
    await page.locator('#xf-rewind-root .post').count(),
  )
  if (await page.locator('#xf-rewind-root .post').count() !== 1)
    throw Error('keyword filtering')
  for (const background of ['rgb(21, 32, 43)', 'rgb(0, 0, 0)', 'rgb(255, 255, 255)']) {
    await page.evaluate(color => {
      document.body.style.backgroundColor = color
      document.documentElement.style.setProperty('--xf-accent', 'rgb(120, 86, 255)')
      window.dispatchEvent(new Event('resize'))
    }, background)
    const actual = await page.locator('#xf-rewind-root .panel').evaluate(el => getComputedStyle(el).backgroundColor)
    if (actual !== background) throw Error('X theme adaptation')
    const accent = await page.locator('#xf-rewind-root [aria-pressed=true]').evaluate(el => getComputedStyle(el).color)
    if (accent !== 'rgb(120, 86, 255)') throw Error('X accent adaptation')
    if (background === 'rgb(21, 32, 43)') await screenshot(page, 'dim.png')
  }
  await page.evaluate(() => document.documentElement.style.removeProperty('--xf-accent'))
  for (const width of [600, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.waitForTimeout(100)
    const box = await page.locator('#xf-rewind-root .panel').boundingBox()
    if (Math.abs(box.width - (width <= 600 ? width : 440)) > 1) throw Error('responsive width')
  }
  console.log('three themes, custom accent, 600/1024/1440px layouts passed')
  const options = await context.newPage()
  await options.goto(`chrome-extension://${id}/options.html#layout/rewind`)
  await options.getByText('自动记录', { exact: true }).waitFor()
  await options.waitForFunction(() => document.querySelector('[role="switch"][aria-label="自动记录"]')?.getAttribute('aria-checked') === 'true')
  await options.waitForTimeout(200)
  console.log('options title', await options.title())

  await screenshot(options, 'settings.png')
  const rpc = (action, payload = {}) =>
    options.evaluate(
      ({ action, payload }) =>
        chrome.runtime.sendMessage({ type: 'XF_REWIND', action, ...payload }),
      { action, payload },
    )
  await page.bringToFront()
  await page.locator('#xf-rewind-root [data-filter=image]').click()
  await page.reload()
  await page.locator('.xf-rewind-nav').click()
  await page.waitForFunction(()=>document.getElementById('xf-rewind-root')?.shadowRoot.querySelector('[data-filter=image]').getAttribute('aria-pressed')==='true')
  await page.locator('#xf-rewind-root [data-filter=all]').click()
  await page.evaluate(()=>{window.rewindFixtureKeys=0;for(const type of ['keydown','keyup','keypress'])document.addEventListener(type,()=>window.rewindFixtureKeys++)})
  await page.locator('#xf-rewind-root input').pressSequentially('jkn')
  if(await page.evaluate(()=>window.rewindFixtureKeys)!==0)throw Error('X shortcut leaked from search')
  await page.locator('#xf-rewind-root input').fill('')
  console.log('filter persisted after reload; search keys isolated')
  const before = (await rpc('status')).result
  await options.getByRole('switch', { name: '自动记录', exact: true }).click()
  await options.waitForFunction(() => document.querySelector('[role="switch"][aria-label="自动记录"]')?.getAttribute('aria-checked') === 'false')
  if ((await rpc('status')).result.recording) throw Error('pause setting')
  if ((await rpc('status')).result.count !== before.count) throw Error('pause deleted history')
  await options.getByRole('switch', { name: '自动记录', exact: true }).click()
  await options.waitForFunction(() => document.querySelector('[role="switch"][aria-label="自动记录"]')?.getAttribute('aria-checked') === 'true')
  await page.bringToFront()
  await page.reload()
  await page.locator('.xf-rewind-nav').waitFor()
  await page.waitForTimeout(1800)
  if ((await rpc('status')).result.count !== before.count)
    throw Error('reload persistence/dedupe')
  await rpc('clear', { account: '12345' })
  await page.waitForTimeout(1900)
  if ((await rpc('status')).result.count !== 0)
    throw Error('cleared posts reappeared')
  const mismatch = await rpc('clear', { account: '99999' })
  if (mismatch.ok) throw Error('account isolation')
  await page.bringToFront()
  const png = await page.evaluate((chinese) => {
    const c = document.createElement('canvas')
    c.width = 800
    c.height = chinese ? 240 : 160
    const x = c.getContext('2d')
    x.fillStyle = 'white'
    x.fillRect(0, 0, c.width, c.height)
    x.fillStyle = 'black'
    x.font = 'bold 48px Arial'
    x.fillText('REWIND LOCAL SEARCH 123', 20, 90)
    if (chinese) {
      x.font = '48px "PingFang SC", sans-serif'
      x.fillText('回看图片文字搜索', 20, 180)
    }
    return c.toDataURL().split(',')[1]
  }, testLanguage === 'zh-CN')
  await context.route('https://pbs.twimg.com/**', (r) =>
    r.fulfill({
      status: r.request().url().includes('rewind-missing') ? 404 : 200,
      contentType: 'image/png',
      body: Buffer.from(png, 'base64'),
    }),
  )
  await sw.evaluate(async (uiLanguage) =>
    chrome.storage.local.set({ uiLanguage, rewindOcr: 'on' }), testLanguage,
  )
  await page.evaluate(() => {
    const a = document.createElement('article')
    a.setAttribute('data-testid', 'tweet')
    a.innerHTML =
      '<div data-testid="User-Name"><span>OCR author</span><a href="/ocr_author/status/99"><time datetime="2026-11-10">now</time></a></div><div data-testid="tweetText">An image with searchable text</div><div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/rewind-missing.png"><img src="https://pbs.twimg.com/media/rewind-test.png" style="width:400px;height:80px"></div><div data-testid="videoPlayer"><video poster="https://pbs.twimg.com/ext_tw_video_thumb/rewind-test.png"></video></div><div data-testid="card.wrapper"><img src="https://pbs.twimg.com/card_img/rewind-test.png"></div>'
    document.querySelector('main').prepend(a)
    window.scrollTo(0, 0)
  })
  let ocrResult
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(1500)
    ocrResult = await rpc('query', { query: 'LOCAL SEARCH' })
    if (ocrResult.result?.total === 1) break
    const state = (await rpc('status')).result?.ocrState
    if (i % 5 === 0) console.log('ocr progress', state)
    if (state?.phase === 'error') break
  }
  if (ocrResult.result?.total !== 1)
    throw Error(
      'OCR did not find test image: ' + JSON.stringify(await rpc('status')),
    )
  for(let i=0;i<40;i++){if((await rpc('status')).result.ocrState.phase==='ready')break;await page.waitForTimeout(500)}
  ocrResult=await rpc('query',{query:'LOCAL SEARCH'})
  const media=ocrResult.result.posts[0].media
  if(media.length!==4 || !media.every(m=>m.language))throw Error('OCR queue did not finish all media')
  for(const kind of ['image','video','link'])if(!media.some(m=>m.kind===kind&&m.text.includes('LOCAL SEARCH')))throw Error('OCR media coverage: '+kind)
  if(media.find(m=>m.src.includes('rewind-missing')).text!=='')throw Error('failed image was not skipped')
  console.log('ocr recognized', media.find(m=>m.src.includes('/media/rewind-test')).text)
  console.log('OCR skipped missing image, recognized video and link thumbnails')
  if (testLanguage === 'zh-CN' && !(await rpc('query', { query: '回看图片文字' })).result.total)
    throw Error('Chinese OCR search')
  await page.locator('.xf-rewind-nav').click()
  await page.locator('#xf-rewind-root input').fill('LOCAL SEARCH')
  await page.waitForTimeout(500)
  await screenshot(page, 'ocr.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(100)
  const mobile = await page.locator('#xf-rewind-root .panel').boundingBox()
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    client: document.documentElement.clientWidth,
  }))
  console.log('mobile dimensions', { mobile, viewport })
  if (Math.abs(mobile.width - viewport.client) > 1) throw Error('mobile width')
  await screenshot(page, 'mobile.png')
  await page.keyboard.press('Escape')
  if (await page.locator('#xf-rewind-root').count()) throw Error('Escape close')
  if (
    await page.evaluate(
      () =>
        document.documentElement.style.overflow === 'hidden' ||
        document.querySelector('main').inert,
    )
  )
    throw Error('mobile background was not restored')
  await options.evaluate(() => chrome.storage.local.set({ rewindOcr: 'off' }))
  if ((await rpc('query', { query: 'LOCAL SEARCH' })).result.total !== 0)
    throw Error('disabled OCR remains searchable')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => {
    const a = document.querySelector('article').cloneNode(true)
    a.querySelector('a').href = '/ocr_author/status/100'
    document.querySelector('main').prepend(a)
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(2000)
  const firstDownloads = languageDownloads
  await options.evaluate(() => chrome.storage.local.set({ rewindOcr: 'on' }))
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(500)
    if ((await rpc('query', { query: 'LOCAL SEARCH' })).result.total === 2)
      break
  }
  if ((await rpc('query', { query: 'LOCAL SEARCH' })).result.total !== 2)
    throw Error('OCR restart')
  if (languageDownloads !== firstDownloads)
    throw Error('language data was downloaded again')
  console.log('OCR restart reused cached language data')
  // Exercise newly supported language workers directly in the isolated extension.
  // Locale selection itself is covered by the unit tests; this checks actual data and WASM loading.
  if (process.env.REWIND_EXTRA_LANGUAGES === '1') {
    await options.evaluate(() => chrome.storage.local.set({rewindOcr:'off'}))
    for (let i=0;i<20;i++){if(!await sw.evaluate(()=>chrome.offscreen.hasDocument()))break;await page.waitForTimeout(100)}
    for (const language of ['jpn+eng','kor+eng']) {
      await sw.evaluate(()=>chrome.offscreen.createDocument({url:chrome.runtime.getURL('/rewind-ocr.html'),reasons:['WORKERS'],justification:'Verify bundled OCR language support in isolated test profile.'}))
      const recognized=await sw.evaluate(language=>chrome.runtime.sendMessage({target:'xf-rewind-ocr',src:'https://pbs.twimg.com/media/rewind-test.png',language}),language)
      if(!recognized?.ok || !recognized.text.includes('LOCAL SEARCH'))throw Error('language worker: '+language)
      console.log('language worker ready', language)
      await sw.evaluate(()=>chrome.offscreen.closeDocument())
    }
  }

  await options.evaluate(async () => {
    await chrome.storage.local.set({ rewindEnabled: 'off', rewindOcr: 'off' })
    await new Promise((resolve, reject) => {
      const r = indexedDB.open('oh-my-x-rewind')
      r.onsuccess = () => {
        const db = r.result,
          t = db.transaction('posts', 'readwrite'),
          store = t.objectStore('posts')
        store.clear()
        for (let i = 0; i < 3000; i++)
          store.put({
            account: '12345',
            id: String(1000 + i),
            handle: 'fixture',
            name: '搜索性能样本',
            avatar: '',
            text: '回看性能测试正文和搜索词 '.repeat(70) + i,
            quote: null,
            media: [],
            context: '',
            repost: false,
            postedAt: '2026-11-10',
            firstSeenAt: Date.now() - i,
          })
        t.oncomplete = () => {
          db.close()
          resolve()
        }
        t.onerror = () => reject(t.error)
      }
    })
  })
  const timings = []
  for (let i = 0; i < 35; i++) {
    const start = performance.now()
    const q = await rpc('query', { query: String(i) })
    if (q.result.count !== 3000) throw Error('benchmark fixture')
    if (i >= 5) timings.push(performance.now() - start)
  }
  timings.sort((a, b) => a - b)
  console.log(
    'SEARCH BENCHMARK',
    JSON.stringify({
      records: 3000,
      samples: 30,
      medianMs: timings[15],
      p95Ms: timings[28],
      maxMs: timings[29],
    }),
  )
  console.log('language downloads', languageDownloads)
  // Keep the old X document alive across an actual isolated extension reload.
  // Its timers and cleanup handlers must not keep calling invalidated APIs.
  if (!await page.locator('#xf-rewind-root').count())
    await page.locator('.xf-rewind-nav').click()
  await page.locator('#xf-rewind-root .panel').waitFor()
  await sw.evaluate(() => { setTimeout(() => chrome.runtime.reload(), 0) })
  await page.locator('.xf-rewind-nav').waitFor({state:'detached', timeout:10000})
  if (await page.locator('#xf-rewind-root').count()) throw Error('stale Rewind panel survived reload')
  await page.evaluate(() => {
    window.dispatchEvent(new Event('scroll'))
    window.dispatchEvent(new Event('resize'))
    window.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape'}))
  })
  await page.waitForTimeout(2000)
  if (pageErrors.some(message => /extension context invalidated/i.test(message)))
    throw Error('uncaught invalidated context: ' + pageErrors.join('\n'))
  console.log('extension reload: old Rewind UI removed; no uncaught invalidated-context errors')
  console.log(
    'INTEGRATION PASS: capture, search, settings, persistence, dedupe, clear generation, account isolation, real OCR, mobile, Escape',
  )
} finally {
  await context.close()
  await rm(profile, { recursive: true, force: true })
}
