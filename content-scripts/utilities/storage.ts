import { defaultPreferences } from '../../storage-keys'
import type { SettingKey } from '../../storage-keys'
import { normalizeSettings, type ExtensionSettings } from '../../shared/settings'

export async function getStorage(key: string): Promise<string | number | boolean | undefined>
export async function getStorage(keys: string[]): Promise<Record<string, string | number | boolean | undefined>>
export async function getStorage(storageKeyOrKeys: string | string[]) {
  if (Array.isArray(storageKeyOrKeys)) {
    return getMultipleStorageKeys(storageKeyOrKeys)
  }
  return getSingleStorageKey(storageKeyOrKeys)
}

async function getSingleStorageKey(key: string) {
  if (!browser?.runtime?.id) {
    return defaultPreferences[key as SettingKey]
  }
  try {
    const data = await browser.storage.local.get(key)
    return (data[key] ?? defaultPreferences[key as SettingKey]) as string | number | boolean | undefined
  } catch {
    return defaultPreferences[key as SettingKey]
  }
}

async function getMultipleStorageKeys(keysArray: string[]) {
  const empty = {} as Record<string, string | number | boolean | undefined>
  if (!browser?.runtime?.id) {
    return keysArray.reduce<Record<string, string | number | boolean | undefined>>((acc, key) => {
      acc[key] = defaultPreferences[key as SettingKey]
      return acc
    }, empty)
  }
  try {
    const data = await browser.storage.local.get(keysArray)
    return keysArray.reduce<Record<string, string | number | boolean | undefined>>((acc, key) => {
      acc[key] = (data[key] ?? defaultPreferences[key as SettingKey]) as string | number | boolean | undefined
      return acc
    }, empty)
  } catch {
    return keysArray.reduce<Record<string, string | number | boolean | undefined>>((acc, key) => {
      acc[key] = defaultPreferences[key as SettingKey]
      return acc
    }, empty)
  }
}

export async function setStorage(kv: Record<string, unknown>): Promise<boolean> {
  // 返回布尔结果，让关键写入方有能力感知失败（配额超限 / 扩展上下文失效等），
  // 调用方可选择回滚或提示；非关键后台写入仍可忽略返回值。
  // 扩展上下文失效时 browser 可能未定义，try/catch 兜住并返回 false。
  try {
    // 保护性清洗：消除 Vue 响应式 Proxy 与原型链属性引发的 DataCloneError
    let sanitized = kv
    try {
      sanitized = JSON.parse(JSON.stringify(kv))
    } catch {}
    await browser.storage.local.set(sanitized)
    return true
  } catch {
    return false
  }
}

export async function getSettings(): Promise<ExtensionSettings> {
  const data = await getStorage(Object.keys(defaultPreferences))
  return normalizeSettings(data)
}
