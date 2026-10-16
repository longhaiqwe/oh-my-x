import { reactive, onMounted, onBeforeUnmount } from 'vue'
import { getStorage } from '../../../content-scripts/utilities/storage'
import { defaultPreferences } from '../../../storage-keys'
import type { SettingKey } from '../../../storage-keys'

type StorageValue = string | number | boolean | undefined
type StorageChanges = Record<string, { newValue?: unknown }>

/**
 * 读取一组存储项，并在其他组件或页面修改它们时同步更新。
 * 用于状态行这类只读展示：设置在第二层页面里改，第一层的数字随之变化。
 */
export function useStorageSnapshot(keys: readonly string[]) {
  const values = reactive<Record<string, StorageValue>>(
    Object.fromEntries(keys.map((key) => [key, defaultPreferences[key as SettingKey]])),
  )
  const keySet = new Set(keys)
  // 首次读取完成前收到的变化更新，读取结果不再覆盖它们
  const changedDuringLoad = new Set<string>()
  let loaded = false
  let disposed = false

  function onChanged(changes: StorageChanges, area: string) {
    if (area !== 'local') return
    for (const key of Object.keys(changes)) {
      if (!keySet.has(key)) continue
      const next = changes[key]?.newValue as StorageValue
      values[key] = next ?? defaultPreferences[key as SettingKey]
      if (!loaded) changedDuringLoad.add(key)
    }
  }

  onMounted(async () => {
    browser.storage?.onChanged?.addListener(onChanged)
    const data = await getStorage([...keys])
    if (disposed) return
    for (const key of keys) {
      if (!changedDuringLoad.has(key)) values[key] = data[key]
    }
    loaded = true
  })

  onBeforeUnmount(() => {
    disposed = true
    browser.storage?.onChanged?.removeListener(onChanged)
  })

  return values
}
