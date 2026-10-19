import selectors from '../selectors'
import addStyles, { removeStyles, stylesExist } from '../utilities/addStyles'
import waitForElement from '../utilities/waitForElement'
import { syncRadarPageMarker } from './radar'
import { extractTweetInfoFromDom, type DomTweetInfo } from '../../shared/tweet-media'
import { t, type MessageKey } from '../../shared/i18n'

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
  const primaryMarginRight = isSidebarHidden ? '0px' : '20px'

  const page = 'body:not([data-xf-account-analytics]):not([data-xf-radar])'
  // 只处理「时间线 + 右侧栏」这种布局；私信、设置等页面没有右侧栏，不改它们的排版。
  // 隐藏右侧栏只是 display:none，元素还在，规则照样生效
  const layoutBox = `${selectors.mainWrapper} > div:has(${selectors.rightSidebar})`
  const column = `${selectors.mainColumn}:has(+ ${selectors.rightSidebar})`

  addStyles(
    'timelineWidth',
    `@media only screen and (min-width: 988px) {
      ${page} ${column} {
        width: ${width}px !important;
        max-width: ${width}px !important;
        margin-right: ${primaryMarginRight};
      }
      /* 时间线和右侧栏优先，左栏只占导航本身的宽度：
         - 去掉 X 在宽屏给导航加的左边距，空间紧张时它不会让出来；
         - 中间区域按内容定宽，左右两边按实际需要分配剩余空间（X 原本是固定宽度的盒子，内容超出就把右侧栏挤出屏幕）；
         - 窗口放不下时时间线自动收窄，最窄 600px。 */
      ${page} ${selectors.leftSidebar}:has(+ ${selectors.mainWrapper} ${selectors.rightSidebar}) > div {
        margin-left: 0px !important;
      }
      ${page} ${selectors.mainWrapper}:has(${selectors.rightSidebar}) {
        min-width: 0px !important;
      }
      ${page} ${layoutBox},
      ${page} ${layoutBox} > div,
      ${page} ${layoutBox} > div > div {
        width: fit-content !important;
        max-width: 100% !important;
      }
      ${page} ${column} {
        flex-shrink: 1 !important;
        min-width: 600px !important;
      }
      /* Column shell only — do not force width:100% on arbitrary nested divs
         (bookmarks search uses ~95% width and must keep it). */
      ${page} ${column} > div,
      ${page} ${column} > div > div {
        max-width: ${width}px !important;
      }
      /* X caps the timeline wrapper at 600px (e.g. .r-1ye8kvj). Override that
         parent + section so the feed fills the custom column width.
         Included selectors:
         - div:has(> section[role="region"]): Standard timeline feed container
         - div.r-13qz1uu.r-1ye8kvj: Timeline wrapper on profile, home, search, bookmarks, and tweet status
         - section[role="region"]: Timeline section itself
      */
      ${page} ${column} div:has(> section[role="region"]),
      ${page} ${column} div.r-13qz1uu.r-1ye8kvj,
      ${page} ${column} section[role="region"] {
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

/** 弹窗「媒体下载」开关；关闭时分享菜单不再加入下载选项 */
let mediaDownloadEnabled = true

export function setMediaDownloadEnabled(enabled: boolean) {
  mediaDownloadEnabled = enabled
}

export const addMediaDownloadButtons = () => {
  if (!mediaDownloadEnabled) return
  const tweets = document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]')

  tweets.forEach((tweet) => {
    const shareBtn = findShareButton(tweet)
    if (!shareBtn || shareBtn.dataset.xfShareEnhanced === '1') return

    shareBtn.dataset.xfShareEnhanced = '1'
    shareBtn.addEventListener(
      'click',
      () => {
        // 监听在开关打开时挂上，点击时再检查一次，关闭后不再插入选项
        if (!mediaDownloadEnabled) return
        lastActiveTweetContext = extractTweetInfoFromDom(tweet)

        // 等待下拉菜单 Dropdown 渲染
        setTimeout(() => {
          void waitForElement("div[data-testid='Dropdown']", 3000).then((dropdown) => {
            if (!dropdown) return
            injectMediaDownloadOptions(dropdown, lastActiveTweetContext)
            // X 自带的「下载视频」可能晚一点才渲染出来，稍后再查一次
            setTimeout(() => removeDuplicateVideoOption(dropdown), 200)
          })
        }, 30)
      },
      true,
    )
  })
}

function injectMediaDownloadOptions(dropdown: Element, info: DomTweetInfo | null) {
  if (!mediaDownloadEnabled) return
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
  // 这些选项插在 X 自己的分享菜单里，跟 X 菜单用同一种语言，不跟插件语言
  const menuText = (key: MessageKey, params?: Record<string, string | number>) => t(key, params, isZh ? 'zh-CN' : 'en')

  // 1. 如果有视频；X 已经自带「下载视频」时（自己发的视频）不再重复加
  if (info.hasVideo && !hasNativeVideoDownload(dropdown)) {
    createDownloadOption({
      id: 'xf-download-video-btn',
      dropdown,
      template,
      label: menuText('mediaPage.downloadVideo'),
      onClick: async (btnTextEl) => {
        btnTextEl.textContent = menuText('mediaPage.resolvingVideo')
        try {
          const res = await browser.runtime.sendMessage({
            type: 'XF_GET_TWEET_MEDIA',
            tweetId: info!.tweetId,
          })
          const videoItem = res?.media?.videos?.[0]
          const mp4Url = videoItem?.bestMp4Url
          if (!mp4Url) {
            btnTextEl.textContent = menuText('mediaPage.videoUrlMissing')
            return
          }
          btnTextEl.textContent = menuText('mediaPage.downloading')
          const filename = `x_${info!.authorHandle || 'video'}_${info!.tweetId || Date.now()}.mp4`
          await browser.runtime.sendMessage({
            type: 'XF_DOWNLOAD_MEDIA',
            url: mp4Url,
            filename,
          })
          btnTextEl.textContent = menuText('mediaPage.started')
        } catch {
          btnTextEl.textContent = menuText('mediaPage.failed')
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
      label: menuText('mediaPage.downloadGif'),
      onClick: async (btnTextEl) => {
        btnTextEl.textContent = menuText('mediaPage.resolvingGif')
        try {
          const res = await browser.runtime.sendMessage({
            type: 'XF_GET_TWEET_MEDIA',
            tweetId: info!.tweetId,
          })
          const gifItem = res?.media?.gifs?.[0] || res?.media?.videos?.[0]
          const mp4Url = gifItem?.bestMp4Url
          if (!mp4Url) {
            btnTextEl.textContent = menuText('mediaPage.gifUrlMissing')
            return
          }
          btnTextEl.textContent = menuText('mediaPage.downloading')
          const filename = `x_${info!.authorHandle || 'gif'}_${info!.tweetId || Date.now()}.mp4`
          await browser.runtime.sendMessage({
            type: 'XF_DOWNLOAD_MEDIA',
            url: mp4Url,
            filename,
          })
          btnTextEl.textContent = menuText('mediaPage.started')
        } catch {
          btnTextEl.textContent = menuText('mediaPage.failed')
        }
      },
    })
  }

  // 3. 如果有图片
  if (hasPhotos) {
    const count = info.photos.length
    const label =
      count > 1
        ? menuText('mediaPage.downloadAllImages', { count })
        : menuText('mediaPage.downloadImage')

    createDownloadOption({
      id: 'xf-download-photo-btn',
      dropdown,
      template,
      label,
      onClick: async (btnTextEl) => {
        btnTextEl.textContent = menuText('mediaPage.downloading')
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
          btnTextEl.textContent = menuText('mediaPage.started')
        } catch {
          btnTextEl.textContent = menuText('mediaPage.failed')
        }
      },
    })
  }
}

// 线条风格的下载图标，线宽和 X 菜单里的其他图标一致；用行内样式，避免被图标上的填充色规则盖掉
const DOWNLOAD_ICON_PATH =
  '<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4 14.5v4A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5v-4" style="fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"></path>'

/** 菜单项里放文字的那一层：图标以外、没有子元素、有文字的第一个元素 */
function findLabelElement(item: Element): HTMLElement | null {
  const walker = document.createTreeWalker(item, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) =>
      node.nodeName.toLowerCase() === 'svg' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const el = node as HTMLElement
    if (el.childElementCount === 0 && el.textContent?.trim()) return el
  }
  return null
}

/**
 * 复制一条 X 原生菜单项，只换图标和文字，字体、间距、图标尺寸都沿用 X 的。
 * 找不到图标或文字（X 改了结构）时返回 null，由调用方退回自建的菜单项。
 */
function cloneNativeMenuItem(template: Element, label: string) {
  const option = template.cloneNode(true) as HTMLElement
  const svg = option.querySelector('svg')
  const textEl = findLabelElement(option)
  if (!svg || !textEl) return null

  svg.removeAttribute('data-icon')
  svg.innerHTML = DOWNLOAD_ICON_PATH
  textEl.textContent = label
  // 去掉从原菜单项带过来的编号、标识和悬停状态
  for (const el of [option, ...Array.from(option.querySelectorAll('*'))]) {
    el.removeAttribute('id')
    el.removeAttribute('data-testid')
    el.removeAttribute('data-highlighted')
  }
  option.style.removeProperty('background-color')
  return { option, textEl }
}

// 复制出来的菜单项没有 X 的悬停处理，用样式补上；--x-hover-subtle 是 X 新版页面的悬停色
function ensureMenuHoverStyle() {
  if (stylesExist('mediaDownloadMenu')) return
  addStyles(
    'mediaDownloadMenu',
    `.xf-media-download-option:hover { background-color: var(--x-hover-subtle, rgba(127, 127, 127, 0.08)) !important; }`,
  )
}

/** X 自带的「下载视频」：只出现在自己发的视频上 */
const NATIVE_VIDEO_DOWNLOAD = /^(下载视频|下載影片|download video)$/i

function hasNativeVideoDownload(dropdown: Element) {
  return Array.from(dropdown.querySelectorAll('[role="menuitem"]:not(.xf-media-download-option)')).some(
    (item) => NATIVE_VIDEO_DOWNLOAD.test((item.textContent ?? '').replace(/\s+/g, ' ').trim()),
  )
}

/** X 自带的「下载视频」比我们晚渲染时，去掉我们那条，菜单里不出现两条下载视频 */
function removeDuplicateVideoOption(dropdown: Element) {
  if (hasNativeVideoDownload(dropdown)) dropdown.querySelector('#xf-download-video-btn')?.remove()
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

  const cloned = cloneNativeMenuItem(template, label)
  const { option, textEl } = cloned ?? buildFallbackMenuItem(template, label)
  option.id = id
  option.classList.add('xf-media-download-option')
  option.style.cursor = 'pointer'
  ensureMenuHoverStyle()

  option.addEventListener('click', (ev) => {
    ev.preventDefault()
    ev.stopPropagation()
    void onClick(textEl)
  })

  dropdown.appendChild(option)
}

/** 退回方案：X 菜单项结构认不出来时，清空后自己拼图标和文字 */
function buildFallbackMenuItem(template: Element, label: string) {
  const option = template.cloneNode(true) as HTMLElement
  option.innerHTML = ''

  const iconContainer = document.createElement('div')
  iconContainer.style.display = 'inline-flex'
  iconContainer.style.alignItems = 'center'
  iconContainer.style.marginRight = '12px'
  iconContainer.style.flexShrink = '0'
  iconContainer.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">${DOWNLOAD_ICON_PATH}</svg>`
  option.appendChild(iconContainer)

  const textEl = document.createElement('div')
  textEl.textContent = label
  textEl.style.flexGrow = '1'
  textEl.style.overflow = 'hidden'
  textEl.style.textOverflow = 'ellipsis'
  textEl.style.whiteSpace = 'nowrap'
  option.appendChild(textEl)

  return { option, textEl }
}
