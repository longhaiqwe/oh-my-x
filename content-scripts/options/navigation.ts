import type { NavIconId } from '../../shared/navItems'
import selectors from '../selectors'
import addStyles, { removeStyles } from '../utilities/addStyles'
import { getNavIconSvg } from '../utilities/navIcons'
import { addSidebarButton } from '../utilities/sidebar'

function changeSidebarSetting(sidebarSelector: string, state: string | number | boolean, onAdd?: () => void) {
  const sel = (selectors.sidebarLinks as Record<string, string>)[sidebarSelector]
  if (!sel) return

  if (state === 'off') {
    addStyles(sidebarSelector, `${sel} { display: none; }`)
  } else {
    removeStyles(sidebarSelector)
    onAdd?.()
  }
}

export const changeHomeButton = () => {}
export const changeExploreButton = (state: string | number | boolean) => changeSidebarSetting('explore', state)
export const changeNotificationsButton = (state: string | number | boolean) => changeSidebarSetting('notifications', state)
export const changeMessagesButton = (state: string | number | boolean) => changeSidebarSetting('messages', state)
export const changeBookmarksButton = (state: string | number | boolean) => changeSidebarSetting('bookmarks', state)
export const changeJobsButton = (state: string | number | boolean) => changeSidebarSetting('jobs', state)
export const changeArticlesButton = (state: string | number | boolean) => changeSidebarSetting('articles', state)
export const changeVerifiedOrgsButton = (state: string | number | boolean) => changeSidebarSetting('verifiedOrgs', state)
export const changeProfileButton = (state: string | number | boolean) => changeSidebarSetting('profile', state)
export const changeCreatorStudioButton = (state: string | number | boolean) => changeSidebarSetting('creatorStudio', state)
export const changeMoreMenuButton = (state: string | number | boolean) => changeSidebarSetting('moreMenu', state)
export const changeXPremiumButton = (state: string | number | boolean) => changeSidebarSetting('xPremium', state, addXPremiumButton)
export const changeGrokButton = (state: string | number | boolean) => changeSidebarSetting('grok', state)
export const changeTopicsButton = (state: string | number | boolean) => changeSidebarSetting('topics', state, addTopicsButton)
export const changeCommunitiesButton = (state: string | number | boolean) => changeSidebarSetting('communities', state, addCommunitiesButton)
export const changeListsButton = (state: string | number | boolean) => changeSidebarSetting('lists', state, addListsButton)

function addSidebarButtonFromPage(name: string, id: NavIconId, options: { href?: string; userHref?: string }) {
  const svgAsset = getNavIconSvg(id)
  if (!svgAsset) return

  addSidebarButton({ name, svgAsset, ...options })
}

let tm1: ReturnType<typeof setTimeout>
export function addXPremiumButton() {
  clearTimeout(tm1)
  tm1 = setTimeout(() => {
    addSidebarButtonFromPage('Premium', 'xPremium', { href: '/settings/premium' })
  }, 100)
}

export function addTopicsButton() {
  addSidebarButtonFromPage('Topics', 'topics', { userHref: '/topics' })
}

export function addCommunitiesButton() {
  addSidebarButtonFromPage('Communities', 'communities', { userHref: '/communities' })
}

export function addListsButton() {
  addSidebarButtonFromPage('Lists', 'lists', { userHref: '/lists' })
}

const TWEET_BUTTON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 36 36"><path fill="currentColor" d="M35.77 8.16a2.43 2.43 0 0 0-1.9-2L28 4.87a4.5 4.5 0 0 0-3.65.79L7 18.3l-4.86-.2a1.86 1.86 0 0 0-1.23 3.31l5 3.93c.6.73 1 .59 10.93-4.82l.93 9.42a1.36 1.36 0 0 0 .85 1.18a1.4 1.4 0 0 0 .54.1a1.54 1.54 0 0 0 1-.41l2.39-2.18a1.52 1.52 0 0 0 .46-.83l2.19-11.9c3.57-2 6.95-3.88 9.36-5.25a2.43 2.43 0 0 0 1.21-2.49m-2.2.75c-2.5 1.42-6 3.41-9.76 5.47l-.41.23l-2.33 12.67l-1.47 1.34l-1.1-11.3l-1.33.68C10 22 7.61 23.16 6.79 23.52l-4.3-3.41l5.08.22l18-13.06a2.5 2.5 0 0 1 2-.45l5.85 1.26a.43.43 0 0 1 .35.37a.42.42 0 0 1-.2.46" class="clr-i-outline clr-i-outline-path-1"/><path fill="currentColor" d="m7 12.54l3.56 1l1.64-1.19l-4-1.16l1.8-1.1l5.47-.16l2.3-1.67L10 8.5a1.25 1.25 0 0 0-.7.17L6.67 10.2A1.28 1.28 0 0 0 7 12.54" class="clr-i-outline clr-i-outline-path-2"/><path fill="none" d="M0 0h36v36H0z"/></svg>`

