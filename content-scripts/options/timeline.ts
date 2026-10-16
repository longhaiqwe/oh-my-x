import selectors from '../selectors'
import addStyles, { removeStyles } from '../utilities/addStyles'
import waitForElement from '../utilities/waitForElement'
import { syncRadarPageMarker } from './radar'
import { extractTweetInfoFromDom, type DomTweetInfo } from '../../shared/tweet-media'

/**
 * 在 <body> 上维护一个标记属性，供 CSS 排除账号分析页面（/i/account_analytics）
 * 的时间线宽度限制（changeTimelineWidth 注入的 primaryColumn 宽度规则）。
 * SPA 路由切换时由动态功能循环调用以保持同步。
 */
export function syncAccountAnalyticsPageMarker() {
  const isAnalyticsPage = window.location.pathname.includes('/i/account_analytics')
  if (isAnalyticsPage) {
    document.body?.setAttribute('data-xf-account-analytics', '')
  } else {
    document.body?.removeAttribute('data-xf-account-analytics')
  }
}

export const changeTimelineWidth = (
  timelineWidth: string | number | boolean,
  navigationLabels: string | number | boolean = 'never',
  sidebarColumn: string | number | boolean = 'off',
) => {
  // 账号分析页与 Radar 页不限制主列宽度，先同步 body 标记
  syncAccountAnalyticsPageMarker()
  syncRadarPageMarker()
  const width = Number(timelineWidth)
  // 防御：未归一化的非法值（NaN）不应注入 CSS
  if (!Number.isFinite(width)) {
    removeStyles('timelineWidth')
    return
  }
  const isSidebarHidden = sidebarColumn === 'on' || sidebarColumn === 'hide'

  // 当右侧栏隐藏时，header 与 main 自然按 1:1 flex-grow 平分剩余空间达成居中，
  // 不再人为干预 header 宽度；主列右侧间距也置为 0；
  // 仅在右侧栏展示且导航栏非 never 且宽度 > 600 时，按原逻辑补偿侧栏宽度。
  const sidebarWidth =
    isSidebarHidden || navigationLabels === 'never' || width <= 600
      ? null
      : Math.round(200 + ((800 - width) / 50) * 25)

  const primaryMarginRight = isSidebarHidden ? '0px' : '20px'

  addStyles(
    'timelineWidth',
    `@media only screen and (min-width: 988px) {
      body:not([data-xf-account-analytics]):not([data-xf-radar]) ${selectors.mainColumn} {
        width: ${width}px !important;
        max-width: ${width}px !important;
        margin-right: ${primaryMarginRight};
      }
      ${sidebarWidth ? `${selectors.leftSidebar} { width: ${sidebarWidth}px !important; }` : ''}
      /* Column shell only — do not force width:100% on arbitrary nested divs
         (bookmarks search uses ~95% width and must keep it). */
      body:not([data-xf-account-analytics]):not([data-xf-radar]) ${selectors.mainColumn} > div,
      body:not([data-xf-account-analytics]):not([data-xf-radar]) ${selectors.mainColumn} > div > div {
        max-width: ${width}px !important;
      }
      /* X caps the timeline wrapper at 600px (e.g. .r-1ye8kvj). Override that
         parent + section so the feed fills the custom column width.
         Included selectors:
         - div:has(> section[role="region"]): Standard timeline feed container
         - div.r-13qz1uu.r-1ye8kvj: Timeline wrapper on profile, home, search, bookmarks, and tweet status
         - section[role="region"]: Timeline section itself
      */
      body:not([data-xf-account-analytics]):not([data-xf-radar]) ${selectors.mainColumn} div:has(> section[role="region"]),
      body:not([data-xf-account-analytics]):not([data-xf-radar]) ${selectors.mainColumn} div.r-13qz1uu.r-1ye8kvj,
      body:not([data-xf-account-analytics]):not([data-xf-radar]) ${selectors.mainColumn} section[role="region"] {
        max-width: ${width}px !important;
        width: 100% !important;
      }
    }`
  )
}


// 保存最近一次用户点击分享按钮的推文媒体上下文
let lastActiveTweetContext: DomTweetInfo | null = null

