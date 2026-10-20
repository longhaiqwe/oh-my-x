import { describe, expect, it } from 'vitest'
import {
  KeyNavigationButtonsLabels,
  KeySpamThreshold,
  KeyRadarWidth,
  KeyQuickListNavPosition,
  KeyRepliesSortOrder,
  KeyUserFollowerCount,
  SPAM_RELEVANT_KEYS,
  allSettingsKeys,
  defaultPreferences,
} from '../../storage-keys'
import { normalizeSettings } from '../../shared/settings'

describe('SPAM_RELEVANT_KEYS', () => {
  it('includes threshold changes so visible debug bars are recalculated', () => {
    expect(SPAM_RELEVANT_KEYS.has(KeySpamThreshold)).toBe(true)
  })
})

describe('storage defaults', () => {
  it('has a default value for every declared setting key and no extra defaults', () => {
    const settingKeys = new Set<string>(allSettingsKeys)
    const defaultKeys = Object.keys(defaultPreferences)

    expect(defaultKeys.sort()).toEqual([...settingKeys].sort())
  })

  it('uses valid primitive values for every default setting', () => {
    for (const [key, value] of Object.entries(defaultPreferences)) {
      if (key === KeyNavigationButtonsLabels) {
        expect(['never', 'hover', 'always']).toContain(value)
      } else if (key === KeyRadarWidth) {
        expect(['off', 'wide', 'full']).toContain(value)
      } else if (key === KeyQuickListNavPosition) {
        expect(['top', 'sidebar']).toContain(value)
      } else if (key === KeyRepliesSortOrder) {
        expect(['default', 'newest', 'oldest']).toContain(value)
      } else if (key === 'tweetFilterAction') {
        expect(['collapse', 'hide']).toContain(value)
      } else if (key === 'viralHighlightStyle') {
        expect(['border', 'background', 'both', 'none']).toContain(value)
      } else if (key === 'viralShowLevels') {
        expect(String(value).split(',')).toEqual(['potential', 'viral'])
      } else if (key === KeyUserFollowerCount) {
        expect(['all', 'list', 'off']).toContain(value)
      } else if (key === 'uiLanguage') {
        expect(['auto', 'zh-CN', 'en']).toContain(value)
      } else if (key === 'spamAiAutoScope') {
        expect(['own', 'all', 'off']).toContain(value)
      } else if (
        typeof value === 'string' &&
        key !== 'spamKeywordList' &&
        key !== 'spamWhitelist' &&
        key !== 'spamBlacklist' &&
        key !== 'spamRulesEnabled' &&
        key !== 'statRatioTargetHandle' &&
        key !== 'tweetFilterKeywords' &&
        key !== 'aiRepostBaseUrl' &&
        key !== 'aiRepostApiKey' &&
        key !== 'aiRepostModel' &&
        key !== 'aiRepostCustomPrompt' &&
        key !== 'aiRepostStylePrompt' &&
        key !== 'aiRepostStyleSamples' &&
        key !== 'spamAiModel'
      ) {
        expect(['on', 'off']).toContain(value)
      } else {
        expect(['string', 'number', 'boolean']).toContain(typeof value)
      }
    }
  })

  it('normalizes invalid or legacy values back to typed defaults', () => {
    const settings = normalizeSettings({
      extensionStatus: true,
      timelineWidth: '900',
      navigationButtonsLabels: 'invalid',
      spamThreshold: 'bad',
    })

    expect(settings.extensionStatus).toBe('on')
    // 900 超出 [600,800] 滑块范围，被 clamp 到 800
    expect(settings.timelineWidth).toBe(800)
    expect(settings.navigationButtonsLabels).toBe(defaultPreferences.navigationButtonsLabels)
    expect(settings.spamThreshold).toBe(defaultPreferences.spamThreshold)
  })
})
