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
    '--host-resolver-rules=MAP x.com ~NOTFOUND,MAP api.x.com ~NOTFOUND',
  ],
  viewport: { width: 1280, height: 900 },
})
context.setDefaultTimeout(15000)
console.log('Chromium ready')
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:white;color:#0f1419;font:16px serif}main{max-width:700px;margin:auto}nav{display:flex;border-bottom:1px solid #ddd}.swipe{height:60px;overflow:hidden;position:relative;flex:1}[role=tablist]{display:flex;height:60px;align-items:center;gap:24px}article{height:100px;border-bottom:1px solid #ddd;padding:20px}button{font:inherit}</style><div id="react-root"><a href="/i/keyboard_shortcuts" style="color:rgb(255,122,0)">Shortcuts</a><a data-testid="AppTabBar_Profile_Link" href="/owner">Profile</a><main data-testid="primaryColumn"><nav role="navigation"><div class="swipe" data-testid="ScrollSnap-SwipeableList"><div role="tablist"><a role="tab" href="/owner/followers"><span style="font-family:Arial,sans-serif">Followers</span></a><a role="tab" href="/owner/following"><span style="font-family:Arial,sans-serif">Following</span></a></div></div></nav><section>${Array.from({ length: 10 }, (_, i) => `<article>Native list row ${i + 1}</article>`).join('')}</section></main></div>`
const makeResponse = (count = 25, first = 1) => ({
  data: {
    user: {
      result: {
        timeline: {
          timeline: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: Array.from({ length: count }, (_, i) => ({
                  entryId: `user-${i + first}`,
                  content: {
                    itemContent: {
                      itemType: 'TimelineUser',
                      user_results: {
                        result: {
                          __typename: 'User',
                          rest_id: String(i + first),
                          core: {
                            screen_name: 'synthetic' + (i + first - 1),
                            name: '测试账号 ' + (i + first - 1),
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
  hold = false,
  verifiedRequests = 0
try {
  await context.route('https://**/*', async (route) => {
    if (route.request().url().includes('/graphql/')) {
      if (hold) await new Promise((resolve) => (release = resolve))
      const verified = route.request().url().includes('/BlueVerifiedFollowers?')
      if (verified) {
        verifiedRequests++
        assert.equal(route.request().headers()['x-client-uuid'], 'audience-fixture')
      }
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
  const geometry = await page.evaluate(() => {
    const bar = document.querySelector('#xf-audience-entry')
    const nav = document.querySelector('nav')
    const b = bar.getBoundingClientRect(), n = nav.getBoundingClientRect()
    return { outside: !nav.contains(bar), below: b.top >= n.bottom, width: b.width, navWidth: n.width }
  })
  assert.equal(geometry.outside, true, 'entry must be outside the clipped native navigation')
  assert.equal(geometry.below, true)
  assert.equal(geometry.width, geometry.navWidth)
  const entryStyle = await page.locator('#xf-audience-entry').evaluate(el => ({ font: getComputedStyle(el).fontFamily, nativeFont: getComputedStyle(document.querySelector('[role=tab] span')).fontFamily }))
  assert.equal(entryStyle.font, entryStyle.nativeFont, 'entry uses native X text font, not body font')
  await page.locator('#xf-audience-entry').focus()
  const outline = await page.locator('#xf-audience-entry').evaluate(el => getComputedStyle(el).outlineColor)
  assert.equal(outline, 'rgb(255, 122, 0)', 'keyboard focus follows X accent')
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
  await options.getByRole('button', { name: '查看', exact: true }).first().click()
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
  // All three routes retain separate samples, including across native-style SPA changes.
  for (const [kind, operation, label] of [
    ['followers', 'Followers', '粉丝构成'],
    ['verified_followers', 'BlueVerifiedFollowers', '认证粉丝构成'],
  ]) {
    const url = request.replace('/Following?', `/${operation}?`)
    if (kind === 'verified_followers') {
      // X starts its first page while changing tabs, before the extension has its new route context.
      await page.evaluate((url) => new Promise(resolve => {
        history.pushState({}, '', '/owner/verified_followers')
        const xhr = new XMLHttpRequest()
        xhr.open('GET', url)
        xhr.setRequestHeader('x-client-uuid', 'audience-fixture')
        xhr.onloadend = resolve
        xhr.send()
      }), url)
    } else {
      await page.evaluate(kind => history.pushState({}, '', `/owner/${kind}`), kind)
      await page.waitForFunction(label => document.querySelector('#xf-audience-entry')?.textContent === `已记录 0 人 · 查看${label}`, label)
      await page.evaluate(url => fetch(url).then(r => r.json()), url)
    }
    await page.waitForFunction(label => document.querySelector('#xf-audience-entry')?.textContent === `已记录 25 人 · 查看${label}`, label).catch(async error => { console.log('Capture failed', kind, await page.locator('#xf-audience-entry').textContent(), await options.evaluate(() => chrome.runtime.sendMessage({ type: 'xf-audience', action: 'list' }))); throw error })
    await page.locator('#xf-audience-entry').click()
    await page.locator('#xf-audience-panel').getByRole('heading', { name: label, exact: true }).waitFor()
    if (kind === 'verified_followers') {
      const panel = page.locator('#xf-audience-panel')
      await panel.getByText('认证名单按已加载的账号累计，单独保存。').waitFor()
      assert.equal(verifiedRequests, 1)
      await mkdir('/tmp/oh-my-x-audience-validation', { recursive: true })
      await page.screenshot({ path: '/tmp/oh-my-x-audience-validation/verified-panel.png' })
      await page.setViewportSize({ width: 375, height: 820 })
      await page.screenshot({ path: '/tmp/oh-my-x-audience-validation/verified-panel-mobile.png' })
      await page.setViewportSize({ width: 1280, height: 900 })
    }
    await page.keyboard.press('Escape')
  }
  const separated = await options.evaluate(() => chrome.runtime.sendMessage({ type: 'xf-audience', action: 'list' }))
  assert.deepEqual(separated.result.map(r => r.kind).sort(), ['followers', 'following', 'verified_followers'])
  assert.equal(separated.result.every(r => r.count === 25), true)
  await page.screenshot({ path: '/tmp/oh-my-x-audience-validation/verified-entry.png' })
  await page.locator('#xf-audience-entry').screenshot({ path: '/tmp/oh-my-x-audience-validation/entry-theme-preview.png' })
  await page.setViewportSize({ width: 375, height: 820 })
  const mobile = await page.locator('#xf-audience-entry').evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth, height: el.getBoundingClientRect().height }))
  assert(mobile.scrollWidth <= mobile.width && mobile.height >= 48)
  await page.screenshot({ path: '/tmp/oh-my-x-audience-validation/verified-entry-mobile.png' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await options.evaluate(() =>
    chrome.storage.local.set({ audienceEnabled: 'off' }),
  )
  await page.locator('#xf-audience-entry').waitFor({ state: 'detached' })
  await page.close()
  const firstBatch = makeResponse(1, 26)
  firstBatch.data.user.result.timeline.timeline.instructions[0].entries.push({
    entryId: 'cursor-bottom-1', content: { cursorType: 'Bottom', value: 'next-batch' },
  })
  await worker.evaluate(({ firstBatch, secondBatch }) => {
    const nativeFetch = globalThis.fetch
    globalThis.audienceFixtureRequests = []
    globalThis.fetch = (input, init) => {
      const url = new URL(input)
      if (url.pathname.endsWith('/viewerQuery')) {
        return Promise.resolve(Response.json({ data: { viewer: { user_results: { result: {
          rest_id: '100', id: 'fixture-owner', core: { screen_name: 'owner' },
        } } } } }))
      }
      const operation = url.pathname.split('/').at(-1)
      if (operation === 'UsersByScreenNames') {
        const { screen_names } = JSON.parse(url.searchParams.get('variables'))
        return Promise.resolve(Response.json({ data: { users: screen_names.map(handle => ({
          result: { rest_id: String(Number(handle.replace('synthetic', '')) + 1), relationship_counts: { followers: 12000 } },
        })) } }))
      }
      if (['followersQuery', 'BlueVerifiedFollowers', 'Following'].includes(operation)) {
        const variables = JSON.parse(url.searchParams.get('variables'))
        globalThis.audienceFixtureRequests.push({ operation, ...variables })
        const data = variables.cursor ? secondBatch : firstBatch
        if (operation !== 'followersQuery') return Promise.resolve(Response.json(data))
        const entries = data.data.user.result.timeline.timeline.instructions[0].entries.map(entry => {
          if (entry.content.cursorType) return { entry_id: entry.entryId, content: {
            cursor_type: 'Bottom', value: entry.content.value,
          }}
          const { relationship_counts: _, ...identity } = entry.content.itemContent.user_results.result
          return { entry_id: entry.entryId, content: { content: {
            __typename: 'TimelineUser', user_results: { result: identity },
          } } }
        })
        return Promise.resolve(Response.json({ data: { user_result_by_screen_name: { result: {
          id: 'fixture-owner',
          followers_timeline: { timeline: { instructions: [{ __typename: 'TimelineAddEntries', entries }] } },
        } } } }))
      }
      return nativeFetch(input, init)
    }
  }, { firstBatch, secondBatch: makeResponse(1, 27) })
  await context.addCookies([
    { name: 'ct0', value: 'fixture-csrf', domain: '.x.com', path: '/', secure: true },
  ])
  await options.evaluate(async () => {
    await chrome.storage.local.remove([
      'audienceFollowersClassicEndpoint', 'verifiedAudienceClassicEndpoint', 'audienceFollowingClassicEndpoint',
    ])
    await chrome.storage.local.set({ audienceEnabled: 'on' })
  })
  await options.getByText('26 个账号', { exact: true }).first().waitFor()
  await options.getByText('26 个账号', { exact: true }).nth(1).waitFor()
  assert.deepEqual(
    (await worker.evaluate(() => globalThis.audienceFixtureRequests.map(({ operation }) => operation))).sort(),
    ['BlueVerifiedFollowers', 'followersQuery'],
  )
  const followerRecord = options.getByText('@owner · 粉丝构成', { exact: true }).locator('../..')
  await followerRecord.getByRole('button', { name: '查看', exact: true }).click()
  const followersPanel = options.locator('#xf-audience-panel')
  await followersPanel.getByText(/粉丝数已知 25 人/).waitFor()
  const followerSearch = followersPanel.getByRole('searchbox')
  await followerSearch.fill('synthetic25')
  // The previously cleared own Following list waits a day before resuming.
  await worker.evaluate(async () => {
    const now = Date.now
    Date.now = () => now() + 25 * 60 * 60 * 1000
    await chrome.alarms.create('XF_ALARM_VERIFIED_AUDIENCE', { delayInMinutes: 0.002 })
  })
  await options.getByText('27 个账号', { exact: true }).nth(1).waitFor()
  await options.getByText('26 个账号', { exact: true }).waitFor()
  await followersPanel.getByText(/粉丝数已知 26 人/).waitFor()
  await followersPanel.getByText('12,000', { exact: true }).waitFor()
  assert.equal(await followerSearch.inputValue(), 'synthetic25')
  await options.keyboard.press('Escape')
  await worker.evaluate(async () => {
    const { audienceSyncProgress } = await chrome.storage.local.get('audienceSyncProgress')
    audienceSyncProgress.lists.following.nextAt = 0
    await chrome.storage.local.set({ audienceSyncProgress })
    await chrome.alarms.create('XF_ALARM_VERIFIED_AUDIENCE', { delayInMinutes: 0.002 })
  })
  await options.getByText('27 个账号', { exact: true }).nth(2).waitFor()
  const cursors = await worker.evaluate(() => Object.groupBy(globalThis.audienceFixtureRequests, ({ operation }) => operation))
  assert.deepEqual(Object.keys(cursors).sort(), ['BlueVerifiedFollowers', 'Following', 'followersQuery'])
  for (const [operation, pages] of Object.entries(cursors)) {
    assert.deepEqual(pages.map(({ cursor }) => cursor), [operation === 'followersQuery' ? null : undefined, 'next-batch'])
    assert(pages.every(({ userId, screenName }) => operation === 'followersQuery' ? screenName === 'owner' : userId === '100'))
  }
  await options.getByText('保持 Chrome 运行并登录 X。你的普通粉丝、认证粉丝和正在关注会在后台同步，结果保存在这里。').waitFor()
  await options.screenshot({ path: '/tmp/oh-my-x-audience-validation/background-settings.png' })
  await options.setViewportSize({ width: 375, height: 820 })
  assert(await options.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await options.screenshot({ path: '/tmp/oh-my-x-audience-validation/background-settings-mobile.png' })
  await options.setViewportSize({ width: 1280, height: 900 })
  await options.reload()
  await options.getByRole('button', { name: '查看', exact: true }).first().waitFor()
  await options.getByRole('button', { name: '查看', exact: true }).first().click()
  await options
    .locator('#xf-audience-panel')
    .locator('dialog')
    .waitFor({ state: 'visible' })
  await mkdir('/tmp/oh-my-x-audience-validation', { recursive: true })
  await options.screenshot({
    path: '/tmp/oh-my-x-audience-validation/saved-settings.png',
  })
  console.log(
    'PASS: all three lists and follower counts sync without an X tab; the open distribution updates and retains search; clear/late response race and disabled capture. Synthetic data only.',
  )
} finally {
  release?.()
  await context.close()
  await rm(directory, { recursive: true, force: true })
}
