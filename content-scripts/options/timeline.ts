import selectors from '../selectors'
import addStyles, { removeStyles } from '../utilities/addStyles'
import waitForElement from '../utilities/waitForElement'

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
  // 账号分析页（/i/account_analytics）不限制主列宽度，先同步 body 标记
  syncAccountAnalyticsPageMarker()
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
      body:not([data-xf-account-analytics]) ${selectors.mainColumn} {
        width: ${width}px !important;
        max-width: ${width}px !important;
        margin-right: ${primaryMarginRight};
      }
      ${sidebarWidth ? `${selectors.leftSidebar} { width: ${sidebarWidth}px !important; }` : ''}
      /* Column shell only — do not force width:100% on arbitrary nested divs
         (bookmarks search uses ~95% width and must keep it). */
      body:not([data-xf-account-analytics]) ${selectors.mainColumn} > div,
      body:not([data-xf-account-analytics]) ${selectors.mainColumn} > div > div {
        max-width: ${width}px !important;
      }
      /* X caps the timeline wrapper at 600px (e.g. .r-1ye8kvj). Override that
         parent + section so the feed fills the custom column width.
         Included selectors:
         - div:has(> section[role="region"]): Standard timeline feed container
         - div.r-13qz1uu.r-1ye8kvj: Timeline wrapper on profile, home, search, bookmarks, and tweet status
         - section[role="region"]: Timeline section itself
      */
      body:not([data-xf-account-analytics]) ${selectors.mainColumn} div:has(> section[role="region"]),
      body:not([data-xf-account-analytics]) ${selectors.mainColumn} div.r-13qz1uu.r-1ye8kvj,
      body:not([data-xf-account-analytics]) ${selectors.mainColumn} section[role="region"] {
        max-width: ${width}px !important;
        width: 100% !important;
      }
    }`
  )
}


export const addMediaDownloadButtons = () => {
  const bookmarkButtons = document.querySelectorAll("button[data-testid='bookmark']")

  bookmarkButtons.forEach((bookmarkButton) => {
    const parent = bookmarkButton.parentElement
    const ancestor = parent?.parentElement
    const sharePostButton = ancestor?.lastElementChild as HTMLElement | null
    if (!sharePostButton || sharePostButton.classList.contains('xf-enhanced-share')) return

    sharePostButton.classList.add('xf-enhanced-share')
    sharePostButton.addEventListener('click', () => {
      const tweet = sharePostButton.closest("article[data-testid='tweet']")
      if (!tweet) return

      const tweetLinkElements = tweet.querySelectorAll("a[href*='/status/']")
      let tweetHref: string | undefined
      let tweetUrl: string | undefined

      for (const link of tweetLinkElements) {
        const href = link.getAttribute('href')
        if (href?.match(/\/([^/]+)\/status\/(\d+)$/)) {
          tweetHref = href
          tweetUrl = (link as HTMLAnchorElement).href
          break
        }
      }

      if (!tweetHref || !tweetUrl) return

      const videoTweetElement = tweet.querySelector("div[data-testid='previewInterstitial']")
      const gifTweetElement = tweet.querySelector("button[aria-label='Play this GIF']")
      const photoTweetElement = tweet.querySelector(`a[href*='${tweetHref}/photo']`)
      const hasPhoto = !!tweetHref.includes('photo') || !!photoTweetElement
      const hasGif = !!gifTweetElement
      let hasVideo = !!videoTweetElement

      if (videoTweetElement?.contains(gifTweetElement)) hasVideo = false
      if (!hasVideo && !hasPhoto && !hasGif) return

      const links = tweet.querySelectorAll("div[role='link']")
      const userName = tweet.querySelector("div[data-testid='User-Name']")
      let quoteTweetLink: Element | undefined

      for (const link of links) {
        if (!userName?.contains(link) && link.getAttribute('data-testid') !== 'tweet-text-show-more-link') {
          quoteTweetLink = link
          break
        }
      }

      if (
        quoteTweetLink &&
        ((quoteTweetLink.contains(videoTweetElement!) || quoteTweetLink.contains(photoTweetElement!) || quoteTweetLink.contains(gifTweetElement!)) &&
          quoteTweetLink.getAttribute('data-testid') !== 'tweet-text-show-more-link')
      )
        return

      // 在下个 tick 执行等待，给 Twitter 本身关闭旧 Dropdown 的机会，避免 querySelector 匹配到残留的旧元素
      setTimeout(() => {
        void waitForElement("div[data-testid='Dropdown']", 3000).then((dropdown) => {
          if (!dropdown) return

          const options = dropdown.querySelectorAll("div[role='menuitem']")
          if (!options.length) return

          const optionToClone = options[options.length - 1]
          if (hasPhoto) addMediaDownloadOption(dropdown, 'image', tweetUrl!, optionToClone)
          if (hasGif) addMediaDownloadOption(dropdown, 'gif', tweetUrl!, optionToClone)
          else if (hasVideo) addMediaDownloadOption(dropdown, 'video', tweetUrl!, optionToClone)
        })
      }, 0)
    })
  })
}

function addMediaDownloadOption(dropdown: Element, downloadType: string, tweetUrl: string, optionToClone: Element) {
  // 防御性去重：确保不重复注入相同类型的下载按钮
  if (dropdown.querySelector(`#xf-${downloadType}-download-button`)) return

  const option = optionToClone.cloneNode(true) as HTMLElement
  option.id = `xf-${downloadType}-download-button`
  option.innerHTML = ''
  option.addEventListener('click', () => {
    window.open(tweetUrl, '_blank')
  })

  const icon = document.createElement('div')
  icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 16L7 11H10V4H14V11H17L12 16Z" fill="currentColor"/><path d="M4 18H20V20H4V18Z" fill="currentColor"/></svg>`
  option.appendChild(icon)

  const text = document.createElement('div')
  text.innerText = `Download ${downloadType}`
  option.appendChild(text)

  dropdown.appendChild(option)
}
