import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { addMediaDownloadButtons, setMediaDownloadEnabled } from '../../content-scripts/options/timeline'

function mountTweet() {
  document.body.innerHTML = `
    <article data-testid="tweet">
      <a href="/alice/status/123">时间</a>
      <div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/abc?format=jpg&name=small"></div>
      <div role="group"><button data-testid="sharePost" aria-label="分享帖子"></button></div>
    </article>
  `
  return document.querySelector<HTMLButtonElement>('button[data-testid="sharePost"]')!
}

async function openShareMenu(shareBtn: HTMLButtonElement) {
  shareBtn.click()
  // 模拟 X 渲染分享菜单
  const dropdown = document.createElement('div')
  dropdown.setAttribute('data-testid', 'Dropdown')
  dropdown.innerHTML = '<div role="menuitem"><span>复制链接</span></div>'
  document.body.append(dropdown)
  await new Promise((resolve) => setTimeout(resolve, 80))
  return dropdown
}

beforeEach(() => {
  vi.stubGlobal('browser', { runtime: { id: 'test-extension', sendMessage: vi.fn() } })
  setMediaDownloadEnabled(true)
})

afterEach(() => {
  document.body.innerHTML = ''
  setMediaDownloadEnabled(true)
  vi.unstubAllGlobals()
})

it('开启时，分享菜单里出现下载图片选项', async () => {
  const shareBtn = mountTweet()
  addMediaDownloadButtons()
  expect(shareBtn.dataset.xfShareEnhanced).toBe('1')

  const dropdown = await openShareMenu(shareBtn)
  expect(dropdown.querySelector('.xf-media-download-option')).not.toBeNull()
})

it('关闭后，已挂好监听的分享按钮也不再加入下载选项', async () => {
  const shareBtn = mountTweet()
  addMediaDownloadButtons()
  setMediaDownloadEnabled(false)

  const dropdown = await openShareMenu(shareBtn)
  expect(dropdown.querySelector('.xf-media-download-option')).toBeNull()
})

it('关闭期间，新推文不挂监听', () => {
  setMediaDownloadEnabled(false)
  const shareBtn = mountTweet()
  addMediaDownloadButtons()
  expect(shareBtn.dataset.xfShareEnhanced).toBeUndefined()
})
