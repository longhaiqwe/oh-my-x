// Built dashboard in isolated Chromium, using synthetic fixtures. No requests to X.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
const { chromium } = await import(process.env.REWARDS_PLAYWRIGHT_MODULE || 'playwright')
const root = resolve('build/chrome-mv3')
const output = process.env.REWARDS_TEST_OUTPUT || '/tmp/oh-my-x-rewards-validation'
await mkdir(output, { recursive: true })
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname)
  if (!path.startsWith(root + '/')) { res.writeHead(403).end(); return }
  try {
    const file = await readFile(path)
    const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'}
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }).end(file)
  } catch { res.writeHead(404).end() }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({headless: true, executablePath: process.env.REWARDS_CHROMIUM})
const reports = []
try {
  for (const scenario of [
    {name:'monday',width:1280,height:720,monday:true}, {name:'desktop', width:1366,height:768}, {name:'laptop',width:1280,height:720}, {name:'short-screen',width:1366,height:640}, {name:'english-desktop',width:1366,height:768,en:true}, {name:'mobile', width:375},
    {name:'dark', width:1280,dark:true}, {name:'english-mobile',width:360,en:true},
    {name:'bursty',width:1280,height:720,bursty:true}, {name:'sparse-history',width:1280,height:720,sparse:true}, {name:'empty',width:1280,empty:true}, {name:'partial',width:1280,partial:true},
  ]) {
    const page = await browser.newPage({viewport:{width:scenario.width,height:scenario.height||768},colorScheme:scenario.dark?'dark':'light',acceptDownloads:true})
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.route('**/*', route => route.request().url().startsWith(origin) || route.request().url().startsWith('blob:') ? route.continue() : route.abort())
    await page.addInitScript(scenario => {
      const NativeDate = Date, fixed = NativeDate.parse(scenario.monday ? '2026-11-09T03:00:00Z' : '2026-11-12T03:00:00Z')
      class FixedDate extends NativeDate { constructor(...args) { super(...(args.length ? args : [fixed])) } static now() {return fixed} }
      window.Date = FixedDate
      const history = {}, days = {}
      let count = 120000
      for (let i=0;i<100;i++) {
        const date = new NativeDate(fixed - (100-i)*86400000).toISOString().slice(0,10)
        const monthIndex = Number(date.slice(8)) - 1
        count += scenario.bursty && date.startsWith('2026-11-') ? [6200,24200,28100,5800,2400,3500,3100,1800,2100,3900,5600][monthIndex] : i%6===0 ? -2200 : (i%9+1)*800
        if (!scenario.empty) {
          history[date] = count
          days[date] = {total: (i%9+1)*5400, verified:(i%7+1)*1900}
        }
      }
      if (scenario.sparse) { for (const date of Object.keys(history)) if (date < '2026-10-11') delete history[date]; for (const date of Object.keys(days)) if (date < '2026-08-17') delete days[date] }
      if (scenario.partial) {delete history['2026-11-09'];delete days['2026-11-10']}
      const state = {
        uiLanguage: scenario.en ? 'en' : 'zh-CN',
        creatorRewardsHistory: JSON.stringify(history),
        impressionsDaily: JSON.stringify({days,updatedAt:fixed}),
        ...(scenario.empty ? {} : {creatorRewardsStats:JSON.stringify({impressionsCount:count,targetImpressionsCount:500000,updatedAt:fixed})}),
      }
      window.requests = []
      window.storageListeners = []
      window.chrome = {runtime:{id:'rewards-test',sendMessage:async msg => {window.requests.push(msg);return scenario.empty ? {ok:false} : {ok:true}},getURL:path=>path},storage:{local:{get:async()=>state,set:async data=>Object.assign(state,data)},onChanged:{addListener:fn=>window.storageListeners.push(fn),removeListener:()=>{}}},i18n:{getUILanguage:()=>scenario.en?'en':'zh-CN'}}
    }, scenario)
    await page.goto(`${origin}/rewards.html`)
    await page.locator('.metric-grid').waitFor()
    assert.equal(await page.locator('h2').innerText(),'2026-11-09 — 2026-11-15')
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),scenario.name+' horizontal overflow')
    async function assertFits(view) {
      if (scenario.width < 1000) return
      const size = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, viewport: innerHeight, bottom: document.querySelector('.dashboard').getBoundingClientRect().bottom }))
      if (size.height > size.viewport) await page.screenshot({path:`${output}/${scenario.name}-${view}-overflow.png`,fullPage:true})
      assert.ok(size.height <= size.viewport && size.bottom <= size.viewport, `${scenario.name} ${view} must fit one screen: ${JSON.stringify(size)}`)
    }
    await assertFits('week')
    assert.equal(await page.locator('.calendar-day').count(),7)
    assert.equal(await page.locator('.calendar-day:disabled').count(),scenario.monday ? 7 : 4)
    assert.equal(await page.locator('.calendar-day:disabled strong').count(),0)
    assert.equal(await page.locator('.range-navigation .arrow').last().isDisabled(),true)
    assert.equal(await page.locator('.comparison').count(),0,'unfinished week must not compare with a full week')
    if (scenario.monday) {
      assert.equal(await page.locator('[role=alert]').count(),0)
      assert.equal(await page.locator('.reward-value').innerText(),'—')
      assert.equal(await page.locator('.export-open').isDisabled(),true)
      await page.screenshot({path:`${output}/monday.png`,fullPage:true})
      await page.locator('.range-navigation .arrow').first().click()
      assert.equal(await page.locator('h2').innerText(),'2026-11-02 — 2026-11-08')
      assert.equal(await page.locator('.range-navigation .arrow').last().isEnabled(),true)
      await page.locator('.range-navigation .arrow').last().click()
      assert.equal(await page.locator('h2').innerText(),'2026-11-09 — 2026-11-15')
      assert.equal(await page.locator('.calendar-day:disabled').count(),7)
      assert.deepEqual(errors,[],scenario.name)
      reports.push(scenario.name)
      await page.close()
      continue
    }
    if (scenario.empty) {
      assert.equal(await page.locator('.export-open').isDisabled(),true)
      assert.ok(await page.locator('.empty-state').isVisible())
    } else {
      if (scenario.partial) {
        assert.notEqual(await page.locator('.reward-value').innerText(),'—')
        assert.match(await page.locator('.reward-summary .partial-coverage').innerText(), /1\/3/)
        assert.equal(await page.locator('.reward-comparison').count(),0)
      } else assert.equal(await page.locator('.partial-coverage').count(),0)
      const contrast = await page.evaluate(() => {
        const rgb = css => {
          const ctx = document.createElement('canvas').getContext('2d'); ctx.fillStyle=css; ctx.fillRect(0,0,1,1)
          return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>v/255)
        }
        const luminance = css => rgb(css).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)
        return ['.calendar-day.high strong','.calendar-day.high .calendar-date','.calendar-day:not(.high):not(.unavailable) .calendar-date','.reward-value','.supporting-metric .metric-label'].map(selector=>{
          const node=document.querySelector(selector); if(!node)return {selector,ratio:21}
          let bg=node
          while(bg && getComputedStyle(bg).backgroundColor==='rgba(0, 0, 0, 0)')bg=bg.parentElement
          const a=luminance(getComputedStyle(node).color),b=luminance(getComputedStyle(bg).backgroundColor)
          return {selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}
        })
      })
      assert.ok(contrast.every(item=>item.ratio>=4.5),scenario.name+' contrast '+JSON.stringify(contrast))
      assert.equal(await page.locator('.calendar-day.peak').count(),1)
      assert.equal(await page.locator('.calendar-day[aria-pressed=true]').count(),0)
      assert.ok(await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.reward-value')).fontSize) > parseFloat(getComputedStyle(document.querySelector('.supporting-metric strong')).fontSize)))
      await page.screenshot({path:`${output}/${scenario.name}.png`,fullPage:true})
      await page.locator('.export-open').click()
      await page.locator('.share-row input').fill('@example · 测试数据')
      const downloadPromise = page.waitForEvent('download')
      await page.locator('.export-save').click()
      const download = await downloadPromise
      assert.match(download.suggestedFilename(),/2026-11-09-2026-11-15\.png$/)
      await download.saveAs(`${output}/${scenario.name}-export.png`)
      const png = await readFile(`${output}/${scenario.name}-export.png`)
      assert.equal(png.readUInt32BE(16),2400)
      assert.equal(png.readUInt32BE(20),1800)
      assert.equal(await page.locator('.share-dialog').isVisible(),false)
      await page.locator('.metric-tabs button').nth(1).click()
      assert.equal(await page.locator('.metric-tabs button').nth(1).getAttribute('aria-pressed'),'true')
      await page.locator('.metric-tabs button').first().click()
      await page.locator('.calendar-day').nth(2).click()
      assert.ok((await page.locator('.chart-readout').innerText()).includes('2026-11-11'))
      await page.locator('.range-navigation .arrow').first().click()
      assert.equal(await page.locator('h2').innerText(),'2026-11-02 — 2026-11-08')
      if (!scenario.bursty) assert.equal(await page.locator('.calendar-day.negative').count()>0,true)
      assert.equal(await page.locator('.calendar-day:disabled').count(),0)
      assert.equal(await page.locator('.comparison').count(),3)
      await page.locator('.range-navigation .arrow').last().click()
      assert.equal(await page.locator('h2').innerText(),'2026-11-09 — 2026-11-15')
      assert.equal(await page.locator('.calendar-day:disabled').count(),4)
      await page.locator('.toolbar .segments button').nth(1).click()
      assert.equal(await page.locator('h2').innerText(),'2026-11-01 — 2026-11-11')
      await assertFits('month-six-rows')
      assert.equal(await page.locator('.calendar-grid > *').count(),42)
      assert.equal(await page.locator('.calendar-day:disabled').count(),19)
      await page.screenshot({path:`${output}/${scenario.name}-month.png`,fullPage:true})
      if (scenario.bursty) {
        const grayscale = await page.addStyleTag({content:'.rewards-page { filter: grayscale(1); }'})
        await page.screenshot({path:`${output}/${scenario.name}-month-grayscale.png`,fullPage:true})
        await grayscale.evaluate(node=>node.remove())
      }
      // The exported month must retain its calendar layout.
      await page.locator('.export-open').click()
      const monthDownload = page.waitForEvent('download')
      await page.locator('.export-save').click()
      await (await monthDownload).saveAs(`${output}/${scenario.name}-month-export.png`)
      assert.equal(await page.locator('.comparison').count(),0,'partial month must not compare to full month')
      await page.locator('.range-navigation .arrow').first().click()
      assert.equal(await page.locator('h2').innerText(),'2026-10-01 — 2026-10-31')
      await page.locator('.toolbar .segments button').nth(2).click()
      assert.equal(await page.locator('h2').innerText(),'2026-08-14 — 2026-11-11')
      if (scenario.sparse) { assert.notEqual(await page.locator('.reward-value').innerText(),'—'); assert.match(await page.locator('.reward-summary .partial-coverage').innerText(),/31\/90/) }
      await assertFits('90-days-weekly')
      await page.screenshot({path:`${output}/${scenario.name}-90.png`,fullPage:true})
      await page.locator('.chart-heading .segments button').nth(1).click()
      assert.equal(await page.locator('.chart-targets button').count(),90)
      await assertFits('90-days-daily')
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),scenario.name+' daily chart overflow')
      await page.locator('.toolbar .segments button').nth(3).click()
      await page.locator('input[type=date]').first().fill('2026-11-10')
      await page.locator('input[type=date]').nth(1).fill('2026-11-02')
      assert.equal(await page.locator('.export-open').isDisabled(),true)
      assert.ok(await page.locator('[role=alert]').count()>0)
      await page.locator('input[type=date]').first().fill('2026-11-01')
      await page.locator('input[type=date]').nth(1).fill('2026-11-08')
      assert.equal(await page.locator('.export-open').isEnabled(),true)
      await assertFits('custom')
      await page.locator('.daily-records summary').click()
      assert.ok(await page.locator('.table-scroll').isVisible())
      await page.locator('.daily-records summary').click()
      await page.locator('.dashboard-notes summary').click()
      assert.ok(await page.locator('.dashboard-notes > div').isVisible())
      await page.locator('.dashboard-notes summary').click()
      await page.locator('.export-open').click()
      await page.keyboard.press('Escape')
      assert.equal(await page.locator('.share-dialog').isVisible(),false)
      await page.locator('.toolbar > button').click()
      assert.deepEqual(await page.evaluate(()=>window.requests.at(-1)),{type:'XF_FETCH_CREATOR_REWARDS',history:true})
    }
    assert.deepEqual(errors,[],scenario.name)
    reports.push(scenario.name)
    await page.close()
  }
  console.log(JSON.stringify({passed:reports,output},null,2))
} finally {await browser.close();server.close()}
