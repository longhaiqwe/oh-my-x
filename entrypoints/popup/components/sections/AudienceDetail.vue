<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import {
  KeyAudienceEnabled,
  KeyAudienceRevision,
} from '../../../../storage-keys'
import { audienceRequest } from '../../../../shared/audience-client'
import {
  AUDIENCE_LABELS,
  type AudienceMeta,
  type AudienceSnapshot,
} from '../../../../shared/audience'
import {
  openAudiencePanel,
  closeAudiencePanel,
} from '../../../../shared/audience-panel'
import { useI18n } from '../../composables/useI18n'
import FeatureSwitch from '../ui/FeatureSwitch.vue'
const { t, locale } = useI18n()
const records = ref<AudienceMeta[]>([]),
  error = ref(''),
  busy = ref(false),
  loading = ref(true),
  confirmation = ref<{ account: string; key?: string } | null>(null),
  dialog = ref<HTMLDialogElement | null>(null)
let alive = true,
  serial = 0
async function refresh() {
  const token = ++serial
  try {
    const data = await audienceRequest<AudienceMeta[]>('list')
    if (alive && token === serial) {
      records.value = data.sort((a, b) => b.updatedAt - a.updatedAt)
      error.value = ''
    }
  } catch {
    if (alive && token === serial) error.value = t('audience.failure')
  } finally {
    if (alive && token === serial) loading.value = false
  }
}
async function view(record: AudienceMeta) {
  busy.value = true
  try {
    const s = await audienceRequest<AudienceSnapshot | null>('read', {
      key: record.key,
    })
    if (s && alive) openAudiencePanel(s, { saved: true })
  } catch {
    error.value = t('audience.failure')
  } finally {
    busy.value = false
  }
}
function confirm(account: string, key?: string) {
  confirmation.value = { account, key }
  dialog.value?.showModal()
}
function cancelClear() {
  dialog.value?.close()
  confirmation.value = null
}
async function clear() {
  if (!confirmation.value) return
  busy.value = true
  try {
    await audienceRequest('clear', confirmation.value)
    dialog.value?.close()
    confirmation.value = null
    await refresh()
  } catch {
    error.value = t('audience.failure')
  } finally {
    busy.value = false
  }
}
function changed(changes: Record<string, unknown>, area: string) {
  if (area === 'local' && KeyAudienceRevision in changes) void refresh()
}
onMounted(() => {
  void refresh()
  browser.storage.onChanged.addListener(changed)
})
onBeforeUnmount(() => {
  alive = false
  serial++
  closeAudiencePanel()
  browser.storage.onChanged.removeListener(changed)
})
</script>
<template>
  <div class="flex flex-col gap-4">
    <div class="rounded-card border border-border bg-card-bg p-4">
      <div class="flex items-center justify-between gap-4">
        <span class="text-sm font-semibold">{{ t('audience.record') }}</span
        ><FeatureSwitch
          :storage-key="KeyAudienceEnabled"
          :label="t('audience.record')"
        />
      </div>
      <p class="text-xs text-secondary-text mt-2 leading-normal">
        {{ t('audience.local') }}
      </p>
      <p class="text-xs text-secondary-text mt-2 leading-normal">
        {{ t('audience.emptyHint') }}
      </p>
    </div>
    <h3 class="text-sm font-semibold">{{ t('audience.saved') }}</h3>
    <p v-if="loading" role="status" class="text-xs text-secondary-text">
      {{ t('audience.loading') }}
    </p>
    <p v-else-if="!records.length" class="text-sm text-secondary-text">
      {{ t('audience.empty') }}
    </p>
    <div
      v-for="account in [...new Set(records.map((r) => r.account))]"
      :key="account"
      class="rounded-card border border-border bg-card-bg p-4 flex flex-col gap-3"
    >
      <p class="text-xs text-secondary-text">
        {{ t('audience.owner', { account }) }}
      </p>
      <div
        v-for="record in records.filter((r) => r.account === account)"
        :key="record.key"
        class="border-t border-border pt-3"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <span class="text-sm font-semibold"
            >@{{ record.handle }} ·
            {{
              t(
                AUDIENCE_LABELS[record.kind],
              )
            }}</span
          ><span class="text-xs text-secondary-text">{{
            t('audience.results', { count: record.count })
          }}</span>
        </div>
        <p class="text-xs text-secondary-text mt-1">
          {{ new Date(record.updatedAt).toLocaleString(locale) }}
        </p>
        <div class="flex gap-3 mt-2">
          <button
            :disabled="busy"
            class="audience-setting-button text-accent-text"
            @click="view(record)"
          >
            {{ t('audience.view') }}</button
          ><button
            :disabled="busy"
            class="audience-setting-button text-secondary-text"
            @click="confirm(account, record.key)"
          >
            {{ t('audience.clear') }}
          </button>
        </div>
      </div>
      <button
        :disabled="busy"
        class="audience-setting-button self-start text-secondary-text"
        @click="confirm(account)"
      >
        {{ t('audience.clearAccount') }}
      </button>
    </div>
    <p class="text-xs text-secondary-text leading-normal">
      {{ t('audience.limitHint') }}
    </p>
    <p v-if="error" role="alert" class="text-xs text-secondary-text">
      {{ error }}
      <button class="audience-setting-button" @click="refresh">
        {{ t('audience.retry') }}
      </button>
    </p>
    <dialog
      ref="dialog"
      class="rounded-card bg-card-bg text-text border border-border p-5 max-w-xs"
      @cancel="confirmation = null"
    >
      <p class="text-sm mb-4">{{ t('audience.clearConfirm') }}</p>
      <div class="flex gap-4">
        <button
          :disabled="busy"
          class="audience-setting-button"
          @click="cancelClear"
        >
          {{ t('audience.cancel') }}</button
        ><button
          :disabled="busy"
          class="audience-setting-button text-accent-text"
          @click="clear"
        >
          {{ t('audience.confirm') }}
        </button>
      </div>
    </dialog>
  </div>
</template>
<style scoped>
.audience-setting-button {
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  min-height: 32px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-control);
  padding: 4px 8px;
  cursor: pointer;
}
.audience-setting-button:hover:not(:disabled) {
  background: var(--color-sunken-bg);
}
.audience-setting-button:disabled {
  opacity: 0.5;
  cursor: default;
}
.audience-setting-button:focus-visible {
  outline: 2px solid var(--color-accent-ring);
  outline-offset: 2px;
}
dialog::backdrop {
  background: #0008;
}
</style>
