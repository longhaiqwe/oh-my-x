import type { SpamRuleId } from '../../shared/spam-types'
import type { SpamAiAutoScope } from '../../shared/settings'

/** AI 打分的配置；关闭时为 null */
export interface SpamAiConfig {
  autoScope: SpamAiAutoScope
  threshold: number
}

export interface SpamConfig {
  threshold: number
  debug: boolean
  keywords: string[]
  /** 预计算的 normalizeForSpam(keyword) 结果，与 keywords 按索引一一对应 */
  normalizedKeywords: string[]
  enabledRules: Set<SpamRuleId>
  whitelist: Set<string>
  blacklist: Set<string>
  ai: SpamAiConfig | null
}
