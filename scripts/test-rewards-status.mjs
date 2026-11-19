// 隔离浏览器、合成数据；测试过程不连接 X 或个人浏览器。
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, mkdir } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
const { chromium } = await import(process.env.REWARDS_PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('build/chrome-mv3')
const output = '/tmp/oh-my-x-rewards-status'
await mkdir(output, { recursive: true })
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname)
  if (!path.startsWith(root + '/')) return void res.writeHead(403).end()
  try { res.writeHead(200, { 'content-type': ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[extname(path)] || 'application/octet-stream' }).end(await readFile(path)) }
  catch { res.writeHead(404).end() }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true, executablePath: process.env.REWARDS_CHROMIUM })
const passed = []
try {
  for (const scenario of [
    { name: 'application-desktop', width: 1280, application: true },
    { name: 'application-mobile', width: 375, application: true },
    { name: 'application-dark', width: 375, application: true, dark: true },
    { name: 'application-english', width: 375, application: true, en: true },
    { name: 'review-mobile', width: 375, application: true, review: true },
    { name: 'review-english-dark', width: 375, application: true, review: true, en: true, dark: true },
    { name: 'first-visit', width: 375, application: true, noStats: true },
    { name: 'first-threshold', width: 1280, count: 503100 },
    { name: 'pending', width: 375, pending: true },
    { name: 'live-transition', width: 375, live: true },
    { name: 'active-desktop', width: 1280, active: true },
    { name: 'active-mobile', width: 375, active: true, records: true },
    { name: 'active-english-dark', width: 375, active: true, en: true, dark: true },
    { name: 'active-missing', width: 375, active: true, noStats: true },
  ]) {
    const page = await browser.newPage({ viewport: { width: scenario.width, height: 900 }, colorScheme: scenario.dark ? 'dark' : 'light' })
    const errors = []
    page.on('pageerror', err => errors.push(err.message))
    await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort())
    await page.addInitScript(s => {
      const count = s.count || 494600
      const stats = { impressionsCount: count, impressionsText: `${count / 1000}K`, targetImpressionsCount: 500000, targetImpressionsText: '500K', progressPercent: Math.min(100, Math.round(count / 500000 * 1000) / 10), updatedAt: Date.now() }
      window.testStore = {
        uiLanguage: s.en ? 'en' : 'zh-CN', popupActiveTab: 'insight',
        ...(!s.noStats && { creatorRewardsStats: JSON.stringify(stats) }),
        ...(s.application && { creatorRewardsPageState: JSON.stringify({ stage: s.review ? 'under_review' : 'application', updatedAt: Date.now() }) }),
        ...(s.active && { creatorRewardsPageState: JSON.stringify({ stage: 'active', updatedAt: Date.now(), ...(!s.noStats && { paidAmount: s.records ? '$300.00' : '$0.00', nextPayoutDate: '2026-11-20' }) }) }),
        ...(s.records && { creatorRewardsPayoutHistory: { '123': { totalCents: 30000, observedAt: Date.now(), records: [4, 3, 2, 1].map(i => ({ fromAt: Date.UTC(2026, 9, i - 1), observedAt: Date.UTC(2026, 9, i), changeCents: 7500 })) } } }),
        creatorRewardsHistory: JSON.stringify({ '2026-11-16': 477000, '2026-11-17': 494600 }),
      }
      window.storageListeners = []
      window.chrome = { runtime: { id: 'fixture', getURL: p => p, sendMessage: async msg => msg.type === 'XF_FETCH_CREATOR_REWARDS' && s.pending ? { ok: false, error: { code: 'error.rewardsParse' } } : { ok: true } }, storage: { local: { get: async () => ({ ...testStore }), set: async kv => Object.assign(testStore, kv) }, onChanged: { addListener: fn => storageListeners.push(fn), removeListener: () => {} } }, cookies: { get: async () => ({ value: 'u%3D123' }) }, tabs: { query: async () => [] }, i18n: { getUILanguage: () => s.en ? 'en' : 'zh-CN' } }
    }, scenario)
    await page.goto(`${origin}/options.html#insight`)
    const card = scenario.active ? page.locator('.rewards-payout') : scenario.pending || scenario.live ? page.locator('main').getByText('494.6K', { exact: true }) : page.locator('.rewards-achieved')
    await card.waitFor()
    if (scenario.pending) await page.getByText('X 暂未提供新的进度数据', { exact: false }).waitFor()
    if (scenario.live) {
      assert.match(await page.locator('main').innerText(), /还差 5.4K/)
      await page.evaluate(() => {
        testStore.creatorRewardsPageState = JSON.stringify({ stage: 'application', updatedAt: Date.now() })
        storageListeners.forEach(fn => fn({ creatorRewardsPageState: { newValue: testStore.creatorRewardsPageState } }, 'local'))
      })
      await page.locator('.rewards-achieved').waitFor()
    }
    const body = await page.locator('main').innerText()
    if (scenario.active) {
      assert.match(body, scenario.en ? /Rewards program active/ : /奖励计划已启用/)
      assert.doesNotMatch(body, /还差|to go|申请审核中/)
      if (scenario.noStats) {
        assert.match(await card.innerText(), /累计已发放\s+—\s+下次发放日期\s+—/)
      } else {
        assert.match(body, scenario.records ? /\$300\.00/ : /\$0\.00/)
        assert.doesNotMatch(body, /494\.6K|每日计入奖励/)
        assert.equal(await card.locator('time').first().getAttribute('datetime'), '2026-11-20')
      }
      if (scenario.records) {
        await card.locator('li').first().waitFor()
        assert.equal(await card.locator('li').count(), 3)
        assert.match(await card.locator('li').first().innerText(), /75\.00/)
      }
    }
    if (scenario.application || scenario.live || scenario.count) {
      assert.doesNotMatch(body, /还差|to go/)
      assert.match(body, scenario.en ? /Give yourself a big hug/ : /恭喜通关成功/)
      if (scenario.application && !scenario.noStats) assert.match(body, scenario.en ? /Last recorded: 494.6K/ : /最后记录：494.6K/)
    }
    if (scenario.review) {
      assert.match(body, scenario.en ? /application under review/ : /申请审核中/)
      assert.doesNotMatch(body, /前往 X 继续申请|Continue application on X/)
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), scenario.name + ' overflow')
    const contrast = await page.locator('.rewards-achieved, .rewards-payout').evaluateAll(nodes => nodes.flatMap(card => [...card.querySelectorAll('p, button, dt, dd')].map(node => {
      const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number)
      const lum = color => rgb(color).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
      let bg = node
      while (bg && getComputedStyle(bg).backgroundColor === 'rgba(0, 0, 0, 0)') bg = bg.parentElement
      const a = lum(getComputedStyle(node).color), b = lum(getComputedStyle(bg).backgroundColor)
      return (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
    })))
    assert.ok(contrast.every(ratio => ratio >= 4.5), scenario.name + ' contrast ' + contrast.join(','))
    assert.deepEqual(errors, [], scenario.name)
    await page.screenshot({ path: `${output}/${scenario.name}.png`, fullPage: true })
    passed.push(scenario.name)
    await page.close()
  }
  console.log(JSON.stringify({ passed, output }, null, 2))
} finally { await browser.close(); server.close() }
