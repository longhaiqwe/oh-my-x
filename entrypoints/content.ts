import { applyChangedStaticFeatures } from '../content-scripts/features/static'
import { initializeExtension } from '../content-scripts/initialize'
import {
  cleanupAllSpamArtifacts,
  invalidateSpamConfig,
  runScan,
  startSpamObserver,
  stopSpamObserver,
} from '../content-scripts/spam/scanner'
import { runViralRadar, invalidateViralRadarCache } from '../content-scripts/features/viral-radar'
import { dynamicFeatures, invalidateDynamicSettingsCache } from '../content-scripts/features/dynamic'
import constructNewData from '../content-scripts/utilities/constructNewData'
import { getStorage } from '../content-scripts/utilities/storage'
import { XF_BRIDGE_MARKER } from '../shared/bridge'
import { mergeSettings, normalizeSettings, type ExtensionSettings } from '../shared/settings'
import {
  KeyExtensionStatus,
  KeySpamFilterEnabled,
  KeyStatRatioEnabled,
  KeyStatRatioTargetHandle,
  KeyHighlightNonFollowers,
  SPAM_RELEVANT_KEYS,
  VIRAL_RELEVANT_KEYS,
  allSettingsKeys,
  type SettingKey,
} from '../storage-keys'

const SETTING_KEYS = new Set<string>(allSettingsKeys)

// 通知 MAIN world 拦截器当前扩展开关状态（MAIN world 无法访问 browser.storage）
function notifyInterceptorEnabled(enabled: boolean) {
  window.postMessage(
    { type: 'XF_EXTENSION_STATUS', enabled, __xf: XF_BRIDGE_MARKER },
    '*',
  )
}

// 暴露到 window，方便控制台 / popup 触发
;(window as unknown as { xFocusCleanup?: () => number }).xFocusCleanup = () =>
  cleanupAllSpamArtifacts()

export default defineContentScript({
  matches: [
    'https://twitter.com/*',
    'https://mobile.twitter.com/*',
    'https://x.com/*',
    'https://pro.x.com/*',
  ],
  runAt: 'document_end',
  main() {
    let currentSettings: ExtensionSettings | null = null

    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'CLEANUP_SPAM_ARTIFACTS') {
        const remaining = cleanupAllSpamArtifacts()
        sendResponse({ ok: true, remaining })
        return true
      }
    })

    browser.storage.onChanged.addListener(async (changes, area) => {
      if (area !== 'local') return
      const extKey = KeyExtensionStatus
      if (changes[extKey]?.newValue !== changes[extKey]?.oldValue) {
        // reload 前先通知 MAIN world，减少拦截器继续运行的窗口
        notifyInterceptorEnabled(changes[extKey]?.newValue !== 'off')
        window.location.reload()
        return
      }

      const status = await getStorage(extKey)
      if (status === 'off') return

      const changedSettingKeys = Object.keys(changes).filter((key): key is SettingKey =>
        SETTING_KEYS.has(key),
      )
      if (changedSettingKeys.length > 0) {
        const relevantChanges = Object.fromEntries(
          changedSettingKeys.map((key) => [key, changes[key]]),
        )
        const newData = constructNewData(
          relevantChanges as Parameters<typeof constructNewData>[0],
        )
        if (!currentSettings) {
          currentSettings = normalizeSettings(await getStorage([...allSettingsKeys]))
        }
        currentSettings = mergeSettings(currentSettings, newData)
        applyChangedStaticFeatures(currentSettings, changedSettingKeys)
        invalidateDynamicSettingsCache()

        if (
          changedSettingKeys.some(
            (k) =>
              k === KeyStatRatioEnabled ||
              k === KeyStatRatioTargetHandle ||
              k === KeyHighlightNonFollowers,
          )
        ) {
          void dynamicFeatures.general(['tweet'])
        }
      }

      // 任意 spam 相关 key 变化时，刷新扫描
      const spamChanged = Object.keys(changes).some((k) => SPAM_RELEVANT_KEYS.has(k))
      if (spamChanged) {
        invalidateSpamConfig()
        if (changes[KeySpamFilterEnabled]?.newValue === 'off') {
          stopSpamObserver()
          void runScan()
        } else {
          startSpamObserver()
          void runScan() // 立即重扫已有 article，不等 MutationObserver
        }
      }

      // 任意 爆款雷达 相关 key 变化时，立即重扫
      const viralChanged = Object.keys(changes).some((k) => VIRAL_RELEVANT_KEYS.has(k))
      if (viralChanged) {
        invalidateViralRadarCache()
        void runViralRadar(true)
      }
    })

    const init = async () => {
      const status = await getStorage(KeyExtensionStatus)
      const enabled = status !== 'off'
      // 通知 MAIN world：即便扩展关闭也发送，让拦截器停用
      notifyInterceptorEnabled(enabled)
      if (!enabled) return
      await initializeExtension()
      currentSettings = normalizeSettings(await getStorage([...allSettingsKeys]))

      const spamEnabled = (await getStorage(KeySpamFilterEnabled)) === 'on'
      if (spamEnabled) startSpamObserver()
    }

    init()
  },
})
