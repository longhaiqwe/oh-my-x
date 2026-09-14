import {
  KeySpamBlacklist,
  KeySpamDebugMode,
  KeySpamFilterEnabled,
  KeySpamKeywordList,
  KeySpamRulesEnabled,
  KeySpamThreshold,
  KeySpamWhitelist,
} from '../../storage-keys'
import { normalizeForSpam, parseEnabledRules, parseHandleList, parseKeywordList } from '../../shared/spam-rules'
import { migrateSpamStorage } from '../../shared/spam-migration'
import type { SpamRuleId } from '../../shared/spam-types'
import { getStorage } from '../utilities/storage'
import type { SpamConfig } from './types'

function handleSet(raw: string | undefined | null): Set<string> {
  return new Set(parseHandleList(raw))
}

let migrationChecked = false

async function loadConfig(): Promise<SpamConfig | null> {
  if (!migrationChecked) {
    migrationChecked = true
    await migrateSpamStorage()
  }

  const values = await getStorage([
    KeySpamFilterEnabled,
    KeySpamThreshold,
    KeySpamDebugMode,
    KeySpamKeywordList,
    KeySpamRulesEnabled,
    KeySpamWhitelist,
    KeySpamBlacklist,
  ])

  if (values[KeySpamFilterEnabled] !== 'on') return null

  const keywords = parseKeywordList(String(values[KeySpamKeywordList] ?? ''))

  return {
    threshold: Number(values[KeySpamThreshold]) || 55,
    debug: values[KeySpamDebugMode] === 'on',
    keywords,
    // 一次性预计算所有关键词的 normalized 形式（6 次正则替换 / 关键词），
    // 避免 spam-rules.ts 中 checkMarketingKeyword / checkMarketingNickname
    // 对每条推文的每个关键词重复调用 normalizeForSpam。
    normalizedKeywords: keywords.map((kw) => normalizeForSpam(kw)),
    enabledRules: parseEnabledRules(String(values[KeySpamRulesEnabled] ?? '')) as Set<SpamRuleId>,
    whitelist: handleSet(String(values[KeySpamWhitelist] ?? '')),
    blacklist: handleSet(String(values[KeySpamBlacklist] ?? '')),
  }
}

let cachedConfig: SpamConfig | null = null
let cachedAt = 0
const CONFIG_TTL = 5_000

export async function getSpamConfig(): Promise<SpamConfig | null> {
  if (cachedConfig && Date.now() - cachedAt < CONFIG_TTL) return cachedConfig
  cachedConfig = await loadConfig()
  cachedAt = Date.now()
  return cachedConfig
}

export function invalidateSpamConfigCache() {
  cachedConfig = null
  cachedAt = 0
}
