import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addMediaDownloadButtons, setMediaDownloadEnabled } from '../../content-scripts/options/timeline'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// X 新版页面的菜单项：图标在 span 里，文字直接在 div 里
const XDS_ITEM = (label: string, id = 'base-ui-1') => `
  <div role="menuitem" id="${id}" tabindex="-1" data-slot="xds-menu-item" data-highlighted="" class="relative flex gap-3 px-3 font-medium">
    <span class="relative shrink-0"><svg fill="currentColor" data-icon="icon-link" viewBox="0 0 24 24" width="1em" height="1em"><path d="M1 1"></path></svg></span>
    <div class="relative min-w-0 flex-1">${label}</div>
  </div>`

// X 旧版页面的菜单项：文字在 div[dir] > span 里，字重写在 div[dir] 的样式类上
const RNW_ITEM = (label: string) => `
  <div role="menuitem" tabindex="0" class="css-175oi2r r-1loqt21">
    <div class="css-175oi2r r-1777fci"><svg viewBox="0 0 24 24" class="r-4qtqp9"><g><path d="M1 1"></path></g></svg></div>
    <div class="css-175oi2r r-16y2uox"><div dir="ltr" class="css-146c3p1 r-b88u0q"><span class="css-1jxf684">${label}</span></div></div>
  </div>`

function mountVideoTweet({ withPhoto = false } = {}) {
  document.body.innerHTML = `
    <article data-testid="tweet">
      <a href="/alice/status/123">时间</a>
      <div data-testid="videoPlayer"><video></video></div>
      ${withPhoto ? '<div data-testid="tweetPhoto"><img src="https://pbs.twimg.com/media/abc?format=jpg&name=small"></div>' : ''}
      <div role="group"><button data-testid="sharePost" aria-label="分享帖子"></button></div>
    </article>
  `
  const shareBtn = document.querySelector<HTMLButtonElement>('button[data-testid="sharePost"]')!
  addMediaDownloadButtons()
  return shareBtn
}

async function openShareMenu(shareBtn: HTMLButtonElement, items: string) {
  shareBtn.click()
  const dropdown = document.createElement('div')
  dropdown.setAttribute('data-testid', 'Dropdown')
  dropdown.innerHTML = items
  document.body.append(dropdown)
  await sleep(80)
  return dropdown
}

let sendMessage: ReturnType<typeof vi.fn>

beforeEach(() => {
  sendMessage = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('browser', { runtime: { id: 'test-extension', sendMessage } })
  setMediaDownloadEnabled(true)
})

afterEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('下载菜单项沿用 X 原生菜单项的样式', () => {
  it('新版菜单：保留样式类，只换图标和文字', async () => {
    const dropdown = await openShareMenu(mountVideoTweet(), XDS_ITEM('复制链接'))
    const option = dropdown.querySelector<HTMLElement>('#xf-download-video-btn')!

    expect(option.className).toContain('relative flex gap-3 px-3 font-medium')
    expect(option.querySelector('div.flex-1')?.textContent).toBe('下载视频 (MP4)')
    const svg = option.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('1em')
    expect(svg.hasAttribute('data-icon')).toBe(false)
    expect(svg.querySelector('path')?.getAttribute('style')).toContain('stroke:currentColor')
    // 不带走原菜单项的编号和悬停状态
    expect(dropdown.querySelectorAll('#base-ui-1')).toHaveLength(1)
    expect(option.hasAttribute('data-highlighted')).toBe(false)
    expect(document.getElementById('xf-style-mediaDownloadMenu')).not.toBeNull()
  })

  it('旧版菜单：文字放回原来的 span，字重样式类还在', async () => {
    const dropdown = await openShareMenu(mountVideoTweet(), RNW_ITEM('复制链接'))
    const option = dropdown.querySelector<HTMLElement>('#xf-download-video-btn')!

    const label = option.querySelector('div[dir] > span.css-1jxf684')
    expect(label?.textContent).toBe('下载视频 (MP4)')
    expect(option.querySelector('div[dir]')?.className).toContain('r-b88u0q')
    expect(option.querySelector('svg g')).toBeNull()
  })

  it('点击后，进度文字写在原来放文字的位置', async () => {
    const dropdown = await openShareMenu(mountVideoTweet(), RNW_ITEM('复制链接'))
    const option = dropdown.querySelector<HTMLElement>('#xf-download-video-btn')!
    option.click()
    await sleep(0)

    expect(sendMessage).toHaveBeenCalledWith({ type: 'XF_GET_TWEET_MEDIA', tweetId: '123' })
    expect(option.querySelector('span.css-1jxf684')?.textContent).toBe('未获取到视频直链')
    expect(option.querySelectorAll('svg')).toHaveLength(1)
  })

  it('认不出菜单项结构时，退回自建的菜单项', async () => {
    const dropdown = await openShareMenu(mountVideoTweet(), '<div role="menuitem"><span>复制链接</span></div>')
    const option = dropdown.querySelector<HTMLElement>('#xf-download-video-btn')!
    expect(option.textContent).toBe('下载视频 (MP4)')
    expect(option.querySelector('svg path')?.getAttribute('style')).toContain('stroke:currentColor')
  })
})

