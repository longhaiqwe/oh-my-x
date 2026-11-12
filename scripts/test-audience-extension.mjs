// Loads the production extension in a disposable Chromium profile with synthetic X responses.
// No requests reach X; no user profile, credentials or account settings are used.
import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import os from 'node:os'
const { chromium } = await import(
  process.env.AUDIENCE_PLAYWRIGHT_MODULE || 'playwright-core'
)
const directory = await mkdtemp(path.join(os.tmpdir(), 'audience-extension-'))
const extension = path.resolve('build/chrome-mv3')
const context = await chromium.launchPersistentContext(directory, {
  headless: true,
  ignoreDefaultArgs: ['--disable-extensions'],
  executablePath: process.env.AUDIENCE_CHROMIUM,
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
  ],
  viewport: { width: 1280, height: 900 },
})
context.setDefaultTimeout(15000)
console.log('Chromium ready')
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:white;color:#0f1419;font:16px system-ui}main{max-width:700px;margin:auto}nav{display:flex;padding:20px;gap:24px}article{height:100px;border-bottom:1px solid #ddd;padding:20px}button{font:inherit}</style><div id="react-root"><a data-testid="AppTabBar_Profile_Link" href="/owner">Profile</a><main data-testid="primaryColumn"><nav role="tablist"><a role="tab" href="/owner/followers">Followers</a><a role="tab" href="/owner/following">Following</a></nav><section>${Array.from({ length: 10 }, (_, i) => `<article>Native list row ${i + 1}</article>`).join('')}</section></main></div>`
const makeResponse = () => ({
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: Array.from({ length: 25 }, (_, i) => ({
                  entryId: `user-${i + 1}`,
                  content: {
                    itemContent: {
                      itemType: 'TimelineUser',
                      user_results: {
                        result: {
                          __typename: 'User',
                          rest_id: String(i + 1),
                          core: {
                            screen_name: 'synthetic' + i,
                            name: '测试账号 ' + i,
                          },
                          relationship_counts: {
                            followers: i * 3000,
                            following: i * 10,
                          },
                          relationship_perspectives:
                            i % 3 === 0 ? {} : { followed_by: i % 3 === 1 },
                        },
                      },
                    },
                  },
                })),
              },
            ],
          },
        },
      },
    },
  },
})
const request =
  'https://x.com/i/api/graphql/test/Following?variables=' +
  encodeURIComponent(JSON.stringify({ userId: '100' }))
let release,
  hold = false
try {
  await context.route('https://**/*', async (route) => {
    if (route.request().url().includes('/graphql/')) {
      if (hold) await new Promise((resolve) => (release = resolve))
      await route
        .fulfill({
          contentType: 'application/json',
          body: JSON.stringify(makeResponse()),
        })
        .catch(() => {})
      return
    }
    await route.fulfill({ contentType: 'text/html', body: html })
  })
  const worker =
    context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'))
  console.log('Extension worker ready')
  const id = new URL(worker.url()).host
  const options = await context.newPage()
  await options.goto(`chrome-extension://${id}/options.html#insight/audience`)
  await options.waitForFunction(() => !!chrome.storage?.local)
  await options.evaluate(async () => {
    await chrome.storage.local.set({
      audienceEnabled: 'on',
      extensionStatus: 'on',
      uiLanguage: 'zh-CN',
      rewindEnabled: 'off',
      ownPostAutoSync: 'off',
      notificationCardsEnabled: 'off',
    })
  })
  await context.addCookies([
    { name: 'twid', value: 'u=100', domain: '.x.com', path: '/', secure: true },
  ])
  const page = await context.newPage()
  await page.goto('https://x.com/owner/following')
  console.log('Native fixture loaded')
  await page.locator('#xf-audience-entry').waitFor()
  console.log('Capture entry ready')
  await page.evaluate((url) => fetch(url).then((r) => r.json()), request)
  await page.waitForFunction(() =>
    document.querySelector('#xf-audience-entry')?.textContent?.includes('25'),
  )
  await page.locator('#xf-audience-entry').click()
  await page
    .locator('#xf-audience-panel')
    .locator('dialog')
    .waitFor({ state: 'visible' })
  assert.equal(
    await page.locator('#xf-audience-panel').locator('article').count(),
    12,
  )
  await options.reload()
  console.log('Options loaded')
  await options
    .getByRole('heading', { name: '粉丝与关注分析', exact: true })
    .waitFor()
  const records = await options.evaluate(() =>
    chrome.runtime.sendMessage({ type: 'xf-audience', action: 'list' }),
  )
  assert.equal(records.result.length, 1)
  assert.equal(records.result[0].count, 25)
  await options.getByRole('button', { name: '查看', exact: true }).click()
  await options
    .locator('#xf-audience-panel')
    .locator('dialog')
    .waitFor({ state: 'visible' })
  await options.keyboard.press('Escape')
  // A response begun before clear must not recreate a deleted list.
  await page.keyboard.press('Escape')
  hold = true
  const pending = page.evaluate(
    (url) => fetch(url).then((r) => r.json()),
    request,
  )
  await page.waitForTimeout(100)
  await options.evaluate(() =>
    chrome.runtime.sendMessage({
      type: 'xf-audience',
      action: 'clear',
      account: '100',
      key: '100:100:following',
    }),
  )
  hold = false
  release?.()
  await pending
  await page.waitForTimeout(1000)
  assert.equal(
    (
      await options.evaluate(() =>
        chrome.runtime.sendMessage({ type: 'xf-audience', action: 'list' }),
      )
    ).result.length,
    0,
  )
  // Capturing again uses the new generation; disabling removes the entry and prevents writes.
  await page.evaluate((url) => fetch(url).then((r) => r.json()), request)
  await page.waitForFunction(() =>
    document.querySelector('#xf-audience-entry')?.textContent?.includes('25'),
  )
  await options.evaluate(() =>
    chrome.storage.local.set({ audienceEnabled: 'off' }),
  )
  await page.locator('#xf-audience-entry').waitFor({ state: 'detached' })
  await page.close()
  await options.reload()
  await options.getByRole('button', { name: '查看', exact: true }).waitFor()
  await options.getByRole('button', { name: '查看', exact: true }).click()
  await options
    .locator('#xf-audience-panel')
    .locator('dialog')
    .waitFor({ state: 'visible' })
  await mkdir('/tmp/oh-my-x-audience-validation', { recursive: true })
  await options.screenshot({
    path: '/tmp/oh-my-x-audience-validation/saved-settings.png',
  })
  console.log(
    'PASS: production extension MAIN → content → background → IndexedDB → Vue; local settings without X tab; clear/late response race; disabled capture. Synthetic data only.',
  )
} finally {
  release?.()
  await context.close()
  await rm(directory, { recursive: true, force: true })
}
