import type { SpamRuleId } from '../../shared/spam-types'
import type { SpamAiAutoScope } from '../../shared/settings'

/** AI 打分的配置；关闭时为 null */
export interface SpamAiConfig {
  autoScope: SpamAiAutoScope
  threshold: number
  /** 标过「机器人」的账号（小写用户名）：这些账号的回复直接折叠 */
  botAccounts: Set<string>
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
