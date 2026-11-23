// Production extension in an isolated Chromium profile. All X responses are synthetic.
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'

const { chromium } = await import(process.env.ARTICLE_PLAYWRIGHT_MODULE || 'playwright-core')
const profile = await mkdtemp(path.join(os.tmpdir(), 'oh-my-x-article-profile-'))
const extension = path.resolve('build/chrome-mv3')
const screenshotDirectory = process.env.ARTICLE_SCREENSHOT_DIR
const statusId = ((BigInt(Date.now() - 7200000) - 1288834974657n) << 22n).toString()
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.ARTICLE_CHROMIUM,
  headless: false,
  ignoreDefaultArgs: ['--disable-extensions'],
  args: ['--headless=new', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  viewport: { width: 1280, height: 600 },
})
context.setDefaultTimeout(6000)

const fixture = `<!doctype html><html style="color-scheme: dark">
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  *{box-sizing:border-box}body{margin:0;font:15px Arial;color:#e7e9ea}
  main{max-width:700px;margin:auto;padding:16px}
  article{margin:0}h1{font-size:24px;line-height:1.3}
  .cover{height:160px;background:#1e2732;border-radius:12px;margin:16px 0}
  .counts{display:flex;justify-content:space-between;align-items:center;border-block:1px solid #2f3336;padding:12px 0;color:#8b98a5;gap:8px}
  .counts button{background:none;border:0;color:inherit;padding:0;font:inherit;white-space:nowrap}
  .counts a{color:inherit;text-decoration:none}
  .css-146c3p1{white-space:nowrap}
  .xf-stat-ratio-badge{display:inline-flex;margin-left:2px;padding:1.5px 4px;font-size:10px;font-weight:700;line-height:1.2;border-radius:4px;background:rgba(29,155,240,.18);color:#1d9bf0}
  @media(max-width:500px){.counts{font-size:12px;gap:4px}}
</style><body style="background-color: rgb(0, 0, 0)">
<main data-testid="primaryColumn"><div id="reader-host"></div></main></body></html>`

async function expectVelocity(page, text) {
  await page.waitForFunction((expected) => {
    const badges = document.querySelectorAll('[data-xf-viral-badge]')
    return badges.length === 1 && badges[0].textContent === expected
  }, text)
}