// 全局点击捕获兜底：只要用户点击了任何包含分享特征的按钮，立即获取推文上下文
if (typeof document !== 'undefined' && !(document as any).__xfShareCaptureAttached) {
  ;(document as any).__xfShareCaptureAttached = true
  document.addEventListener(
    'click',
    (ev) => {
      const target = ev.target as HTMLElement | null
      if (!target) return
      const btn = target.closest('button')
      if (!btn) return
      const ariaLabel = btn.getAttribute('aria-label') || ''
      const testId = btn.getAttribute('data-testid') || ''
      const isShare = testId === 'sharePost' || /share|分享/i.test(ariaLabel)
      if (isShare) {
        const tweet = btn.closest<HTMLElement>('article[data-testid="tweet"]')
        if (tweet) {
          lastActiveTweetContext = extractTweetInfoFromDom(tweet)
        } else if (window.location.pathname.includes('/status/')) {
          const mainTweet = document.querySelector<HTMLElement>('article[data-testid="tweet"]')
          if (mainTweet) {
            lastActiveTweetContext = extractTweetInfoFromDom(mainTweet)
          }
        }
      }
    },
    true,
  )
}

function findShareButton(tweet: HTMLElement): HTMLElement | null {
  // 1. 优先通过 data-testid 或 aria-label 查找
  const directBtn = tweet.querySelector<HTMLElement>(
    'button[data-testid="sharePost"], button[aria-label*="Share"], button[aria-label*="分享"]',
  )
  if (directBtn) return directBtn

  // 2. 从操作按钮组中查找最后一个按钮
  const group = tweet.querySelector('div[role="group"]')
  if (group) {
    const buttons = Array.from(group.querySelectorAll<HTMLElement>('button'))
    if (buttons.length > 0) {
      return buttons[buttons.length - 1]
    }
  }

  // 3. 从书签按钮结构回溯
  const bookmark = tweet.querySelector('button[data-testid="bookmark"], button[data-testid="removeBookmark"]')
  if (bookmark) {
    const parent = bookmark.parentElement
    const ancestor = parent?.parentElement
    const candidate = ancestor?.lastElementChild as HTMLElement | null
    if (candidate && candidate !== bookmark) return candidate
  }

  return null
}

export const addMediaDownloadButtons = () => {
  const tweets = document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]')

  tweets.forEach((tweet) => {
    const shareBtn = findShareButton(tweet)
    if (!shareBtn || shareBtn.dataset.xfShareEnhanced === '1') return

    shareBtn.dataset.xfShareEnhanced = '1'
    shareBtn.addEventListener(
      'click',
      () => {
        lastActiveTweetContext = extractTweetInfoFromDom(tweet)

        // 等待下拉菜单 Dropdown 渲染
        setTimeout(() => {
          void waitForElement("div[data-testid='Dropdown']", 3000).then((dropdown) => {
            if (!dropdown) return
            injectMediaDownloadOptions(dropdown, lastActiveTweetContext)
          })
        }, 30)
      },
      true,
    )
  })
}

