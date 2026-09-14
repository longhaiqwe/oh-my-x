import selectors from '../selectors'
import addStyles, { removeStyles } from '../utilities/addStyles'
import { updateArticleToc, destroyArticleToc } from '../features/article-toc'
import { addScheduledRelativeTimes, removeScheduledPanorama } from './scheduled-time'
import { ensureCustomTweetButton } from './navigation'

export const changeTweetButton = (
  state: string | number | boolean,
  navigationLabels?: string | number | boolean,
) => {
  if (state === 'off' || state === 'hide') {
    addStyles(
      'hideTweetButton',
      `html body ${selectors.tweetButton},
      html body .xf-custom-tweet-button,
      html body header[role="banner"] ${selectors.tweetButton},
      html body header[role="banner"] .xf-custom-tweet-button,
      html body header[role="banner"]:hover ${selectors.tweetButton},
      html body header[role="banner"]:hover .xf-custom-tweet-button,
      html body header[role="banner"] nav[role="navigation"]:hover ${selectors.tweetButton},
      html body header[role="banner"] nav[role="navigation"]:hover .xf-custom-tweet-button {
        display: none !important;
      }`
    )
  } else {
    removeStyles('hideTweetButton')
    const isNeverOrHover =
      navigationLabels === 'never' ||
      navigationLabels === 'hover' ||
      (!navigationLabels && (
        Boolean(document.getElementById('xf-style-removeLabels')) ||
        Boolean(document.getElementById('xf-style-hideLabels'))
      ))
    if (isNeverOrHover) {
      ensureCustomTweetButton()
    }
  }
}

export const changeSidebarColumn = (state: string | number | boolean) => {
  if (state === 'on' || state === 'hide') {
    addStyles(
      'hideSidebarColumn',
      `${selectors.rightSidebar} { display: none !important; }
      @media only screen and (min-width: 988px) {
        body:not([data-xf-account-analytics]) ${selectors.leftSidebar} > div {
          margin-left: 0px !important;
        }
        body:not([data-xf-account-analytics]) ${selectors.mainWrapper} > div:has(${selectors.mainColumn}) {
          width: fit-content !important;
          max-width: 100% !important;
        }
        body:not([data-xf-account-analytics]) ${selectors.mainWrapper} > div:has(${selectors.mainColumn}) > div {
          width: fit-content !important;
          max-width: 100% !important;
        }
        body:not([data-xf-account-analytics]) ${selectors.mainWrapper} > div:has(${selectors.mainColumn}) > div > div {
          width: fit-content !important;
          max-width: 100% !important;
        }
        body:not([data-xf-account-analytics]) ${selectors.mainColumn} {
          margin-right: 0px !important;
        }
      }`
    )
  } else {
    removeStyles('hideSidebarColumn')
  }
}

export const changeArticleToc = (state: string | number | boolean) => {
  if (state === 'off' || state === 'hide') {
    destroyArticleToc()
  } else {
    updateArticleToc(true)
  }
}

export const changeScheduledPanorama = (state: string | number | boolean) => {
  if (state === 'off' || state === 'hide') {
    removeScheduledPanorama()
  } else {
    void addScheduledRelativeTimes('on')
  }
}

export const changeHighlightNonFollowers = (state: string | number | boolean) => {
  const isFollowingPage = /\/following(\/|$)/.test(window.location.pathname)

  if (state === 'off' || !isFollowingPage) {
    if (document.getElementById('xf-style-highlightNonFollowers')) {
      removeStyles('highlightNonFollowers')
    }
    const btns = document.querySelectorAll('.xf-non-follower-btn')
    if (btns.length > 0) {
      btns.forEach((el) => {
        el.classList.remove('xf-non-follower-btn')
      })
    }
    return
  }

  // 通过 CSS :has() 结构性选择器确保即使在 React 重新渲染（例如 hover 触发状态变化、移开鼠标重置 className）
  // 导致 classList 中的 xf-non-follower-btn 被覆盖抹除时，仍能保持红框红字标记不丢失；
  // 同时保留 button.xf-non-follower-btn 保证向后兼容与测试环境正常工作。
  addStyles(
    'highlightNonFollowers',
    `[data-testid="UserCell"]:not(:has([data-testid="userFollowIndicator"])) button[data-testid*="-unfollow"],
    [data-testid="UserCell"]:not(:has([data-testid="userFollowIndicator"])) button[aria-label*="正在关注"],
    [data-testid="UserCell"]:not(:has([data-testid="userFollowIndicator"])) button[aria-label*="Following"],
    button.xf-non-follower-btn {
      border-color: rgb(244, 33, 46) !important;
      background-color: transparent !important;
    }
    [data-testid="UserCell"]:not(:has([data-testid="userFollowIndicator"])) button[data-testid*="-unfollow"] span,
    [data-testid="UserCell"]:not(:has([data-testid="userFollowIndicator"])) button[data-testid*="-unfollow"] div,
    [data-testid="UserCell"]:not(:has([data-testid="userFollowIndicator"])) button[aria-label*="正在关注"] span,
    [data-testid="UserCell"]:not(:has([data-testid="userFollowIndicator"])) button[aria-label*="正在关注"] div,
    [data-testid="UserCell"]:not(:has([data-testid="userFollowIndicator"])) button[aria-label*="Following"] span,
    [data-testid="UserCell"]:not(:has([data-testid="userFollowIndicator"])) button[aria-label*="Following"] div,
    button.xf-non-follower-btn span,
    button.xf-non-follower-btn div {
      color: rgb(244, 33, 46) !important;
    }
    [data-testid="UserCell"]:not(:has([data-testid="userFollowIndicator"])) button[data-testid*="-unfollow"]:hover,
    [data-testid="UserCell"]:not(:has([data-testid="userFollowIndicator"])) button[aria-label*="正在关注"]:hover,
    [data-testid="UserCell"]:not(:has([data-testid="userFollowIndicator"])) button[aria-label*="Following"]:hover,
    button.xf-non-follower-btn:hover {
      background-color: rgba(244, 33, 46, 0.1) !important;
      border-color: rgb(244, 33, 46) !important;
    }`
  )

  const userCells = document.querySelectorAll('[data-testid="UserCell"]')
  userCells.forEach((cell) => {
    const unfollowBtn =
      cell.querySelector('button[data-testid*="-unfollow"]') ||
      cell.querySelector('button[aria-label*="正在关注"]') ||
      cell.querySelector('button[aria-label*="Following"]')

    if (!unfollowBtn) return

    const hasFollowsYouIndicator = !!cell.querySelector('[data-testid="userFollowIndicator"]')
    if (!hasFollowsYouIndicator) {
      unfollowBtn.classList.add('xf-non-follower-btn')
    } else {
      unfollowBtn.classList.remove('xf-non-follower-btn')
    }
  })
}

