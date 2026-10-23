import { afterEach, describe, expect, it, vi } from 'vitest'
import { aiServiceMigrationPatch, migrateAiService, resolveAiService } from '../../shared/ai-service'
import {
  KeyAiRepostApiKey, KeyAiRepostBaseUrl, KeyAiRepostModel, KeySpamAiModel,
  KeyAiServiceBaseUrl, KeyAiServiceApiKey, KeyAiServiceModel, defaultPreferences,
} from '../../storage-keys'

const legacy = {
  [KeyAiRepostBaseUrl]: 'https://old.example/v1',
  [KeyAiRepostApiKey]: 'old-key',
  [KeyAiRepostModel]: 'old-model',
  [KeySpamAiModel]: 'cheap-model',
}
const shared = {
  [KeyAiServiceBaseUrl]: 'https://new.example/v1',
  [KeyAiServiceApiKey]: 'new-key',
  [KeyAiServiceModel]: 'default-model',
}
afterEach(() => vi.unstubAllGlobals())

describe('shared AI service migration', () => {
  it('moves the legacy connection and default model, preserving the scoring override', () => {
    const migrated = { ...legacy, ...aiServiceMigrationPatch(legacy) }
    expect(migrated[KeyAiRepostModel]).toBe('')
    expect(resolveAiService(migrated, 'repost')).toEqual({ baseUrl: 'https://old.example/v1', apiKey: 'old-key', model: 'old-model' })
    expect(resolveAiService(migrated, 'score').model).toBe('cheap-model')
    expect(aiServiceMigrationPatch(migrated)).toEqual({})
  })

  it('keeps both effective models when scoring previously inherited the summary model', () => {
    const raw = { ...legacy, [KeySpamAiModel]: '' }
    expect(resolveAiService(raw, 'repost').model).toBe('old-model')
    expect(resolveAiService(raw, 'score').model).toBe('old-model')
  })

  it('initializes new installs with no key and both features following the default', () => {
    const raw = aiServiceMigrationPatch({})
    expect(resolveAiService(raw, 'repost')).toEqual({ baseUrl: defaultPreferences[KeyAiServiceBaseUrl], apiKey: '', model: defaultPreferences[KeyAiServiceModel] })
    expect(resolveAiService(raw, 'score')).toEqual(resolveAiService(raw, 'repost'))
  })

  it('never overwrites a configured or explicitly cleared shared value', () => {
    const raw = { ...legacy, ...shared, [KeyAiServiceApiKey]: '', [KeyAiServiceModel]: '' }
    expect(aiServiceMigrationPatch(raw)).toEqual({})
    expect(resolveAiService(raw, 'repost').apiKey).toBe('')
    expect(aiServiceMigrationPatch({ ...legacy, [KeyAiServiceApiKey]: '' })).not.toHaveProperty(KeyAiServiceApiKey)
  })

  it('resolves independent overrides and falls back only to the shared default', () => {
    const raw = { ...shared, [KeyAiRepostModel]: 'summary-model', [KeySpamAiModel]: 'fast-model' }
    expect(resolveAiService(raw, 'repost').model).toBe('summary-model')
    expect(resolveAiService(raw, 'score').model).toBe('fast-model')
    expect(resolveAiService({ ...raw, [KeySpamAiModel]: '  ' }, 'score').model).toBe('default-model')
    expect(resolveAiService({ ...raw, [KeyAiRepostModel]: '' }, 'repost').model).toBe('default-model')
  })

  it('serializes startup and page migration, persists once, and can retry failed writes', async () => {
    const stored: Record<string, unknown> = { ...legacy }
    const set = vi.fn(async (patch) => { Object.assign(stored, patch) })
    vi.stubGlobal('browser', { storage: { local: { get: async () => ({ ...stored }), set } } })
    set.mockRejectedValueOnce(new Error('write failed'))
    await expect(migrateAiService()).rejects.toThrow('write failed')
    await Promise.all([migrateAiService(), migrateAiService()])
    expect(set).toHaveBeenCalledTimes(2)
    await migrateAiService()
    expect(set).toHaveBeenCalledTimes(2)
    expect(resolveAiService(stored, 'score').model).toBe('cheap-model')
  })
})
