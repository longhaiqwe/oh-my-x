import { describe, it, expect } from 'vitest'
import {
  KeyViralShowLevels,
  KeyViralShowNormalBadge,
  KeyViralEnableHighlight,
  KeyViralPotentialThreshold,
  KeyViralViralThreshold,
  KeyTimelineWidth,
  KeyNavigationWidth,
  KeySpamThreshold,
  KeyRadarWidth,
  defaultPreferences,
} from '../../storage-keys'
import { parseViralShowLevels, normalizeSettings } from '../../shared/settings'

describe('parseViralShowLevels', () => {
  it('parses explicit level list from the new key', () => {
    const levels = parseViralShowLevels({ [KeyViralShowLevels]: 'normal,potential,viral' })
    expect(levels).toEqual({ normal: true, potential: true, viral: true })
  })

  it('parses a single level', () => {
    const levels = parseViralShowLevels({ [KeyViralShowLevels]: 'normal' })
    expect(levels).toEqual({ normal: true, potential: false, viral: false })
  })

  // 回归：用户清空全部级别后会保存空串，此前空串被当作「缺失」回退旧配置，
  // 导致 UI 显示全关、内容页仍展示标签。
  it('treats a present-but-empty new key as an explicit empty set (all false)', () => {
    const levels = parseViralShowLevels({ [KeyViralShowLevels]: '' })
    expect(levels).toEqual({ normal: false, potential: false, viral: false })
  })

  it('falls back to legacy keys only when the new key is truly absent', () => {
    const migrated = parseViralShowLevels({
      [KeyViralShowNormalBadge]: 'on',
      [KeyViralEnableHighlight]: 'on',
    })
    expect(migrated).toEqual({ normal: true, potential: true, viral: true })

    const disabled = parseViralShowLevels({
      [KeyViralShowNormalBadge]: 'off',
      [KeyViralEnableHighlight]: 'off',
    })
    expect(disabled).toEqual({ normal: false, potential: false, viral: false })
  })

  it('does not read legacy keys once the new key exists (even if empty)', () => {
    // 新键存在且为空，应忽略旧键、返回全 false，而不是被旧键重新启用
    const levels = parseViralShowLevels({
      [KeyViralShowLevels]: '',
      [KeyViralShowNormalBadge]: 'on',
      [KeyViralEnableHighlight]: 'on',
    })
    expect(levels).toEqual({ normal: false, potential: false, viral: false })
  })
})

describe('normalizeSettings numeric constraints', () => {
  it('clamps timelineWidth to the slider range [600, 800]', () => {
    expect(normalizeSettings({ [KeyTimelineWidth]: 900 })[KeyTimelineWidth]).toBe(800)
    expect(normalizeSettings({ [KeyTimelineWidth]: 500 })[KeyTimelineWidth]).toBe(600)
    expect(normalizeSettings({ [KeyTimelineWidth]: 700 })[KeyTimelineWidth]).toBe(700)
  })

  it('clamps navigationWidth to the slider range [200, 275], default 275 (X original)', () => {
    expect(normalizeSettings({})[KeyNavigationWidth]).toBe(275)
    expect(normalizeSettings({ [KeyNavigationWidth]: 150 })[KeyNavigationWidth]).toBe(200)
    expect(normalizeSettings({ [KeyNavigationWidth]: 400 })[KeyNavigationWidth]).toBe(275)
    expect(normalizeSettings({ [KeyNavigationWidth]: 225 })[KeyNavigationWidth]).toBe(225)
    expect(normalizeSettings({ [KeyNavigationWidth]: 'bad' })[KeyNavigationWidth]).toBe(275)
  })

  it('clamps spamThreshold to the popup slider range [20, 150]', () => {
    expect(normalizeSettings({ [KeySpamThreshold]: 200 })[KeySpamThreshold]).toBe(150)
    expect(normalizeSettings({ [KeySpamThreshold]: 120 })[KeySpamThreshold]).toBe(120)
    expect(normalizeSettings({ [KeySpamThreshold]: -10 })[KeySpamThreshold]).toBe(20)
  })

  it('clamps viral thresholds to [0, 50000] without tripping the cross-field guard', () => {
    // potential 下限：-5 → 0（viral 用默认 10000，0 < 10000 不触发跨字段回退）
    expect(normalizeSettings({ [KeyViralPotentialThreshold]: -5 })[KeyViralPotentialThreshold]).toBe(0)
    // viral 上限：999999 → 50000（potential 用默认 1000，1000 < 50000 不触发跨字段回退）
    expect(normalizeSettings({ [KeyViralViralThreshold]: 999999 })[KeyViralViralThreshold]).toBe(50000)
  })

  it('falls back when numeric value is non-finite', () => {
    expect(normalizeSettings({ [KeyTimelineWidth]: 'bad' })[KeyTimelineWidth]).toBe(
      defaultPreferences[KeyTimelineWidth],
    )
  })

  it('resets both thresholds when potential >= viral (illegal combination)', () => {
    const settings = normalizeSettings({
      [KeyViralPotentialThreshold]: 10000,
      [KeyViralViralThreshold]: 5000,
    })
    expect(settings[KeyViralPotentialThreshold]).toBe(defaultPreferences[KeyViralPotentialThreshold])
    expect(settings[KeyViralViralThreshold]).toBe(defaultPreferences[KeyViralViralThreshold])
  })

  it('keeps a legal potential < viral pair untouched', () => {
    const settings = normalizeSettings({
      [KeyViralPotentialThreshold]: 2000,
      [KeyViralViralThreshold]: 8000,
    })
    expect(settings[KeyViralPotentialThreshold]).toBe(2000)
    expect(settings[KeyViralViralThreshold]).toBe(8000)
  })

  it('normalizes KeyRadarWidth correctly', () => {
    expect(normalizeSettings({ [KeyRadarWidth]: 'off' })[KeyRadarWidth]).toBe('off')
    expect(normalizeSettings({ [KeyRadarWidth]: 'wide' })[KeyRadarWidth]).toBe('wide')
    expect(normalizeSettings({ [KeyRadarWidth]: 'full' })[KeyRadarWidth]).toBe('full')
    expect(normalizeSettings({ [KeyRadarWidth]: 'invalid_mode' })[KeyRadarWidth]).toBe(
      defaultPreferences[KeyRadarWidth],
    )
  })
})
