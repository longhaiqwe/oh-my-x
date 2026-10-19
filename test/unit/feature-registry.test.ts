import { describe, expect, it } from 'vitest'
import {
  FEATURES,
  FEATURE_MODULES,
  GLOBAL_STORAGE_KEYS,
  UNLISTED_STORAGE_KEYS,
  featureText,
  getFeature,
  getFeaturesByModule,
  moduleText,
  resolvePopupModule,
} from '../../shared/feature-registry'
import { zhCN } from '../../shared/i18n/zh-CN'
import { allSettingsKeys } from '../../storage-keys'
import { STATIC_NAV_ITEMS } from '../../shared/staticNavIcons'

describe('feature registry', () => {
  it('按文章顺序定义五个模块', () => {
    expect(FEATURE_MODULES.map((m) => m.id)).toEqual(['layout', 'filter', 'insight', 'create', 'engage'])
    expect(FEATURE_MODULES.map((m) => moduleText(m.id, 'tab'))).toEqual(['界面', '过滤', '数据', '创作', '互动'])
    expect(FEATURE_MODULES.map((m) => moduleText(m.id, 'tab', 'en'))).toEqual(['Layout', 'Filter', 'Insights', 'Create', 'Engage'])
  })

  it('功能 id 不重复，且都属于已定义的模块', () => {
    const ids = FEATURES.map((f) => f.id)
    expect(new Set(ids).size).toBe(ids.length)
    const moduleIds = new Set(FEATURE_MODULES.map((m) => m.id))
    for (const f of FEATURES) expect(moduleIds.has(f.module)).toBe(true)
  })

  it('每个模块至少有一个功能', () => {
    for (const m of FEATURE_MODULES) expect(getFeaturesByModule(m.id).length).toBeGreaterThan(0)
  })

  it('中英文的名称和说明都不为空', () => {
    for (const locale of ['zh-CN', 'en'] as const) {
      for (const m of FEATURE_MODULES) {
        for (const field of ['tab', 'title', 'description'] as const) {
          const text = moduleText(m.id, field, locale)
          expect(text.trim(), `${m.id}.${field}`).not.toBe('')
          expect(text, `${m.id}.${field}`).not.toBe(`module.${m.id}.${field}`)
        }
      }
      for (const f of FEATURES) {
        expect(featureText(f.id, 'label', locale)?.trim(), `${f.id}.label`).toBeTruthy()
        expect(featureText(f.id, 'description', locale)?.trim(), `${f.id}.description`).toBeTruthy()
      }
    }
  })

  it('文案表里的 module.* / feature.* 条目都对应已有的模块和功能', () => {
    const moduleIds = new Set(FEATURE_MODULES.map((m) => m.id as string))
    const featureIds = new Set(FEATURES.map((f) => f.id))
    for (const key of Object.keys(zhCN)) {
      const [scope, id] = key.split('.')
      if (scope === 'module') expect(moduleIds.has(id), key).toBe(true)
      if (scope === 'feature') expect(featureIds.has(id), key).toBe(true)
    }
  })

  it('每个存储项只归属一个功能', () => {
    const owners = new Map<string, string[]>()
    for (const f of FEATURES) {
      for (const key of f.storageKeys) owners.set(key, [...(owners.get(key) ?? []), f.id])
    }
    for (const key of [...GLOBAL_STORAGE_KEYS, ...UNLISTED_STORAGE_KEYS]) {
      owners.set(key, [...(owners.get(key) ?? []), '(global/unlisted)'])
    }
    const duplicated = [...owners].filter(([, ids]) => ids.length > 1)
    expect(duplicated).toEqual([])
  })

  it('所有设置项都有归属', () => {
    const owned = new Set([
      ...FEATURES.flatMap((f) => f.storageKeys),
      ...GLOBAL_STORAGE_KEYS,
      ...UNLISTED_STORAGE_KEYS,
    ])
    const orphans = allSettingsKeys.filter((key) => !owned.has(key))
    expect(orphans).toEqual([])
  })

  it('弹窗里的导航按钮都归在「导航栏按钮」功能下', () => {
    const navKeys = new Set(getFeature('navigationButtons').storageKeys)
    for (const item of STATIC_NAV_ITEMS) expect(navKeys.has(item.storageKey)).toBe(true)
  })

  it('从属功能指向同一模块里已有的主功能', () => {
    for (const f of FEATURES.filter((item) => item.parent)) {
      const parent = getFeature(f.parent!)
      expect(parent.module).toBe(f.module)
      expect(parent.parent).toBeUndefined()
    }
  })

  it('getFeature 遇到未知 id 时报错', () => {
    expect(() => getFeature('nope')).toThrow('Unknown feature: nope')
  })
})

describe('resolvePopupModule', () => {
  it('新模块 id 原样返回', () => {
    expect(resolvePopupModule('create')).toBe('create')
  })

  it('旧标签 id 映射到对应模块', () => {
    expect(resolvePopupModule('view')).toBe('layout')
    expect(resolvePopupModule('overview')).toBe('insight')
    expect(resolvePopupModule('viral')).toBe('insight')
    for (const legacy of ['rules', 'keywords', 'lists', 'log']) {
      expect(resolvePopupModule(legacy)).toBe('filter')
    }
  })

  it('无法识别的值返回 null', () => {
    expect(resolvePopupModule(undefined)).toBeNull()
    expect(resolvePopupModule('')).toBeNull()
    expect(resolvePopupModule('unknown')).toBeNull()
    expect(resolvePopupModule(3)).toBeNull()
  })
})