export function removeCustomTweetButton() {
  document.querySelectorAll('.xf-custom-tweet-button').forEach(el => el.remove())
  document.querySelectorAll('.xf-tweet-button-icon').forEach(el => el.remove())
}

export function ensureCustomTweetButton() {
  document.querySelectorAll('.xf-tweet-button-icon').forEach(el => el.remove())

  const nativeBtn = document.querySelector(selectors.tweetButton) as HTMLElement | null
  if (!nativeBtn || !nativeBtn.parentNode) return
  if (document.querySelector('.xf-custom-tweet-button')) return

  const customBtn = document.createElement('a')
  customBtn.className = 'xf-custom-tweet-button'
  customBtn.setAttribute('role', 'button')
  customBtn.setAttribute('aria-label', nativeBtn.getAttribute('aria-label') || '发帖')
  customBtn.href = nativeBtn.getAttribute('href') || '/compose/post'
  customBtn.innerHTML = TWEET_BUTTON_SVG
  customBtn.addEventListener('click', (e) => {
    e.preventDefault()
    const currentNativeBtn = document.querySelector(selectors.tweetButton) as HTMLElement | null
    if (currentNativeBtn) {
      currentNativeBtn.click()
    }
  })
  nativeBtn.parentNode.insertBefore(customBtn, nativeBtn.nextSibling)
}

let lastNavigationLabelsCacheKey: string | null = null