describe('X 自带「下载视频」时不重复', () => {
  it('菜单里已有 X 的「下载视频」，不再加我们的视频下载，图片下载照常加', async () => {
    const dropdown = await openShareMenu(
      mountVideoTweet({ withPhoto: true }),
      XDS_ITEM('复制链接') + XDS_ITEM('下载视频', 'base-ui-2'),
    )
    expect(dropdown.querySelector('#xf-download-video-btn')).toBeNull()
    expect(dropdown.querySelector('#xf-download-photo-btn')).not.toBeNull()
  })

  it('英文界面的 Download video 也能认出来', async () => {
    const dropdown = await openShareMenu(mountVideoTweet(), RNW_ITEM('Copy link') + RNW_ITEM('Download video'))
    expect(dropdown.querySelector('#xf-download-video-btn')).toBeNull()
  })

  it('X 的「下载视频」晚一点才出现时，去掉我们那条', async () => {
    const dropdown = await openShareMenu(mountVideoTweet(), XDS_ITEM('复制链接'))
    expect(dropdown.querySelector('#xf-download-video-btn')).not.toBeNull()

    dropdown.insertAdjacentHTML('afterbegin', XDS_ITEM('下载视频', 'base-ui-2'))
    await sleep(250)
    expect(dropdown.querySelector('#xf-download-video-btn')).toBeNull()
  })

  it('名字相近的项不算，例如「下载视频 (MP4)」以外的其他项', async () => {
    const dropdown = await openShareMenu(mountVideoTweet(), XDS_ITEM('发布视频'))
    await sleep(250)
    expect(dropdown.querySelector('#xf-download-video-btn')).not.toBeNull()
  })
})


describe('GIF 导出与下载', () => {
  it('视频播放器未标注 GIF 时也提供导出入口', async () => {
    const dropdown = await openShareMenu(mountVideoTweet(), XDS_ITEM('复制链接'))
    const option = dropdown.querySelector<HTMLElement>('#xf-export-gif-btn')
    expect(option?.textContent?.trim()).toBe('导出 GIF')
    sendMessage.mockResolvedValue({ ok: true })
    option!.click()
    await sleep(0)
    expect(sendMessage).toHaveBeenCalledWith({ type: 'XF_EXPORT_GIF', tweetId: '123', locale: 'zh-CN' })
  })

  it('导出页面打开失败时显示失败，并允许重试', async () => {
    const dropdown = await openShareMenu(mountVideoTweet(), XDS_ITEM('复制链接'))
    const option = dropdown.querySelector<HTMLElement>('#xf-export-gif-btn')
    expect(option).not.toBeNull()
    sendMessage.mockResolvedValue({ ok: false })
    option!.click()
    await sleep(0)
    expect(option!.textContent?.trim()).toBe('无法打开 GIF 导出页，请重试')
    sendMessage.mockResolvedValue({ ok: true })
    option!.click()
    await sleep(0)
    expect(option!.textContent?.trim()).toBe('已打开 GIF 导出页')
  })

  it('GIF 只被识别为视频时，MP4 下载仍能取到 GIF 资源', async () => {
    const dropdown = await openShareMenu(mountVideoTweet(), XDS_ITEM('复制链接'))
    sendMessage.mockResolvedValueOnce({ ok: true, media: { videos: [], gifs: [{ bestMp4Url: 'https://video.twimg.com/g.mp4' }] } })
      .mockResolvedValueOnce({ ok: true })
    dropdown.querySelector<HTMLElement>('#xf-download-video-btn')!.click()
    await sleep(0)
    expect(sendMessage).toHaveBeenCalledWith({ type: 'XF_DOWNLOAD_MEDIA', url: 'https://video.twimg.com/g.mp4', filename: 'x_alice_123.mp4' })
  })

  it('后台返回下载失败时不显示已开始下载', async () => {
    const dropdown = await openShareMenu(mountVideoTweet(), XDS_ITEM('复制链接'))
    sendMessage.mockResolvedValueOnce({ media: { videos: [{ bestMp4Url: 'https://video.twimg.com/v.mp4' }] } })
      .mockResolvedValueOnce({ ok: false })
    const option = dropdown.querySelector<HTMLElement>('#xf-download-video-btn')!
    option.click()
    await sleep(0)
    expect(option.textContent?.trim()).toBe('下载失败')
  })
})
