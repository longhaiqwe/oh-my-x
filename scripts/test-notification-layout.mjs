// Real Chromium layout test with synthetic notifications; no live account or network requests.
// NOTIFICATION_PLAYWRIGHT_MODULE / NOTIFICATION_CHROMIUM can point to existing installations.
import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import { build } from 'vite'
const { chromium } = await import(process.env.NOTIFICATION_PLAYWRIGHT_MODULE || 'playwright-core')
const result = await build({
  configFile: false, logLevel: 'error',
  build: { write: false, minify: false, lib: {
    entry: path.resolve('content-scripts/features/notification-cards.ts'),
    name: 'NotificationCards', formats: ['iife'],
  } },
})
const code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk').code
const browser = await chromium.launch({ executablePath: process.env.NOTIFICATION_CHROMIUM, headless: true })
const fixture = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;font:16px Arial}main{width:min(700px,100%);margin:auto}
#native-timeline{position:relative;width:100%}.cell{position:absolute;top:0;width:100%}
article{box-sizing:border-box;padding:20px;border-bottom:1px solid #ddd;min-height:130px}
article p{margin:12px 0;line-height:24px}h1{height:70px;margin:0}nav{height:50px}
</style><nav><a data-testid="AppTabBar_Profile_Link" href="/me">Me</a></nav>
<main data-testid="primaryColumn"><h1>通知</h1><section id="region"></section></main>
<script>
window.store={notificationCardsEnabled:'on',notificationCardsView:'cards',uiLanguage:'zh-CN'};
window.browser={runtime:{id:'test',sendMessage:async()=>({ok:true,state:{baseline:Date.now(),read:{}}})},
storage:{local:{get:async()=>store,set:async data=>Object.assign(store,data)},onChanged:{addListener(listener){window.storageChanged=listener}}}};
window.zeroMeasurements=0; window.observerCalls=0;
window.mountNative=(count=20)=>{
document.querySelector('#region').innerHTML='<div id="native-timeline">'+Array.from({length:count},(_,i)=>
'<div class="cell" data-testid="cellInnerDiv"><article data-testid="tweet"><div data-testid="User-Name"><a href="/user'+i+'">User '+i+'</a> <a href="/user'+i+'/status/'+(100+i)+'"><time datetime="2026-11-11T01:00:00Z">今天</time></a></div><p data-testid="tweetText">'+('测试通知正文，用于验证长短留言的真实行高。'.repeat(i%3+1))+'</p><button data-testid="reply">回复</button></article></div>').join('')+'</div>';
const rows=[...document.querySelectorAll('article')];
const layout=()=>{let top=0;for(const row of rows){row.parentElement.style.transform='translateY('+top+'px)';top+=row.getBoundingClientRect().height}document.querySelector('#native-timeline').style.minHeight=top+'px'};
layout();
window.rowsObserver?.disconnect();
window.rowsObserver=new ResizeObserver(records=>{observerCalls++;zeroMeasurements+=records.filter(r=>!r.contentRect.height||!r.contentRect.width).length;layout()});
rows.forEach(row=>rowsObserver.observe(row));
};
window.frames=async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)};
window.metrics=()=>({zeroMeasurements,observerCalls,rows:[...document.querySelectorAll('article')].map(el=>{const r=el.getBoundingClientRect();return {height:r.height,width:r.width,top:r.top}}),
 rootWidth:document.querySelector('#xf-notification-cards')?.getBoundingClientRect().width,
 pageHeight:document.documentElement.scrollHeight,cardBottom:document.querySelector('#xf-notification-cards')?.getBoundingClientRect().bottom+scrollY});
