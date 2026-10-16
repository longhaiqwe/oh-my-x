import {
  KeyArticlesButton,
  KeyBookmarksButton,
  KeyCommunitiesButton,
  KeyExploreButton,
  KeyGrokButton,
  KeyHomeButton,
  KeyJobsButton,
  KeyListsButton,
  KeyMessagesButton,
  KeyNotificationsButton,
  KeyCreatorStudioButton,
  KeyChatMoneyButton,
  KeyMoreMenuButton,
  KeyProfileButton,
  KeyTopicsButton,
  KeyVerifiedOrgsButton,
  KeyXPremiumButton,
} from '../storage-keys'

export type NavIconId =
  | 'home'
  | 'explore'
  | 'notifications'
  | 'messages'
  | 'grok'
  | 'xPremium'
  | 'lists'
  | 'bookmarks'
  | 'jobs'
  | 'communities'
  | 'articles'
  | 'topics'
  | 'verifiedOrgs'
  | 'profile'
  | 'creatorStudio'
  | 'chatMoney'
  | 'moreMenu'

export interface NavItemConfig {
  id: NavIconId
  storageKey: string
  label: string
  selector: string
}

export const NAV_ITEMS: NavItemConfig[] = [
  { id: 'explore', storageKey: KeyExploreButton, label: 'Explore', selector: '[data-testid="AppTabBar_Explore_Link"]' },
  { id: 'notifications', storageKey: KeyNotificationsButton, label: 'Notifications', selector: '[data-testid="AppTabBar_Notifications_Link"]' },
  { id: 'messages', storageKey: KeyMessagesButton, label: 'Messages', selector: '[data-testid="AppTabBar_DirectMessage_Link"]' },
  { id: 'grok', storageKey: KeyGrokButton, label: 'Grok', selector: 'a[href*="/i/grok"]' },
  { id: 'xPremium', storageKey: KeyXPremiumButton, label: 'Premium', selector: '[data-testid="premium-signup-tab"], a[href*="premium"]' },
  { id: 'lists', storageKey: KeyListsButton, label: 'Lists', selector: 'a[href*="/lists"][aria-label]' },
  { id: 'bookmarks', storageKey: KeyBookmarksButton, label: 'Bookmarks', selector: 'a[href*="/i/bookmarks"], a[href*="/i/history"], a[href*="/history"]' },
  { id: 'jobs', storageKey: KeyJobsButton, label: 'Jobs', selector: 'a[href*="/jobs"]' },
  { id: 'communities', storageKey: KeyCommunitiesButton, label: 'Communities', selector: 'a[href*="/communities"][aria-label]' },
  { id: 'articles', storageKey: KeyArticlesButton, label: 'Articles', selector: 'a[href="/compose/articles"]' },
  { id: 'topics', storageKey: KeyTopicsButton, label: 'Topics', selector: 'a[href*="/topics"]' },
  { id: 'verifiedOrgs', storageKey: KeyVerifiedOrgsButton, label: 'Verified Orgs', selector: 'a[href*="verified-orgs"]' },
  { id: 'profile', storageKey: KeyProfileButton, label: 'Profile', selector: '[data-testid="AppTabBar_Profile_Link"]' },
  { id: 'creatorStudio', storageKey: KeyCreatorStudioButton, label: 'Creator Studio', selector: 'a[href*="creators/studio"]' },
  { id: 'chatMoney', storageKey: KeyChatMoneyButton, label: 'X Money', selector: 'a[href*="money"], a[href*="chatmoney"]' },
  { id: 'moreMenu', storageKey: KeyMoreMenuButton, label: 'More', selector: '[data-testid="AppTabBar_More_Menu"]' },
]
