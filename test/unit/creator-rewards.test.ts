import { describe, it, expect } from 'vitest'
import {
  isCreatorRewardsUrl,
  parseNumberWithUnit,
  formatImpressionsCount,
  parseCreatorRewardsPayload,
  isCreatorRewardsStale,
  TARGET_IMPRESSIONS_COUNT,
  TARGET_IMPRESSIONS_TEXT,
} from '../../shared/creator-rewards'

describe('creator-rewards 单元测试', () => {
  describe('isCreatorRewardsUrl URL 判定', () => {
    it('正确识别官方 Jetfuel 接口与页面 URL', () => {
      expect(
        isCreatorRewardsUrl('https://x.com/i/jfapi/creators/original_content_rewards'),
      ).toBe(true)
      expect(
        isCreatorRewardsUrl('https://x.com/i/jf/creators/original_content_rewards'),
      ).toBe(true)
      expect(
        isCreatorRewardsUrl('https://twitter.com/i/jfapi/creators/original_content_rewards?source=studio'),
      ).toBe(true)
    })

    it('排除无关 URL', () => {
      expect(isCreatorRewardsUrl('https://x.com/home')).toBe(false)
      expect(isCreatorRewardsUrl('https://x.com/i/api/graphql/abc/TweetResult')).toBe(false)
      expect(isCreatorRewardsUrl('')).toBe(false)
    })
  })

  describe('parseNumberWithUnit 数值换算', () => {
    it('正确解析 K、M、万等单位', () => {
      expect(parseNumberWithUnit('217.6K')).toBe(217600)
      expect(parseNumberWithUnit('500k')).toBe(500000)
      expect(parseNumberWithUnit('1.2M')).toBe(1200000)
      expect(parseNumberWithUnit('21.7万')).toBe(217000)
      expect(parseNumberWithUnit('217,600')).toBe(217600)
      expect(parseNumberWithUnit('500000')).toBe(500000)
      expect(parseNumberWithUnit('0')).toBe(0)
    })

    it('对异常或空文本安全容错', () => {
      expect(parseNumberWithUnit('')).toBe(0)
      expect(parseNumberWithUnit('abc')).toBe(0)
    })
  })

  describe('formatImpressionsCount 格式化展示', () => {
    it('按千位或百万位正确格式化', () => {
      expect(formatImpressionsCount(217600)).toBe('217.6K')
      expect(formatImpressionsCount(500000)).toBe('500K')
      expect(formatImpressionsCount(1200000)).toBe('1.2M')
      expect(formatImpressionsCount(350)).toBe('350')
      expect(formatImpressionsCount(0)).toBe('0')
    })
  })

  describe('parseCreatorRewardsPayload 二进制与文本解析', () => {
    it('能够从模拟的文本数据中解析出 217.6K 进度', () => {
      const mockText = `
        稍后再查看
        再完成几个步骤，你就能加入原创内容奖励计划
        过去 90 天内，累积至少 50 万次已验证首页时间线曝光
        [bar] 217.6K
        回复不计入曝光
      `
      const result = parseCreatorRewardsPayload(mockText)
      expect(result).not.toBeNull()
      expect(result?.impressionsText).toBe('217.6K')
      expect(result?.impressionsCount).toBe(217600)
      expect(result?.targetImpressionsCount).toBe(TARGET_IMPRESSIONS_COUNT)
      expect(result?.targetImpressionsText).toBe(TARGET_IMPRESSIONS_TEXT)
      // 217600 / 500000 = 43.52% -> 43.5%
      expect(result?.progressPercent).toBe(43.5)
      expect(result?.requirements.impressionsMet).toBe(false)
      expect(result?.requirements.premium).toBe(true)
    })

    it('支持从 ArrayBuffer 二进制流中解码', () => {
      const text = 'original_content_rewards verified impressions 350.2K target 500K'
      const encoder = new TextEncoder()
      const buffer = encoder.encode(text).buffer

      const result = parseCreatorRewardsPayload(buffer)
      expect(result).not.toBeNull()
      expect(result?.impressionsText).toBe('350.2K')
      expect(result?.impressionsCount).toBe(350200)
      expect(result?.progressPercent).toBe(70)
      expect(result?.requirements.impressionsMet).toBe(false)
    })

    it('当曝光达到或超过目标时正确判定已达成', () => {
      const mockText = 'original_content_rewards 620.5K 500K'
      const result = parseCreatorRewardsPayload(mockText)
      expect(result).not.toBeNull()
      expect(result?.impressionsCount).toBe(620500)
      expect(result?.progressPercent).toBe(100)
      expect(result?.requirements.impressionsMet).toBe(true)
    })

    it('有效排除类似 2m、w-2m 等干扰项，并精准锚定提取 219.6K', () => {
      const realisticMock = `
        <div class="h-2m w-2m p-2m flex-2m">
          <span>稍后再查看</span>
          <p>过去 90 天内，累积至少 50 万次已验证首页时间线曝光</p>
          <div role="progressbar"></div>
          <span>219.6K</span>
          <span>回复不计入曝光</span>
        </div>
      `
      const result = parseCreatorRewardsPayload(realisticMock)
      expect(result).not.toBeNull()
      expect(result?.impressionsText).toBe('219.6K')
      expect(result?.impressionsCount).toBe(219600)
      // 219600 / 500000 = 43.92% -> 43.9%
      expect(result?.progressPercent).toBe(43.9)
      expect(result?.requirements.impressionsMet).toBe(false)
    })

    it('当数据无关或为空时安全返回 null', () => {
      expect(parseCreatorRewardsPayload('')).toBeNull()
      expect(parseCreatorRewardsPayload('unrelated content without metrics')).toBeNull()
    })
  })

  describe('isCreatorRewardsStale 过期判定（每日北京时间 10:30 节点）', () => {
    it('无更新时间戳时判定为过期', () => {
      expect(isCreatorRewardsStale(undefined)).toBe(true)
      expect(isCreatorRewardsStale(null)).toBe(true)
      expect(isCreatorRewardsStale(0)).toBe(true)
    })

    it('当前时间在今天 10:30 之前，若昨天 10:30 后已获取过，则判定为有效（不过期）', () => {
      // 当前时间: 2026-10-15 09:00:00 CST (UTC 2026-10-15 01:00:00)
      const now = Date.UTC(2026, 9, 15, 1, 0, 0)
      // 上次更新: 昨天 2026-10-14 11:30:00 CST (UTC 2026-10-14 03:30:00)
      const lastUpdated = Date.UTC(2026, 9, 14, 3, 30, 0)

      expect(isCreatorRewardsStale(lastUpdated, now)).toBe(false)
    })

    it('当前时间在今天 10:30 之前，若上次更新在昨天 10:30 之前，则判定为过期', () => {
      // 当前时间: 2026-10-15 09:00:00 CST (UTC 2026-10-15 01:00:00)
      const now = Date.UTC(2026, 9, 15, 1, 0, 0)
      // 上次更新: 前天 2026-10-13 14:00:00 CST
      const lastUpdated = Date.UTC(2026, 9, 13, 6, 0, 0)

      expect(isCreatorRewardsStale(lastUpdated, now)).toBe(true)
    })

    it('当前时间在今天 10:30 之后，若今天 10:30 后已拉取，判定为有效（当天不再重复拉取）', () => {
      // 当前时间: 2026-10-15 14:30:00 CST (UTC 2026-10-15 06:30:00)
      const now = Date.UTC(2026, 9, 15, 6, 30, 0)
      // 上次更新: 今天 2026-10-15 10:31:00 CST (UTC 2026-10-15 02:31:00)
      const lastUpdated = Date.UTC(2026, 9, 15, 2, 31, 0)

      expect(isCreatorRewardsStale(lastUpdated, now)).toBe(false)
    })

    it('当前时间在今天 10:30 之后，若上次更新在今天 10:30 之前，判定为过期（触发每日自动刷新）', () => {
      // 当前时间: 2026-10-15 14:30:00 CST (UTC 2026-10-15 06:30:00)
      const now = Date.UTC(2026, 9, 15, 6, 30, 0)
      // 上次更新: 今天 2026-10-15 10:15:00 CST (还没到 10:30 刷新时间点)
      const lastUpdated = Date.UTC(2026, 9, 15, 2, 15, 0)

      expect(isCreatorRewardsStale(lastUpdated, now)).toBe(true)
    })
  })
})