</script>`
try {
  // 缩放后的 CSS 宽度可以带小数；详情必须跟随实际网格列数。
  for (const width of [380.25, 659.75]) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
    await page.route('**/*', r => r.fulfill({ contentType: 'text/html', body: fixture }))
    await page.goto('https://x.com/notifications')
    await page.addScriptTag({ content: code })
    await page.evaluate(async width => {
      document.querySelector('main').style.width = width+'px'
      mountNative(); await NotificationCards.initNotificationCards(); await frames()
    }, width)
    await page.locator('[data-open-person="user0"]').click()
    const placement = await page.evaluate(() => {
      const grid = document.querySelector('.xf-nc-grid')
      const children = [...grid.children]
      return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        detailIndex: children.indexOf(grid.querySelector('.xf-nc-detail')) }
    })
    assert.equal(placement.columns, 2)
    assert.equal(placement.detailIndex, placement.columns, '小数宽度下详情仍应插在整行卡片之后')
    console.log(JSON.stringify({ scenario: 'fractional-container-width', width, ...placement }))
    await page.close()
  }
  {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
    await page.route('**/*', r => r.fulfill({ contentType: 'text/html', body: fixture }))
    await page.goto('https://x.com/notifications')
    await page.addScriptTag({ content: code })
    await page.evaluate(async () => { mountNative(); await NotificationCards.initNotificationCards(); await frames() })
    await page.locator('.xf-nc-card [data-profile="user0"]').focus()
    assert.notEqual(await page.locator('#native-timeline article').first().evaluate(el => el.style.translate), '')
    await page.evaluate(() => storageChanged({ notificationCardsView: { newValue: 'list' } }, 'local'))
    assert.equal(await page.locator('#native-timeline').isVisible(), true)
    assert.equal(await page.locator('#native-timeline article').first().evaluate(el => el.style.translate), '', '跨标签页切回原始列表必须还原悬停位移')
    console.log(JSON.stringify({ scenario: 'synced-mode-clears-profile-offset', restored: true }))
    await page.close()
  }
  {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
    await page.route('**/*', r => r.fulfill({ contentType: 'text/html', body: fixture }))
    await page.goto('https://x.com/notifications')
    await page.addScriptTag({ content: code })
    const stress = await page.evaluate(async () => {
      mountNative(500); await NotificationCards.initNotificationCards(); await frames()
      let mutations = 0
      // 与全局管线相同，在 DOM 回调内准备外壳；观察卡片更新是否持续触发自身。
      const observer = new MutationObserver(records => {
        mutations += records.length
        NotificationCards.prepareNotificationCards()
      })
      observer.observe(document, { childList: true, subtree: true })
      const firstCard = document.querySelector('.xf-nc-card')
      const start = performance.now()
      let overlap = false
      for (let i = 0; i < 10; i++) {
        document.querySelector('[data-action="list"]').click()
        const rows = metrics().rows
        overlap ||= rows.some((row, j) => j && row.top < rows[j-1].top + rows[j-1].height - 1)
        await frames()
        document.querySelector('[data-action="cards"]').click(); await frames()
      }
      const elapsedMs = Math.round(performance.now() - start)
      const before = mutations
      await frames()
      observer.disconnect()
      return { rows: document.querySelectorAll('#native-timeline article').length,
        cards: document.querySelectorAll('.xf-nc-card').length, zeroMeasurements, overlap,
        retainedCard: firstCard === document.querySelector('.xf-nc-card'),
        settled: mutations === before, elapsedMs }
    })
    assert.equal(stress.rows, 500)
    assert.equal(stress.cards, 500)
    assert.equal(stress.zeroMeasurements, 0)
    assert.equal(stress.overlap, false)
    assert.equal(stress.retainedCard, true)
    assert.equal(stress.settled, true, '停止切换后 DOM 更新应收敛')
    console.log(JSON.stringify({ scenario: '500-notifications-10-round-trips', ...stress }))
    await page.close()
  }
  for (const savedMode of ['cards', 'list']) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
    await page.route('**/*', r => r.fulfill({ contentType: 'text/html', body: fixture }))
    await page.goto('https://x.com/home')
    await page.addScriptTag({ content: code })
    const loading = await page.evaluate(async savedMode => {
      store.notificationCardsView = savedMode
      await NotificationCards.initNotificationCards()
      const send = browser.runtime.sendMessage
      browser.runtime.sendMessage = async request => { await new Promise(resolve => setTimeout(resolve, 500)); return send(request) }
      // 与全局 MutationObserver 相同：在绘制前准备外壳，实际扫描留在异步队列。
      const observer = new MutationObserver(() => NotificationCards.prepareNotificationCards())
      observer.observe(document, { childList: true, subtree: true })
      history.replaceState({}, '', '/notifications')
      mountNative()
      const ready = new Promise(resolve => setTimeout(() => resolve(NotificationCards.updateNotificationCards()), 75))
      const frames = []
      for (let i = 0; i < 15; i++) {
        await new Promise(requestAnimationFrame)
        const root = document.querySelector('#xf-notification-cards')
        frames.push({ visible: getComputedStyle(document.querySelector('#native-timeline')).visibility,
          busy: root?.getAttribute('aria-busy'), rowHeight: document.querySelector('article').getBoundingClientRect().height })
      }
      await ready
      observer.disconnect()
      return { frames, zeroMeasurements, ready: !document.querySelector('#xf-notification-cards').hasAttribute('aria-busy') }
    }, savedMode)
    assert.ok(loading.frames.every(frame => frame.visible === (savedMode === 'cards' ? 'hidden' : 'visible')), '慢后台读取期间每帧都应保持用户选择的模式')
    assert.ok(loading.frames.every(frame => frame.rowHeight > 0), '加载外壳不能破坏原生行高')
    assert.equal(loading.frames[0].busy, 'true')
    assert.equal(loading.ready, true)
    assert.equal(loading.zeroMeasurements, 0)
    console.log(JSON.stringify({ scenario: 'slow-notification-entry', savedMode, sampledFrames: loading.frames.length,
      wrongModeFrames: loading.frames.filter(frame => frame.visible !== (savedMode === 'cards' ? 'hidden' : 'visible')).length }))
    await page.close()
  }
  for (const fromHome of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
    await page.route('**/*', r => r.fulfill({ contentType: 'text/html', body: fixture }))
    await page.goto(`https://x.com/${fromHome ? 'home' : 'notifications'}`)
    await page.addScriptTag({ content: code })
    const metrics = await page.evaluate(async fromHome => {
      if (fromHome) await NotificationCards.initNotificationCards()
      history.replaceState({}, '', '/notifications')
      mountNative(); await frames()
      const before = metrics()
      if (fromHome) await NotificationCards.updateNotificationCards()
      else await NotificationCards.initNotificationCards()
      await frames()
      const cards = metrics()
      document.querySelector('[data-action="list"]').click()
      const firstListFrame = metrics()
      await frames()
      return { before, cards, firstListFrame }
    }, fromHome)
    console.log(JSON.stringify({ scenario: fromHome ? 'home-to-cards' : 'cards-to-list', zeroMeasurements: metrics.cards.zeroMeasurements,
      firstRowBefore: metrics.before.rows[0], firstRowHidden: metrics.cards.rows[0], firstListTops: metrics.firstListFrame.rows.slice(0, 3).map(r => r.top) }))
    assert.equal(metrics.cards.zeroMeasurements, 0, '隐藏期间不能把虚拟列表通知行测量为零')
    assert.deepEqual(metrics.cards.rows.map(r => [r.width, r.height]), metrics.before.rows.map(r => [r.width, r.height]), '隐藏期间保留原生行宽高')
    assert.ok(metrics.cards.pageHeight <= Math.max(800, Math.ceil(metrics.cards.cardBottom)), '隐藏列表不能撑出额外空白滚动区域')
    assert.ok(metrics.firstListFrame.rows.every((r, i, rows) => !i || r.top >= rows[i-1].top + rows[i-1].height - 1), '恢复显示的第一帧不能叠行')
    await page.evaluate(async () => { document.querySelector('[data-action="cards"]').click(); await frames() })
    await page.setViewportSize({ width: 430, height: 800 })
    await page.evaluate(() => frames())
    const narrow = await page.evaluate(() => metrics())
    assert.equal(narrow.rows[0].width, narrow.rootWidth, '隐藏列表在窗口变窄时仍使用通知列宽')
    for (let i = 0; i < 10; i++) {
      await page.evaluate(async () => { document.querySelector('[data-action="list"]').click(); await frames(); document.querySelector('[data-action="cards"]').click(); await frames() })
    }
    assert.equal(await page.evaluate(() => zeroMeasurements), 0, '连续切换不得出现零尺寸通知行')
    await page.evaluate(() => NotificationCards.setNotificationCardsEnabled(false))
    assert.equal(await page.locator('#native-timeline').evaluate(el => getComputedStyle(el).position), 'relative', '关闭后恢复原生布局')
    await page.close()
  }
  for (const recycled of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
    let popups = 0
    page.on('popup', () => popups++)
    await page.route('**/*', r => r.fulfill({ contentType: 'text/html', body: fixture }))
    await page.goto('https://x.com/notifications')
    await page.addScriptTag({ content: code })
    await page.evaluate(async recycled => {
      mountNative(); await frames(); await NotificationCards.initNotificationCards()
      if (recycled) {
        document.querySelector('article').parentElement.remove()
        await NotificationCards.updateNotificationCards()
      }
    }, recycled)
    await page.locator('[data-person="user0"]').click()
    await Promise.all([
      page.waitForURL('https://x.com/user0/status/100'),
      page.locator('.xf-nc-detail [data-reply]').click(),
    ])
    // 模拟完整页面导航后的内容脚本重新注入，验证 sessionStorage 的短期回复目标。
    await page.evaluate(() => {
      document.querySelector('main').innerHTML = '<h1>帖子</h1><div style="height:900px">对应留言</div><div data-testid="tweetTextarea_0" role="textbox" contenteditable="true" style="height:100px">已输入的回复</div>'
    })
    await page.addScriptTag({ content: code })
    await page.evaluate(() => NotificationCards.initNotificationCards())
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-testid')), 'tweetTextarea_0')
    assert.equal(await page.locator('[data-testid="tweetTextarea_0"]').textContent(), '已输入的回复')
    assert.equal(await page.evaluate(() => sessionStorage.getItem('xf.notificationReplyTarget')), null)
    assert.equal(popups, 0, '回复不打开新标签或弹窗')
    console.log(JSON.stringify({ scenario: recycled ? 'reply-after-recycling' : 'reply-native-link', target: page.url(), focused: true, popups }))
    await page.close()
  }
  // 模拟浏览器重新载入：保留扩展本地存储，重建页面与内容脚本的模块状态。
  {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } })
    await page.route('**/*', r => r.fulfill({ contentType: 'text/html', body: fixture }))
    await page.goto('https://x.com/notifications')
    const boot = async () => {
      await page.addScriptTag({ content: code })
      await page.evaluate(async () => { mountNative(); await NotificationCards.initNotificationCards(); await frames() })
    }
    await boot()
    for (const [replies, unread] of [[true, true], [false, true], [false, false]]) {
      await page.locator('[data-filter="replies"]').setChecked(replies)
      await page.locator('[data-filter="unread"]').setChecked(unread)
      const saved = await page.evaluate(() => structuredClone(store))
      await page.reload()
      await page.evaluate(saved => Object.assign(store, saved), saved)
      await boot()
      assert.equal(await page.locator('[data-filter="replies"]').isChecked(), replies)
      assert.equal(await page.locator('[data-filter="unread"]').isChecked(), unread)
    }
    await page.locator('[data-filter="replies"]').check()
    await page.locator('[data-filter="unread"]').check()
    for (const mode of ['list', 'cards']) {
      await page.locator(`.xf-nc-modes [data-action="${mode}"]`).click()
      const saved = await page.evaluate(() => structuredClone(store))
      assert.equal(saved.notificationCardsView, mode)
      await page.reload()
      await page.evaluate(saved => Object.assign(store, saved), saved)
      await boot()
      assert.equal(await page.locator(`.xf-nc-modes [data-action="${mode}"]`).getAttribute('aria-pressed'), 'true')
      assert.equal(await page.locator('.xf-nc-content').isVisible(), mode === 'cards')
      assert.equal(await page.locator('#native-timeline').isVisible(), mode === 'list')
      assert.equal(await page.locator('[data-filter="replies"]').isChecked(), true)
      assert.equal(await page.locator('[data-filter="unread"]').isChecked(), true)
      if (mode === 'list') assert.equal(await page.locator('.xf-nc-card').count(), 0, '原始列表首次显示不渲染卡片')
    }
    console.log(JSON.stringify({ scenario: 'preferences-after-reload', filterCombinations: 3, viewModes: 2, restored: true }))
    await page.close()
  }
  const screenshotDir = path.resolve('.metrics/notification-hierarchy')
  await mkdir(screenshotDir, { recursive: true })
  for (const width of [1280, 500, 375]) {
    for (const theme of ['light', 'dark', 'dim']) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } })
      await page.route('**/*', r => r.fulfill({ contentType: 'text/html', body: fixture }))
      await page.goto('https://x.com/notifications')
      await page.addScriptTag({ content: code })
      await page.evaluate(async theme => {
        document.body.style.backgroundColor = theme === 'light' ? '#fff' : theme === 'dark' ? '#000' : 'rgb(21, 32, 43)'
        document.body.style.color = theme === 'light' ? 'rgb(15, 20, 25)' : 'rgb(247, 249, 249)'
        const read = {}
        browser.runtime.sendMessage = async request => { for (const key of request.read || []) read[key] = Date.now(); return { ok: true, state: { baseline: Date.parse('2026-11-10'), read: { ...read } } } }
        const names = ['林知远', '陈安', '周宁', '许禾', '陆可', '苏言']
        const messages = ['这个方法在长对话里也适用吗？我试了两种设置，结果有些不同。', '我刚试了一遍，补充一个细节：切换账号后需要重新加载通知。', '你提到的测试脚本在哪里可以找到？']
        const reply = i => '<article data-testid="tweet"><div data-testid="User-Name"><a href="/user'+i+'">'+names[i]+'</a><a href="/user'+i+'/status/'+(100+i)+'"><time datetime="2026-11-11T01:00:00Z">今天</time></a></div><p data-testid="tweetText">'+messages[i%3]+'</p></article>'
        const alert = '<article data-testid="notification"><ul>'+[...names, '方晴'].map((name,i)=>'<li><a href="/user'+i+'">'+name+'</a></li>').join('')+'</ul><div>给 <a href="/user0">林知远</a> 和另外 6 个人的新帖子通知 · <time datetime="2026-11-11T03:00:00Z">1分钟</time></div></article>'
        const like = i => '<article data-testid="notification"><ul><li><a href="/user'+i+'">'+names[i]+'</a></li></ul><div><a href="/user'+i+'">'+names[i]+'</a> 赞了你的帖子 · <time datetime="2026-11-11T02:00:00Z">今天</time></div><p data-testid="tweetText">关于长对话中的上下文管理，这里记录了我的测试过程。</p></article>'
        document.querySelector('#region').innerHTML = '<div id="native-timeline">'+[alert, like(0), reply(1), reply(2), like(3), reply(3), like(4), reply(5)].map(html => '<div data-testid="cellInnerDiv">'+html.replace('赞了你的帖子', '点赞了你的帖子')+'</div>').join('')+'</div>'
        await NotificationCards.initNotificationCards(); await frames()
      }, theme)
      assert.equal(await page.locator('.xf-nc-post').count(), 1)
      assert.equal(await page.locator('.xf-nc-post-avatars .xf-nc-avatar').count(), 7)
      assert.equal(await page.locator('.xf-nc-post-more').count(), 0)
      assert.ok((await page.locator('.xf-nc-posts').boundingBox()).y < (await page.locator('.xf-nc-heading').boundingBox()).y)
      assert.equal(await page.locator('.xf-nc-card[data-kind="reply"]').count(), 4)
      assert.equal(await page.locator('.xf-nc-card[data-kind="like"]').count(), 2)
      assert.equal(await page.locator('[data-person="user3"] .xf-nc-excerpt').textContent(), '这个方法在长对话里也适用吗？我试了两种设置，结果有些不同。')
      // 覆盖少量、上限、超出上限的八人及大量头像；恢复原生内容后继续交互检查。
      const originalAvatars = await page.locator('#native-timeline article ul').first().innerHTML()
      for (const count of [1, 7, 8, 50]) {
        await page.evaluate(async count => {
          document.querySelector('#native-timeline article ul').innerHTML = Array.from({ length: count }, (_, i) => '<li><a href="/user'+i+'">用户'+i+'</a></li>').join('')
          await NotificationCards.updateNotificationCards(); await frames()
        }, count)
        const row = await page.evaluate(() => {
          const avatars = [...document.querySelector('.xf-nc-post-avatars').children].map(el => el.getBoundingClientRect())
          const group = document.querySelector('.xf-nc-post-avatars').getBoundingClientRect()
          const summary = document.querySelector('.xf-nc-post-body p').getBoundingClientRect()
          return { rows: new Set(avatars.map(r => r.top)).size, count: document.querySelectorAll('.xf-nc-post-avatars .xf-nc-profile').length,
            more: document.querySelector('.xf-nc-post-more')?.textContent, overflow: document.documentElement.scrollWidth > innerWidth,
            centered: Math.abs(group.top+group.height/2-summary.top-summary.height/2) < 1,
            stacked: summary.top >= group.bottom }
        })
        assert.equal(row.rows, 1, '头像始终保持单行')
        assert.equal(row.count, Math.min(count, 7))
        assert.equal(row.more, count > 7 ? '+'+(count-7) : undefined)
        assert.equal(row.overflow, false)
        assert.equal(width > 380 ? row.centered : row.stacked, true, '宽屏摘要垂直居中，窄屏摘要在头像下方')
      }
      await page.evaluate(async html => {
        document.querySelector('#native-timeline article ul').innerHTML = html
        await NotificationCards.updateNotificationCards(); await frames()
      }, originalAvatars)
      const visual = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.xf-nc-card')]
        const reply = cards.find(el => el.dataset.kind === 'reply'), like = cards.find(el => el.dataset.kind === 'like')
        const root = document.querySelector('#xf-notification-cards')
        const rgb = color => color.match(/[\d.]+/g).slice(0, 3).map(Number)
        const luminance = color => rgb(color).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
        const contrast = (fg, bg) => { const values = [luminance(fg), luminance(bg)].sort((a, b) => b-a); return (values[0]+.05)/(values[1]+.05) }
        const background = getComputedStyle(root).backgroundColor
        const textContrast = [...root.querySelectorAll('.xf-nc-filter, .xf-nc-card-kind, .xf-nc-excerpt, .xf-nc-user small, .xf-nc-bottom, .xf-nc-post-body p, .xf-nc-post-meta, .xf-nc-posts h2')].map(el => contrast(getComputedStyle(el).color, background))
        return { overflow: document.documentElement.scrollWidth > innerWidth, minContrast: Math.min(...textContrast),
          replyWeight: getComputedStyle(reply.querySelector('.xf-nc-card-kind')).fontWeight,
          likeWeight: getComputedStyle(like.querySelector('.xf-nc-card-kind')).fontWeight,
          columns: new Set(cards.slice(0, 3).map(el => el.getBoundingClientRect().left)).size }
      })
      assert.equal(visual.overflow, false, '卡片不得造成横向溢出')
      assert.ok(visual.minContrast >= 4.5, '回复与次要通知的文字对比度均须达标')
      assert.ok(Number(visual.replyWeight) > Number(visual.likeWeight), '回复还须通过字重区分，不能只靠颜色')
      assert.equal(visual.columns, width === 1280 ? 3 : width === 500 ? 2 : 1)
      if (width !== 500) await page.screenshot({ path: path.join(screenshotDir, `${theme}-${width}.png`), fullPage: true })
      if (width !== 500) {
        const rootRect = await page.locator('#xf-notification-cards').boundingBox()
        const headingRect = await page.locator('.xf-nc-heading').boundingBox()
        await page.screenshot({ path: path.join(screenshotDir, `header-${theme}-${width}.png`), clip: { x: rootRect.x, y: rootRect.y, width: rootRect.width, height: headingRect.y+headingRect.height-rootRect.y+18 } })
      }
      const repliesFilter = page.locator('[data-filter="replies"]')
      const unreadFilter = page.locator('[data-filter="unread"]')
      await repliesFilter.check()
      assert.equal(await page.locator('.xf-nc-card').count(), 4)
      assert.equal(await page.locator('.xf-nc-card:not([data-kind="reply"]), .xf-nc-posts, .xf-nc-other, .xf-nc-types').count(), 0)
      assert.equal(await unreadFilter.isChecked(), false)
      await unreadFilter.check()
      assert.equal(await repliesFilter.isChecked(), true)
      assert.equal(await page.locator('.xf-nc-card').count(), 4)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      const controlLayout = await page.evaluate(() => {
        const controls = [...document.querySelectorAll('.xf-nc-filter')].map(el => el.getBoundingClientRect())
        const mode = document.querySelector('.xf-nc-modes').getBoundingClientRect()
        return controls.every(r => r.height >= 32 && (r.top >= mode.bottom || r.left >= mode.right))
      })
      assert.ok(controlLayout, '筛选控件不能与视图切换重叠，标签点击高度至少 32px')
      if (width !== 500) await page.locator('#xf-notification-cards').screenshot({ path: path.join(screenshotDir, `replies-${theme}-${width}.png`) })
      await page.locator('.xf-nc-modes [data-action="list"]').click()
      assert.equal(await page.locator('.xf-nc-filters').isVisible(), false)
      await page.locator('[data-action="cards"]').click()
      assert.equal(await repliesFilter.isChecked(), true)
      assert.equal(await unreadFilter.isChecked(), true)
      await repliesFilter.focus()
      await page.keyboard.press('Space')
      assert.equal(await repliesFilter.isChecked(), false)
      assert.equal(await page.evaluate(() => document.activeElement?.dataset.filter), 'replies')
      assert.equal(await page.locator('.xf-nc-card').count(), 6)
      await unreadFilter.uncheck()
      const handles = await page.locator('.xf-nc-card').evaluateAll(cards => cards.map(el => el.dataset.person))
      for (const handle of handles) {
        await page.locator(`[data-person="${handle}"]`).click()
        const placement = await page.evaluate(() => {
          const selected = document.querySelector('.xf-nc-card[data-expanded="true"]'), detail = document.querySelector('.xf-nc-detail')
          const sameRow = [...document.querySelectorAll('.xf-nc-card')].filter(card => Math.abs(card.getBoundingClientRect().top - selected.getBoundingClientRect().top) < 1)
          return { top: detail.getBoundingClientRect().top, rowBottom: Math.max(...sameRow.map(el => el.getBoundingClientRect().bottom)), next: detail.nextElementSibling?.getBoundingClientRect().top, bottom: detail.getBoundingClientRect().bottom }
        })
        assert.ok(placement.top >= placement.rowBottom, '详情须在所选卡片所在行之后')
        assert.ok(placement.next === undefined || placement.next >= placement.bottom, '详情不得插入卡片行中间')
      }
      await page.keyboard.press('Escape')
      assert.equal(await page.locator('.xf-nc-detail').count(), 0)
      assert.equal(await page.evaluate(() => document.activeElement?.dataset.openPerson), handles.at(-1))
      if (width === 1280 && theme === 'light') {
        await page.evaluate(() => {
          const source = document.querySelector('#native-timeline article a')
          source.addEventListener('mouseover', () => {
            const rect = source.getBoundingClientRect()
            const card = document.createElement('div'); card.dataset.testid = 'HoverCard'
            card.textContent = '原生资料卡'; card.tabIndex = 0
            Object.assign(card.style, { position: 'fixed', top: rect.bottom+'px', left: rect.left+'px', background: 'white', padding: '16px', zIndex: '9999' })
            document.body.append(card)
          })
          source.addEventListener('mouseout', event => { if (!event.relatedTarget?.closest?.('[data-testid="HoverCard"]')) document.querySelector('[data-testid="HoverCard"]')?.remove() })
          window.profileClicks = 0
          source.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); profileClicks++ })
        })
        const avatar = page.locator('.xf-nc-post [data-profile="user0"]')
        await avatar.hover()
        const nativePopup = page.locator('[data-testid="HoverCard"]')
        assert.equal(await nativePopup.textContent(), '原生资料卡')
        const avatarRect = await avatar.boundingBox(), popupRect = await nativePopup.boundingBox()
        assert.ok(Math.abs(avatarRect.x-popupRect.x) < 1, '原生资料卡在卡片头像旁显示')
        await nativePopup.hover()
        await page.waitForTimeout(450)
        assert.notEqual(await page.locator('#native-timeline article').first().evaluate(el => el.style.translate), '', '移入资料卡保持定位')
        await avatar.click()
        assert.equal(await page.evaluate(() => profileClicks), 1, '头像只调用原生主页入口')
        assert.equal(await page.locator('#native-timeline article').first().evaluate(el => el.style.translate), '', '离开资料卡后还原原生通知')
        assert.equal(await page.locator('[data-action="cards"]').getAttribute('aria-pressed'), 'true')
      }
      await page.evaluate(async () => {
        const article = document.querySelector('#native-timeline article[data-testid="tweet"]')
        const copy = article.cloneNode(true)
        copy.querySelector('time').closest('a').href = '/user1/status/999'
        copy.querySelector('time').setAttribute('datetime', '2026-11-11T04:00:00Z')
        article.parentElement.append(copy)
        await NotificationCards.updateNotificationCards()
      })
      await page.locator('[data-action="mark-all-read"]').click()
      assert.equal(await page.locator('.xf-nc-badge').count(), 0, '批量已读清除互动角标')
      assert.equal(await page.locator('.xf-nc-post').getAttribute('data-new'), 'true', '批量已读不清除新帖提醒')
      assert.equal(await page.locator('[data-action="mark-all-read"]').isDisabled(), true)
      await page.evaluate(() => { window.alertClicks = 0; document.querySelector('#native-timeline article').addEventListener('click', () => window.alertClicks++) })
      // 整卡点击选择标题留白，避开可独立点击的头像。
      await page.locator('[data-post-alert]').click({ position: { x: 12, y: 12 } })
      assert.equal(await page.evaluate(() => alertClicks), 1, '整卡直接触发原生通知，不切换列表')
      assert.equal(await page.locator('#native-timeline').getAttribute('data-xf-notification-hidden'), 'true')
      await page.locator('.xf-nc-post').waitFor({ state: 'detached' })
      assert.equal(await page.locator('.xf-nc-post').count(), 0, '已查看的新帖提醒不再显示')
      console.log(JSON.stringify({ scenario: 'notification-hierarchy', width, theme, ...visual }))
      await page.close()
    }
  }
  console.log('通知布局检查通过：进入页面、切换首帧、窄屏、连续切换和关闭恢复。')
} finally { await browser.close() }