function injectMediaDownloadOptions(dropdown: Element, info: DomTweetInfo | null) {
  // 如果当前上下文缺失，尝试从页面主推文兜底
  if (!info && window.location.pathname.includes('/status/')) {
    const mainTweet = document.querySelector<HTMLElement>('article[data-testid="tweet"]')
    if (mainTweet) info = extractTweetInfoFromDom(mainTweet)
  }
  if (!info) return

  const hasPhotos = Array.isArray(info.photos) && info.photos.length > 0
  if (!info.hasVideo && !info.hasGif && !hasPhotos) return

  // 防御性去重
  if (dropdown.querySelector('.xf-media-download-option')) return

  const options = dropdown.querySelectorAll("div[role='menuitem']")
  if (!options.length) return
  const template = options[options.length - 1]

  // 根据界面已有文本探测语言
  const dropdownText = dropdown.textContent || ''
  const isZh = /复制|分享|发送|收藏/i.test(dropdownText)

  // 1. 如果有视频
  if (info.hasVideo) {
    createDownloadOption({
      id: 'xf-download-video-btn',
      dropdown,
      template,
      label: isZh ? '下载视频 (MP4)' : 'Download video (MP4)',
      onClick: async (btnTextEl) => {
        btnTextEl.innerText = isZh ? '正在解析视频...' : 'Resolving video...'
        try {
          const res = await browser.runtime.sendMessage({
            type: 'XF_GET_TWEET_MEDIA',
            tweetId: info!.tweetId,
          })
          const videoItem = res?.media?.videos?.[0]
          const mp4Url = videoItem?.bestMp4Url
          if (!mp4Url) {
            btnTextEl.innerText = isZh ? '未获取到视频直链' : 'Video URL not found'
            return
          }
          btnTextEl.innerText = isZh ? '正在下载...' : 'Downloading...'
          const filename = `x_${info!.authorHandle || 'video'}_${info!.tweetId || Date.now()}.mp4`
          await browser.runtime.sendMessage({
            type: 'XF_DOWNLOAD_MEDIA',
            url: mp4Url,
            filename,
          })
          btnTextEl.innerText = isZh ? '已开始下载' : 'Download started'
        } catch {
          btnTextEl.innerText = isZh ? '下载失败' : 'Download failed'
        }
      },
    })
  }

  // 2. 如果有 GIF
  if (info.hasGif) {
    createDownloadOption({
      id: 'xf-download-gif-btn',
      dropdown,
      template,
      label: isZh ? '下载 GIF (MP4)' : 'Download GIF (MP4)',
      onClick: async (btnTextEl) => {
        btnTextEl.innerText = isZh ? '正在解析 GIF...' : 'Resolving GIF...'
        try {
          const res = await browser.runtime.sendMessage({
            type: 'XF_GET_TWEET_MEDIA',
            tweetId: info!.tweetId,
          })
          const gifItem = res?.media?.gifs?.[0] || res?.media?.videos?.[0]
          const mp4Url = gifItem?.bestMp4Url
          if (!mp4Url) {
            btnTextEl.innerText = isZh ? '未获取到动图源' : 'GIF URL not found'
            return
          }
          btnTextEl.innerText = isZh ? '正在下载...' : 'Downloading...'
          const filename = `x_${info!.authorHandle || 'gif'}_${info!.tweetId || Date.now()}.mp4`
          await browser.runtime.sendMessage({
            type: 'XF_DOWNLOAD_MEDIA',
            url: mp4Url,
            filename,
          })
          btnTextEl.innerText = isZh ? '已开始下载' : 'Download started'
        } catch {
          btnTextEl.innerText = isZh ? '下载失败' : 'Download failed'
        }
      },
    })
  }

  // 3. 如果有图片
  if (hasPhotos) {
    const count = info.photos.length
    const label =
      count > 1
        ? isZh
          ? `下载全部图片 (${count}张)`
          : `Download all images (${count})`
        : isZh
          ? '下载图片'
          : 'Download image'

    createDownloadOption({
      id: 'xf-download-photo-btn',
      dropdown,
      template,
      label,
      onClick: async (btnTextEl) => {
        btnTextEl.innerText = isZh ? '正在下载...' : 'Downloading...'
        try {
          for (let i = 0; i < info!.photos.length; i++) {
            const photo = info!.photos[i]
            const ext = photo.origUrl.includes('format=png') ? 'png' : 'jpg'
            const suffix = count > 1 ? `_${i + 1}` : ''
            const filename = `x_${info!.authorHandle || 'photo'}_${info!.tweetId || Date.now()}${suffix}.${ext}`
            await browser.runtime.sendMessage({
              type: 'XF_DOWNLOAD_MEDIA',
              url: photo.origUrl,
              filename,
            })
          }
          btnTextEl.innerText = isZh ? '已开始下载' : 'Download started'
        } catch {
          btnTextEl.innerText = isZh ? '下载失败' : 'Download failed'
        }
      },
    })
  }
}

function createDownloadOption(params: {
  id: string
  dropdown: Element
  template: Element
  label: string
  onClick: (textEl: HTMLElement) => Promise<void>
}) {
  const { id, dropdown, template, label, onClick } = params
  if (dropdown.querySelector(`#${id}`)) return

  const option = template.cloneNode(true) as HTMLElement
  option.id = id
  option.classList.add('xf-media-download-option')
  option.innerHTML = ''
  option.style.cursor = 'pointer'

  const iconContainer = document.createElement('div')
  iconContainer.style.display = 'inline-flex'
  iconContainer.style.alignItems = 'center'
  iconContainer.style.marginRight = '12px'
  iconContainer.style.flexShrink = '0'
  iconContainer.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 16L7 11H10V4H14V11H17L12 16Z" fill="currentColor"/><path d="M4 18H20V20H4V18Z" fill="currentColor"/></svg>`
  option.appendChild(iconContainer)

  const textEl = document.createElement('div')
  textEl.innerText = label
  textEl.style.flexGrow = '1'
  textEl.style.overflow = 'hidden'
  textEl.style.textOverflow = 'ellipsis'
  textEl.style.whiteSpace = 'nowrap'
  option.appendChild(textEl)

  option.addEventListener('click', (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    void onClick(textEl)
  })

  dropdown.appendChild(option)
}