export const changeNavigationButtonsLabels = (setting: string | number | boolean) => {
  if (setting === 'always') {
    removeCustomTweetButton()
  } else {
    ensureCustomTweetButton()
  }

  const cacheKey = `${String(setting)}|${window.location.pathname}`
  if (cacheKey === lastNavigationLabelsCacheKey) return
  lastNavigationLabelsCacheKey = cacheKey

  removeStyles('customDMsAndSearchStyle')

  const tweetBtn = selectors.tweetButton

  if (setting === 'never') {
    removeStyles('alwaysLabels')
    addStyles(
      'removeLabels',
      `${selectors.leftSidebarLinks} > *:not([data-testid="SideNav_NewTweet_Button"]):not(.xf-custom-tweet-button) > div > div + div:last-child { display: none; }
      ${selectors.accountSwitcherLabel} { display: none; }
      header[role="banner"] > div { width: 88px; }
      header[role="banner"] > div > div > div { width: 88px; }
      ${tweetBtn} { display: none !important; }
      .xf-custom-tweet-button {
        width: 49px !important;
        height: 49px !important;
        min-width: 49px !important;
        min-height: 49px !important;
        max-height: 49px !important;
        border-radius: 50% !important;
        padding: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        margin: 0 !important;
        background-color: var(--body-bg-color) !important;
        color: var(--main-text-color) !important;
        cursor: pointer !important;
        box-shadow: none !important;
        transition: background-color 0.2s ease !important;
      }
      .xf-custom-tweet-button svg {
        width: 26px !important;
        height: 26px !important;
        fill: var(--main-text-color) !important;
        color: var(--main-text-color) !important;
      }
      html[style*="background-color: rgb(0, 0, 0)"] .xf-custom-tweet-button,
      html[style*="background-color: rgb(21, 32, 43)"] .xf-custom-tweet-button,
      body[style*="background-color: rgb(0, 0, 0)"] .xf-custom-tweet-button,
      body[style*="background-color: rgb(21, 32, 43)"] .xf-custom-tweet-button {
        background-color: var(--main-text-color) !important;
        color: var(--body-bg-color) !important;
      }
      html[style*="background-color: rgb(0, 0, 0)"] .xf-custom-tweet-button svg,
      html[style*="background-color: rgb(21, 32, 43)"] .xf-custom-tweet-button svg,
      body[style*="background-color: rgb(0, 0, 0)"] .xf-custom-tweet-button svg,
      body[style*="background-color: rgb(21, 32, 43)"] .xf-custom-tweet-button svg {
        fill: var(--body-bg-color) !important;
        color: var(--body-bg-color) !important;
      }`
    )
    removeStyles('showLabelsOnHover')
    removeStyles('hideLabels')
  } else if (setting === 'always') {
    removeStyles('hideLabels')
    removeStyles('removeLabels')
    removeStyles('showLabelsOnHover')
    addStyles(
      'alwaysLabels',
      `${tweetBtn} div,
      ${tweetBtn} span {
        opacity: 1 !important;
        height: auto !important;
      }`
    )
  } else if (setting === 'hover') {
    removeStyles('alwaysLabels')
    removeStyles('removeLabels')
    addStyles(
      'hideLabels',
      `${selectors.leftSidebarLabel},
      ${selectors.accountSwitcherLabel} { display: inline-block; opacity: 0; transition: 0.4s cubic-bezier(0.2, 0.8, 0.2, 1); }
      ${tweetBtn} { display: none !important; }
      .xf-custom-tweet-button {
        width: 49px !important;
        height: 49px !important;
        min-width: 49px !important;
        min-height: 49px !important;
        max-height: 49px !important;
        border-radius: 50% !important;
        padding: 0 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        margin: 0 !important;
        background-color: var(--body-bg-color) !important;
        color: var(--main-text-color) !important;
        cursor: pointer !important;
        box-shadow: none !important;
        transition: background-color 0.2s ease !important;
      }
      .xf-custom-tweet-button svg {
        width: 26px !important;
        height: 26px !important;
        fill: var(--main-text-color) !important;
        color: var(--main-text-color) !important;
      }
      html[style*="background-color: rgb(0, 0, 0)"] .xf-custom-tweet-button,
      html[style*="background-color: rgb(21, 32, 43)"] .xf-custom-tweet-button,
      body[style*="background-color: rgb(0, 0, 0)"] .xf-custom-tweet-button,
      body[style*="background-color: rgb(21, 32, 43)"] .xf-custom-tweet-button {
        background-color: var(--main-text-color) !important;
        color: var(--body-bg-color) !important;
      }
      html[style*="background-color: rgb(0, 0, 0)"] .xf-custom-tweet-button svg,
      html[style*="background-color: rgb(21, 32, 43)"] .xf-custom-tweet-button svg,
      body[style*="background-color: rgb(0, 0, 0)"] .xf-custom-tweet-button svg,
      body[style*="background-color: rgb(21, 32, 43)"] .xf-custom-tweet-button svg {
        fill: var(--body-bg-color) !important;
        color: var(--body-bg-color) !important;
      }`
    )
    addStyles(
      'showLabelsOnHover',
      `${selectors.leftSidebarLabel_hover},
      ${selectors.accountSwitcherLabel_hover} { opacity: 1; }
      header[role="banner"] > div,
      header[role="banner"] > div > div > div { width: 275px !important; }
      header[role="banner"] nav[role="navigation"]:hover ${tweetBtn},
      header[role="banner"]:hover ${tweetBtn} {
        display: flex !important;
      }
      header[role="banner"] nav[role="navigation"]:hover ${tweetBtn} div,
      header[role="banner"]:hover ${tweetBtn} div,
      header[role="banner"] nav[role="navigation"]:hover ${tweetBtn} span,
      header[role="banner"]:hover ${tweetBtn} span {
        opacity: 1 !important;
        height: auto !important;
      }
      header[role="banner"] nav[role="navigation"]:hover .xf-custom-tweet-button,
      header[role="banner"]:hover .xf-custom-tweet-button {
        display: none !important;
      }`
    )
  }
}
