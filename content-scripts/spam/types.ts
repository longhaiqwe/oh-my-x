import type { SpamRuleId } from '../../shared/spam-types'

export interface SpamConfig {
  threshold: number
  debug: boolean
  keywords: string[]
  /** 预计算的 normalizeForSpam(keyword) 结果，与 keywords 按索引一一对应 */
  normalizedKeywords: string[]
  enabledRules: Set<SpamRuleId>
  whitelist: Set<string>
  blacklist: Set<string>
}
