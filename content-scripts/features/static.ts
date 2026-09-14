import {
  KeyArticlesButton, KeyBookmarksButton, KeyCommunitiesButton,
  KeyExploreButton, KeyGrokButton,
  KeyJobsButton, KeyListsButton, KeyMessagesButton,
  KeyNavigationButtonsLabels, KeyNotificationsButton,
  KeyCreatorStudioButton, KeyMoreMenuButton, KeyProfileButton,
  KeySidebarColumn,
  KeyTimelineWidth,
  KeyTopicsButton, KeyTweetButton,
  KeyVerifiedOrgsButton, KeyXPremiumButton,
  KeyHighlightNonFollowers,
  KeyArticleToc,
  KeyScheduledPanorama,
} from '../../storage-keys'
import {
  changeTweetButton,
  changeSidebarColumn,
  changeHighlightNonFollowers,
  changeArticleToc,
  changeScheduledPanorama,
} from '../options/interface'
import {
  changeArticlesButton, changeBookmarksButton,
  changeCommunitiesButton, changeExploreButton, changeGrokButton,
  changeJobsButton, changeListsButton,
  changeMessagesButton, changeNavigationButtonsLabels,
  changeCreatorStudioButton, changeMoreMenuButton, changeNotificationsButton, changeProfileButton,
  changeTopicsButton, changeVerifiedOrgsButton,
  changeXPremiumButton,
} from '../options/navigation'
import {
  changeTimelineWidth,
} from '../options/timeline'
import type { ExtensionSettings } from '../../shared/settings'
import type { SettingKey } from '../../storage-keys'

type FeatureData = ExtensionSettings

export const staticFeatures: Record<string, (data: FeatureData) => void> = {
  timeline: (data) => {
    changeTimelineWidth(data[KeyTimelineWidth], data[KeyNavigationButtonsLabels], data[KeySidebarColumn])
    changeTweetButton(data[KeyTweetButton], data[KeyNavigationButtonsLabels])
    changeSidebarColumn(data[KeySidebarColumn])
    changeHighlightNonFollowers(data[KeyHighlightNonFollowers])
    changeArticleToc(data[KeyArticleToc])
    changeScheduledPanorama(data[KeyScheduledPanorama])
  },
  navigation: (data) => {
    changeNavigationButtonsLabels(data[KeyNavigationButtonsLabels])
  },
  sidebar: (data) => {
    changeExploreButton(data[KeyExploreButton])
    changeNotificationsButton(data[KeyNotificationsButton])
    changeMessagesButton(data[KeyMessagesButton])
    changeBookmarksButton(data[KeyBookmarksButton])
    changeJobsButton(data[KeyJobsButton])
    changeArticlesButton(data[KeyArticlesButton])
    changeCommunitiesButton(data[KeyCommunitiesButton])
    changeTopicsButton(data[KeyTopicsButton])
    changeListsButton(data[KeyListsButton])
    changeProfileButton(data[KeyProfileButton])
    changeCreatorStudioButton(data[KeyCreatorStudioButton])
    changeMoreMenuButton(data[KeyMoreMenuButton])
    changeXPremiumButton(data[KeyXPremiumButton])
    changeGrokButton(data[KeyGrokButton])
    changeVerifiedOrgsButton(data[KeyVerifiedOrgsButton])
  },
}

export function applyStaticFeatures(data: FeatureData) {
  Object.values(staticFeatures).forEach((fn) => fn(data))
}

const TIMELINE_KEYS = new Set<SettingKey>([
  KeyTimelineWidth,
  KeyNavigationButtonsLabels,
  KeyTweetButton,
  KeySidebarColumn,
  KeyHighlightNonFollowers,
  KeyArticleToc,
  KeyScheduledPanorama,
])

const NAVIGATION_KEYS = new Set<SettingKey>([KeyNavigationButtonsLabels])

const SIDEBAR_KEYS = new Set<SettingKey>([
  KeyExploreButton,
  KeyNotificationsButton,
  KeyMessagesButton,
  KeyBookmarksButton,
  KeyJobsButton,
  KeyArticlesButton,
  KeyCommunitiesButton,
  KeyTopicsButton,
  KeyListsButton,
  KeyProfileButton,
  KeyCreatorStudioButton,
  KeyMoreMenuButton,
  KeyXPremiumButton,
  KeyGrokButton,
  KeyVerifiedOrgsButton,
])

export function applyChangedStaticFeatures(
  data: FeatureData,
  changedKeys: Iterable<SettingKey>,
) {
  const keys = new Set(changedKeys)
  if ([...keys].some((key) => TIMELINE_KEYS.has(key))) staticFeatures.timeline(data)
  if ([...keys].some((key) => NAVIGATION_KEYS.has(key))) staticFeatures.navigation(data)
  if ([...keys].some((key) => SIDEBAR_KEYS.has(key))) staticFeatures.sidebar(data)
}