try {
  await context.route('https://**/*', (route) => route.fulfill({ contentType: 'text/html', body: fixture }))
  const isExtensionWorker = (worker) => worker.url().startsWith('chrome-extension:') && worker.url().endsWith('/background.js')
  const worker = context.serviceWorkers().find(isExtensionWorker)
    || await context.waitForEvent('serviceworker', { predicate: isExtensionWorker })
  const options = await context.newPage()
  await options.goto(`chrome-extension://${new URL(worker.url()).host}/options.html`)
  await options.waitForFunction(() => Boolean(chrome.storage?.local))
  await options.evaluate(() => chrome.storage.local.set({
    extensionStatus: 'on',
    uiLanguage: 'zh-CN',
    rewindEnabled: 'off',
    ownPostAutoSync: 'off',
    notificationCardsEnabled: 'off',
    viralShowLevels: 'potential,viral',
  }))
  const page = context.pages()[0]
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`https://x.com/u/status/${statusId}`)
  await page.locator('#xf-viral-radar-styles').waitFor({ state: 'attached' })

  for (let cycle = 0; cycle < 20; cycle++) {
    // Reuse the same outer tweet while moving from timeline to article, as X does.
    await page.evaluate((id) => {
      history.pushState(null, '', '/home')
      document.querySelector('#reader-host').innerHTML = `<article data-testid="tweet">
        <a href="/u/status/${id}"><time datetime="${new Date(Date.now() - 7200000).toISOString()}">2 小时前</time></a>
        <a href="/u/status/${id}/analytics" aria-label="5,845 次查看"><span class="css-146c3p1">5,845</span></a>
      </article>`
    }, statusId)
    await expectVelocity(page, '🚀 2.9k/h')
    await page.evaluate((id) => {
      history.pushState(null, '', '/u/status/' + id)
      document.querySelector('#reader-host > article').innerHTML = `<article data-testid="twitterArticleReadView">
        <header>文章</header><div class="cover"></div><h1>长文流速回归检查</h1>
        <div><div class="counts" role="group" id="id__counts">
          <button data-testid="reply">回复 24</button><button data-testid="like">喜欢 82</button>
          <a href="/u/status/${id}/analytics" aria-label="0 次查看"><span class="css-146c3p1">0</span></a>
          <button data-testid="bookmark">收藏 104</button><button>分享</button>
        </div></div></article>`
    }, statusId)
    // Wait for article discovery to finish while the initial count is still zero.
    await page.waitForFunction((id) => document.querySelector('[data-testid="tweet"]').dataset.xfViralKey === 'article:' + id, statusId)
    assert.equal(await page.locator('[data-xf-viral-badge]').count(), 0)

    if (cycle % 2 === 0) {
      await page.locator('a[href$="/analytics"]').evaluate((link) => link.setAttribute('aria-label', '5,845 次查看'))
    } else {
      await page.locator('a[href$="/analytics"]').evaluate((link) => {
        link.removeAttribute('aria-label')
        link.querySelector('span').firstChild.nodeValue = '5,845'
      })
    }
    await expectVelocity(page, '🚀 2.9k/h')

    // X replaces the number's native span and removes the extension's child.
    await page.locator('a[href$="/analytics"]').evaluate((link) => {
      link.removeAttribute('aria-label')
      link.innerHTML = '<span class="css-146c3p1">5,845<span class="xf-stat-ratio-badge">普通</span></span>'
    })
    await expectVelocity(page, '🚀 2.9k/h')
    assert.equal(await page.locator('.xf-stat-ratio-badge').evaluate((badge) => badge.nextElementSibling?.textContent), '🚀 2.9k/h')

    // Replacing the whole link must transfer observation to the new link.
    await page.locator('a[href$="/analytics"]').evaluate((link) => {
      const replacement = link.cloneNode(true)
      replacement.querySelector('[data-xf-viral-badge]').remove()
      link.replaceWith(replacement)
    })
    await expectVelocity(page, '🚀 2.9k/h')
  }

  const churn = await page.locator('a[href$="/analytics"]').evaluate(async (link) => {
    let count = 0
    const observer = new MutationObserver((mutations) => { count += mutations.length })
    observer.observe(link, { subtree: true, childList: true, attributes: true, characterData: true })
    await new Promise((resolve) => setTimeout(resolve, 250))
    observer.disconnect()
    return count
  })
  assert.equal(churn, 0, 'unchanged native metrics must not keep rewriting the badge')
  assert.deepEqual(errors, [])

  if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true })
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 600 })
    await expectVelocity(page, '🚀 2.9k/h')
    const geometry = await page.evaluate(() => ({
      badgeRight: document.querySelector('[data-xf-viral-badge]').getBoundingClientRect().right,
      bookmarkLeft: document.querySelector('[data-testid="bookmark"]').getBoundingClientRect().left,
      scrollWidth: document.documentElement.scrollWidth,
      width: innerWidth,
    }))
    assert(geometry.badgeRight < geometry.bookmarkLeft)
    assert.equal(geometry.scrollWidth, geometry.width)
    if (screenshotDirectory) await page.screenshot({ path: path.join(screenshotDirectory, `article-${width}.png`) })
  }

  await options.evaluate(() => chrome.storage.local.set({ viralShowBadge: 'off' }))
  await page.locator('[data-xf-viral-badge]').waitFor({ state: 'detached' })
  await page.locator('a[href$="/analytics"]').evaluate((link) => link.setAttribute('aria-label', '6,000 次查看'))
  await options.evaluate(() => chrome.storage.local.set({ viralShowBadge: 'on' }))
  await expectVelocity(page, '🚀 3k/h')
  console.log('Passed 20 timeline-to-article cycles, delayed attributes/text, native span/link replacement, idle stability, 1280/375 layouts and badge settings.')
} finally {
  await context.close()
  await rm(profile, { recursive: true, force: true })
}
