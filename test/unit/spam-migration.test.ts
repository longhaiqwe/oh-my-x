import { describe, it, expect, beforeEach } from 'vitest'
import {
  migrateSpamStorage,
  mergeDefaultKeywords,
  CURRENT_SPAM_CONFIG_VERSION,
  KEY_SPAM_CONFIG_VERSION,
} from '../../shared/spam-migration'
import {
  defaultSpamKeywords,
  KeySpamKeywordList,
  KeySpamRulesEnabled,
} from '../../storage-keys'
import { parseKeywordList } from '../../shared/spam-rules'

describe('mergeDefaultKeywords (集合合并)', () => {
  it('preserves all user custom keywords and merges new default keywords as a union', () => {
    // 模拟用户的真实本地存储：旧默认词 + 用户自定义词（比她好看的没她骚、比她骚的没她好看、sao）
    const userStoredKeywords = [
      '点击主页',
      '主页见',
      '主页有惊喜',
      '查看主页',
      '个人主页',
      '主页获取',
      '主页领取',
      '私信',
      '私信我',
      '联系我',
      '加我',
      '找我',
      '约会',
      '同城',
      '空降',
      '福利',
      '兼职',
      '固炮',
      '寻固炮',
      '比她好看的没她骚',
      '比她骚的没她好看',
      'sao',
    ]

    const { merged, added } = mergeDefaultKeywords(userStoredKeywords)

    // 1. 用户自定义词 100% 保留
    expect(merged).toContain('比她好看的没她骚')
    expect(merged).toContain('比她骚的没她好看')
    expect(merged).toContain('sao')

    // 2. 官方新词成功补充合并进合集
    expect(merged).toContain('打✈️')
    expect(merged).toContain('打飞机')
    expect(merged).toContain('主页能打')
    expect(merged).toContain('微密圈')
    expect(merged).toContain('反差')
    expect(merged).toContain('玩得开')
    expect(merged).toContain('比她骚')

    // 3. 补充的列表不含用户已有词
    expect(added).not.toContain('比她好看的没她骚')
    expect(added).not.toContain('点击主页')
    expect(added.length).toBeGreaterThan(0)

    // 4. 无重复词（大小写不敏感排重）
    const lowerList = merged.map((w) => w.toLowerCase())
    const uniqueLowerSet = new Set(lowerList)
    expect(lowerList.length).toBe(uniqueLowerSet.size)
  })
})

describe('migrateSpamStorage (自动版本迁移)', () => {
  let mockStorage: Record<string, unknown> = {}

  beforeEach(() => {
    mockStorage = {
      [KEY_SPAM_CONFIG_VERSION]: 2, // 模拟老版本 v2
      [KeySpamKeywordList]: '点击主页\n主页见\n寻固炮\n比她好看的没她骚\n比她骚的没她好看\nsao',
      [KeySpamRulesEnabled]: 'marketing_nickname:on,emoji_ratio:on,short_text:on,random_username:on,marketing_keyword:on,pure_emoji:on,decorated_nickname:on,repeated_chars:on',
    }

    ;(globalThis as any).browser = {
      runtime: { id: 'test-runtime' },
      storage: {
        local: {
          get: async (keys: string[]) => {
            const res: Record<string, unknown> = {}
            for (const k of keys) {
              if (k in mockStorage) res[k] = mockStorage[k]
            }
            return res
          },
          set: async (items: Record<string, unknown>) => {
            Object.assign(mockStorage, items)
          },
        },
      },
    }
  })

  it('automatically upgrades v2 storage to v3: merges keywords and enables mention_referral', async () => {
    const res = await migrateSpamStorage()
    expect(res.migrated).toBe(true)

    // 版本号提升到 v3
    expect(mockStorage[KEY_SPAM_CONFIG_VERSION]).toBe(CURRENT_SPAM_CONFIG_VERSION)

    // 词库合并：包含用户自定义词
    const migratedKeywords = parseKeywordList(String(mockStorage[KeySpamKeywordList]))
    expect(migratedKeywords).toContain('比她好看的没她骚')
    expect(migratedKeywords).toContain('比她骚的没她好看')
    expect(migratedKeywords).toContain('sao')

    // 词库合并：包含新版官方黑词
    expect(migratedKeywords).toContain('打✈️')
    expect(migratedKeywords).toContain('微密圈')
    expect(migratedKeywords).toContain('反差')
    expect(migratedKeywords).toContain('比她骚')
    expect(migratedKeywords).toContain('无偿约')
    expect(migratedKeywords).toContain('选妃')
    expect(migratedKeywords).toContain('sao货')

    // 规则开关：自动启用新增的 mention_referral 规则
    expect(String(mockStorage[KeySpamRulesEnabled])).toContain('mention_referral:on')
  })

  it('does not re-migrate if already at latest version', async () => {
    mockStorage[KEY_SPAM_CONFIG_VERSION] = CURRENT_SPAM_CONFIG_VERSION
    const res = await migrateSpamStorage()
    expect(res.migrated).toBe(false)
  })
})
