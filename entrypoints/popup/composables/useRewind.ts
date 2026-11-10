import { ref, onMounted, onBeforeUnmount } from 'vue'
import {
  KeyRewindEnabled,
  KeyRewindNav,
  KeyRewindOcr,
  KeyRewindOcrState,
  KeyRewindRevision,
} from '../../../storage-keys'
import { REWIND_OCR_ORIGINS } from '../../../shared/rewind'
import { rewindRequest, type RewindStatus } from '../../../shared/rewind-client'
import { errorText } from '../../../shared/errors'
import { t } from '../../../shared/i18n'

export function useRewind() {
  const status = ref<RewindStatus | null>(null),
    enabled = ref(false),
    nav = ref(false),
    ocr = ref(false),
    error = ref(''),
    busy = ref(false)
  let alive = true,
    serial = 0
  async function refresh() {
    const token = ++serial
    const settings = await browser.storage.local
      .get([KeyRewindEnabled, KeyRewindNav, KeyRewindOcr])
      .catch(() => null)
    if (!alive || token !== serial) return
    if (settings) {
      enabled.value = settings[KeyRewindEnabled] === 'on'
      nav.value = settings[KeyRewindNav] === 'on'
      ocr.value = settings[KeyRewindOcr] === 'on'
    }
    try {
      const data = await rewindRequest('status')
      if (alive && token === serial) {
        status.value = data
        error.value = ''
      }
    } catch {
      if (alive && token === serial) {
        status.value = null
        error.value = t('rewind.accountMissing')
      }
    }
  }
  async function set(key: string, value: boolean) {
    busy.value = true
    try {
      // Must stay directly in the click call chain, before any asynchronous operation.
      if (
        key === KeyRewindOcr &&
        value &&
        !(await browser.permissions.request({ origins: REWIND_OCR_ORIGINS }))
      ) {
        error.value = t('rewind.permission')
        return
      }
      const update: Record<string, string> = { [key]: value ? 'on' : 'off' }
      if (key === KeyRewindEnabled && value) {
        const s = await browser.storage.local.get(KeyRewindNav)
        if (s[KeyRewindNav] === undefined) update[KeyRewindNav] = 'on'
      }
      await browser.storage.local.set(update)
      await refresh()
    } catch (e) {
      error.value = errorText(e, 'error.dbWriteFailed')
    } finally {
      busy.value = false
    }
  }
  async function open() {
    try {
      await rewindRequest('launch')
    } catch (e) {
      error.value = errorText(e, 'error.cacheUnavailableReload')
    }
  }
  async function clear() {
    if (!status.value) return
    busy.value = true
    try {
      await rewindRequest('clear', { account: status.value.account })
      await refresh()
    } catch (e) {
      error.value = errorText(e, 'error.dbWriteFailed')
    } finally {
      busy.value = false
    }
  }
  async function retryOcr() {
    try {
      await rewindRequest('retryOcr')
      await refresh()
    } catch (e) {
      error.value = errorText(e, 'error.readFailed')
    }
  }
  function changed(changes: Record<string, unknown>, area: string) {
    if (
      area === 'local' &&
      [
        KeyRewindEnabled,
        KeyRewindNav,
        KeyRewindOcr,
        KeyRewindOcrState,
        KeyRewindRevision,
      ].some((k) => k in changes)
    )
      void refresh()
  }
  onMounted(() => {
    void refresh()
    browser.storage.onChanged.addListener(changed)
  })
  onBeforeUnmount(() => {
    alive = false
    serial++
    browser.storage.onChanged.removeListener(changed)
  })
  return {
    status,
    enabled,
    nav,
    ocr,
    error,
    busy,
    refresh,
    set,
    open,
    clear,
    retryOcr,
  }
}
