import {
  defaultSpamKeywords,
  KeySpamKeywordList,
  KeySpamRulesEnabled,
} from '../storage-keys'
import { parseEnabledRules, parseKeywordList, serializeEnabledRules } from './spam-rules'
import { SPAM_RULES } from './spam-types'

export const KEY_SPAM_CONFIG_VERSION = 'spamKeywordsVersion'
export const CURRENT_SPAM_CONFIG_VERSION = 4

export interface MigrationResult {
  migrated: boolean
  addedKeywords: string[]
  addedRules: string[]
}

/**
 * 比较并补充官方默认词库中缺失的新词，同时保留用户自行添加的词
 */
export function mergeDefaultKeywords(existingList: string[]): {
  merged: string[]
  added: string[]
} {
  const existingLowerSet = new Set(existingList.map((w) => w.trim().toLowerCase()))
  const merged = [...existingList]
  const added: string[] = []

  for (const kw of defaultSpamKeywords) {
    if (!kw.trim()) continue
    if (!existingLowerSet.has(kw.trim().toLowerCase())) {
      merged.push(kw)
      existingLowerSet.add(kw.trim().toLowerCase())
      added.push(kw)
    }
  }

  return { merged, added }
}

/**
 * 检查并执行存储数据平滑迁移（在 background、content script 及 popup 中均可触发）
 */
export async function migrateSpamStorage(): Promise<MigrationResult> {
  const b = typeof browser !== 'undefined' ? browser : (globalThis as any).browser
  if (!b?.runtime?.id || !b?.storage?.local) {
    return { migrated: false, addedKeywords: [], addedRules: [] }
  }
  const storage = b.storage.local

  try {
    const data = await storage.get([
      KeySpamKeywordList,
      KeySpamRulesEnabled,
      KEY_SPAM_CONFIG_VERSION,
    ])

    const currentVersion = Number(data[KEY_SPAM_CONFIG_VERSION] ?? 0)
    if (currentVersion >= CURRENT_SPAM_CONFIG_VERSION) {
      return { migrated: false, addedKeywords: [], addedRules: [] }
    }

    const updates: Record<string, unknown> = {
      [KEY_SPAM_CONFIG_VERSION]: CURRENT_SPAM_CONFIG_VERSION,
    }

    let addedKeywords: string[] = []
    const addedRules: string[] = []

    // 1. 词库迁移
    const rawKw = data[KeySpamKeywordList]
    if (rawKw !== undefined && rawKw !== null) {
      const storedStr = String(rawKw).trim()
      // 若用户不是明确清空成空字符串（长度 > 0），则进行增量合并
      if (storedStr.length > 0) {
        const existingList = parseKeywordList(storedStr)
        const result = mergeDefaultKeywords(existingList)
        if (result.added.length > 0) {
          updates[KeySpamKeywordList] = result.merged.join('\n')
          addedKeywords = result.added
        }
      }
    } else {
      // 首次安装无词库记录，填充完整默认词库
      updates[KeySpamKeywordList] = defaultSpamKeywords.join('\n')
      addedKeywords = [...defaultSpamKeywords]
    }

    // 2. 规则迁移（确保新发布的规则如 mention_referral 默认启用）
    const rawRules = data[KeySpamRulesEnabled]
    if (rawRules !== undefined && rawRules !== null) {
      const existingRuleSet = parseEnabledRules(String(rawRules))
      const ruleMap = new Map<string, string>()
      String(rawRules)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((entry) => {
          const [id, val] = entry.split(':')
          if (id) ruleMap.set(id.trim(), val?.trim() || 'on')
        })

      let rulesChanged = false
      for (const rule of SPAM_RULES) {
        if (!ruleMap.has(rule.id)) {
          existingRuleSet.add(rule.id)
          addedRules.push(rule.id)
          rulesChanged = true
        }
      }

      if (rulesChanged) {
        updates[KeySpamRulesEnabled] = serializeEnabledRules(existingRuleSet)
      }
    } else {
      const allRuleSet = new Set(SPAM_RULES.map((r) => r.id))
      updates[KeySpamRulesEnabled] = serializeEnabledRules(allRuleSet)
    }

    await storage.set(updates)
    return { migrated: true, addedKeywords, addedRules }
  } catch (err: any) {
    if (err?.message?.includes('Extension context invalidated')) {
      return { migrated: false, addedKeywords: [], addedRules: [] }
    }
    console.error('[x-focus] migrateSpamStorage error:', err)
    return { migrated: false, addedKeywords: [], addedRules: [] }
  }
}
