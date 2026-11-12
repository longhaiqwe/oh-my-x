// Production Vue panel in real Chromium; synthetic records, no X API calls.
// AUDIENCE_PLAYWRIGHT_MODULE and AUDIENCE_CHROMIUM may point to an existing installation.
import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdir, readFile } from 'node:fs/promises'
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
const { chromium } = await import(
  process.env.AUDIENCE_PLAYWRIGHT_MODULE || 'playwright-core'
)
const result = await build({
  configFile: false,
  logLevel: 'error',
  plugins: [vue()],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __VUE_OPTIONS_API__: true,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  build: {
    write: false,
    minify: false,
    lib: {
      entry: path.resolve('shared/audience-panel.ts'),
      name: 'AudiencePreview',
      formats: ['iife'],
    },
  },
})
const code = (Array.isArray(result) ? result[0] : result).output.find(
  (o) => o.type === 'chunk',
).code
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.AUDIENCE_CHROMIUM,
})
const output = '/tmp/oh-my-x-audience-validation'
await mkdir(output, { recursive: true })
const fixture = `<!doctype html><meta charset="utf-8"><style>:root{--xf-accent:rgb(255,122,0);--xf-accent-rgb:255,122,0}body{margin:0;font:16px serif;background:white;color:#0f1419}button{font:inherit}.spacer{height:400px}</style><a data-testid="AppTabBar_Home_Link"><span style="font-family:Arial,sans-serif">Home</span></a><div class="spacer"></div><button id="entry">查看分析</button><div style="height:1800px"></div><script>window.browser={i18n:{getUILanguage:()=>window.testLocale||'zh-CN'}};</script>`
try {
  for (const scenario of [
    { name: 'followers-light', width: 1280, kind: 'followers' },
    { name: 'followers-dark', width: 1280, kind: 'followers', dark: true },
    { name: 'verified-light', width: 1280, kind: 'verified_followers' },
    { name: 'verified-mobile', width: 375, kind: 'verified_followers' },
    { name: 'following-light', width: 1280, kind: 'following' },
    { name: 'followers-mobile', width: 375, kind: 'followers' },
    { name: 'following-mobile', width: 375, kind: 'following' },
    { name: 'followers-english', width: 360, kind: 'followers', en: true },
  ]) {
    const page = await browser.newPage({
        viewport: { width: scenario.width, height: 900 },
      }),
      errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.route('**/*', (r) =>
      r.fulfill({ contentType: 'text/html', body: fixture }),
    )
    await page.goto('https://x.com/owner/' + scenario.kind)
    await page.evaluate((s) => {
      window.testLocale = s.en ? 'en' : 'zh-CN'
      if (s.dark) {
        document.body.style.background = '#15202b'
        document.body.style.color = '#f7f9f9'
      }
      window.scrollTo(0, 300)
      document.querySelector('#entry').focus()
    }, scenario)
    await page.addScriptTag({ content: code })
    await page.evaluate((s) => {
      const now = Date.now()
      window.sample = {
        key: '1:1:' + s.kind,
        account: '1',
        targetId: '1',
        kind: s.kind,
        handle: 'example',
        batch: 'synthetic',
        startedAt: now,
        updatedAt: now,
        count: 37,
        bytes: 0,
        total: s.kind === 'verified_followers' ? undefined : 2000,
        members: Array.from({ length: 37 }, (_, i) => ({
          id: String(i + 1),
          handle: 'sample' + i,
          name: i === 0 ? '=安全导出测试' : `示例账号 ${i + 1}`,
          followers:
            i % 7 === 0
              ? undefined
              : [42, 2999, 3500, 12000, 32000, 65000, 150000][i % 7],
          following: i % 3 === 0 ? 0 : 100 + i,
          followsYou: i % 3 === 0 ? undefined : i % 3 === 1,
          createdAt: now - (i + 1) * 10 * 86400000,
          observedAt: now,
        })),
      }
      window.panel = AudiencePreview.openAudiencePanel(window.sample)
    }, scenario)
    const dialog = page.locator('#xf-audience-panel').locator('dialog')
    await dialog.waitFor({ state: 'visible' })
    await page.keyboard.press('Shift+Tab')
    assert.equal(await page.evaluate(() => document.querySelector('#xf-audience-panel').shadowRoot.activeElement.textContent.trim()), scenario.en ? 'Return to list to load more' : '返回列表继续加载')
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.querySelector('#xf-audience-panel').shadowRoot.activeElement.getAttribute('aria-label')), scenario.en ? 'Close' : '关闭')
    const geometry = await dialog.evaluate((el) => ({
      width: el.clientWidth,
      height: el.clientHeight,
      scrollWidth: el.scrollWidth,
      scrollHeight: el.scrollHeight,
      rootWidth: document.documentElement.clientWidth,
      overflow: document.documentElement.style.overflow,
      fg: getComputedStyle(el).color,
      bg: getComputedStyle(el).backgroundColor,
    }))
    assert(
      geometry.scrollWidth <= geometry.width + 1,
      `${scenario.name} horizontal overflow`,
    )
    assert.equal(geometry.overflow, 'hidden')
    assert(geometry.width <= scenario.width)
    assert.equal(geometry.height, scenario.width <= 700 ? 900 : 818)
    if (scenario.dark) assert.equal(geometry.bg, 'rgb(21, 32, 43)')
    const styles = await dialog.evaluate(el => ({
      font: getComputedStyle(el).fontFamily,
      nativeFont: getComputedStyle(document.querySelector('[data-testid=AppTabBar_Home_Link] span')).fontFamily,
      focus: getComputedStyle(el.querySelector('button')).outlineColor,
      headerPadding: getComputedStyle(el.querySelector('header')).paddingLeft,
    }))
    assert.equal(styles.font, styles.nativeFont)
    assert.equal(styles.focus, 'rgb(255, 122, 0)')
    assert.equal(styles.headerPadding, scenario.width <= 700 ? '16px' : '24px')
    await page.screenshot({ path: `${output}/${scenario.name}.png` })
    if (scenario.kind !== 'following') {
      if (scenario.width <= 700) {
        await dialog.locator('.bin').nth(2).click()
        await dialog.locator('.mobile-view').click()
        assert(await dialog.locator('.accounts').isVisible())
        assert.equal(await dialog.locator('article').count(), 5)
        await dialog.locator('.text-button').click()
      }
      assert.equal(await dialog.locator('article').count(), 12)
      await dialog.locator('.pagination button').last().click()
      assert.equal(await dialog.locator('article').count(), 12)
      const pending = page.waitForEvent('download')
      await dialog.locator('footer button').first().click()
      const download = await pending
      const file = await readFile(await download.path(), 'utf8')
      assert(file.includes('sample36'))
      assert(file.includes("'=安全导出测试"))
      assert.equal(file.split('\r\n').length, 38)
    } else {
      await dialog.locator('fieldset button').nth(1).click()
      assert.equal(await dialog.locator('article').count(), 12)
      const extra = await dialog.locator('.relation').allTextContents()
      assert(extra.every((t) => t === '未关注我'))
      await dialog.locator('.text-button').click()
      await dialog.locator('input[type=search]').fill('sample36')
      assert.equal(await dialog.locator('article').count(), 1)
    }
    await page.keyboard.press('Escape')
    await page.locator('#xf-audience-panel').waitFor({ state: 'detached' })
    assert.equal(await page.locator('#xf-audience-panel').count(), 0)
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'entry')
    assert.equal(await page.evaluate(() => window.scrollY), 300)
    assert.equal(
      await page.evaluate(() => document.documentElement.style.overflow),
      '',
    )
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log(
    'PASS: 8 production-panel layouts with native fonts and orange theme; bins, relationship filters, search, pagination, complete CSV export, Escape/focus/scroll restoration. Screenshots: ' +
      output,
  )
} finally {
  await browser.close()
}
