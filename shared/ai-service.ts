import {
  KeyAiServiceBaseUrl, KeyAiServiceApiKey, KeyAiServiceModel,
  KeyAiRepostBaseUrl, KeyAiRepostApiKey, KeyAiRepostModel, KeySpamAiModel,
  defaultPreferences,
} from '../storage-keys'

export const AI_SERVICE_KEYS = [KeyAiServiceBaseUrl, KeyAiServiceApiKey, KeyAiServiceModel] as const
export const AI_CONFIG_KEYS = [...AI_SERVICE_KEYS, KeyAiRepostBaseUrl, KeyAiRepostApiKey, KeyAiRepostModel, KeySpamAiModel]
export const MIGRATE_AI_SERVICE = 'XF_MIGRATE_AI_SERVICE'

/** Only missing keys migrate: explicitly cleared values must never revive legacy credentials. */
export function aiServiceMigrationPatch(raw: Record<string, unknown>): Record<string, string> {
  const patch: Record<string, string> = {}
  const legacy = [KeyAiRepostBaseUrl, KeyAiRepostApiKey, KeyAiRepostModel]
  AI_SERVICE_KEYS.forEach((key, i) => {
    if (raw[key] !== undefined) return
    patch[key] = typeof raw[legacy[i]] === 'string' ? raw[legacy[i]] as string : String(defaultPreferences[key])
  })
  // The previous summary model becomes the common default; both features can follow it.
  if (AI_SERVICE_KEYS.every(key => raw[key] === undefined)) patch[KeyAiRepostModel] = ''
  return patch
}

export function resolveAiService(raw: Record<string, unknown>, feature: 'repost' | 'score') {
  const values = { ...raw, ...aiServiceMigrationPatch(raw) }
  const override = String(values[feature === 'repost' ? KeyAiRepostModel : KeySpamAiModel] ?? '').trim()
  return {
    baseUrl: String(values[KeyAiServiceBaseUrl] ?? '').trim(),
    apiKey: String(values[KeyAiServiceApiKey] ?? '').trim(),
    model: override || String(values[KeyAiServiceModel] ?? '').trim(),
  }
}

// Only the background writes migrations. Settings pages wait for this before mounting,
// so an initial migration cannot overwrite a user's first edit in another context.
let migrating: Promise<void> | undefined
export function migrateAiService(): Promise<void> {
  if (!migrating) {
    migrating = (async () => {
      const raw = await browser.storage.local.get(AI_CONFIG_KEYS)
      const patch = aiServiceMigrationPatch(raw)
      if (Object.keys(patch).length) await browser.storage.local.set(patch)
    })().finally(() => { migrating = undefined })
  }
  return migrating
}
