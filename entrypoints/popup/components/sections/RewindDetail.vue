<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  KeyRewindEnabled,
  KeyRewindNav,
  KeyRewindOcr,
} from '../../../../storage-keys'
import { useI18n } from '../../composables/useI18n'
import { useRewind } from '../../composables/useRewind'
import FeatureCard from '../ui/FeatureCard.vue'
import SwitchToggle from '../ui/SwitchToggle.vue'
import GroupLabel from '../ui/GroupLabel.vue'
const { t } = useI18n()
const {
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
} = useRewind()
const confirm = ref<HTMLDialogElement | null>(null)
const phase = computed(() => status.value?.ocrState?.phase)
async function clearConfirmed() {
  await clear()
  confirm.value?.close()
}
</script>
<template>
  <div :inert="busy" class="flex flex-col gap-4">
    <FeatureCard
      :title="t('rewind.record')"
      :description="t('rewind.recordDescription')"
    >
      <template #control
        ><SwitchToggle
          :model-value="enabled"
          :label="t('rewind.record')"
          @update:model-value="(v) => set(KeyRewindEnabled, v)"
      /></template>
      <div
        class="flex items-start justify-between gap-4 border-t border-border pt-4"
      >
        <div>
          <p class="text-sm font-semibold text-text">{{ t('rewind.nav') }}</p>
          <p class="text-xs text-secondary-text mt-1">
            {{ t('rewind.navDescription') }}
          </p>
        </div>
        <SwitchToggle
          :model-value="nav"
          :label="t('rewind.nav')"
          @update:model-value="(v) => set(KeyRewindNav, v)"
        />
      </div>
      <p class="text-xs text-muted-text">{{ t('rewind.pauseNote') }}</p>
      <button
        class="self-start min-h-8 text-xs font-semibold text-accent-text rounded-control px-2 border border-border-strong outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        @click="open"
      >
        {{ t('rewind.open') }}
      </button>
    </FeatureCard>
    <FeatureCard
      :title="t('rewind.ocr')"
      :description="t('rewind.ocrDescription')"
    >
      <template #control
        ><SwitchToggle
          :model-value="ocr"
          :label="t('rewind.ocr')"
          @update:model-value="(v) => set(KeyRewindOcr, v)"
      /></template>
      <p class="text-xs text-muted-text leading-normal">
        {{ t('rewind.ocrNote') }}
      </p>
      <p v-if="ocr" class="text-xs text-secondary-text" role="status">
        {{
          t(
            phase === 'error'
              ? 'rewind.ocrError'
              : phase === 'download'
                ? 'rewind.ocrDownload'
                : phase === 'working'
                  ? 'rewind.ocrWorking'
                  : 'rewind.ocrReady',
            { count: status?.ocrState?.left ?? 0 },
          )
        }}
        <span
          v-if="
            phase === 'download' &&
            typeof status?.ocrState?.progress === 'number'
          "
          >{{ Math.round(status.ocrState.progress * 100) }}%</span
        >
      </p>
      <button
        v-if="ocr && phase === 'error'"
        class="self-start text-xs text-accent-text min-h-8 px-2 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        @click="retryOcr"
      >
        {{ t('rewind.retry') }}
      </button>
    </FeatureCard>
    <GroupLabel>{{ t('rewind.data') }}</GroupLabel>
    <div class="p-4 bg-card-bg rounded-card flex flex-col gap-3">
      <p v-if="status" class="text-sm font-semibold text-text">
        {{ t('rewind.count', { count: status.count }) }}
        <span class="font-normal text-muted-text">{{
          status.handle ? '@' + status.handle : ''
        }}</span>
      </p>
      <p class="text-xs text-secondary-text leading-normal">
        {{ t('rewind.capacity') }}
      </p>
      <button
        :disabled="!status || status.count === 0"
        class="self-start min-h-8 text-xs text-danger rounded-control px-2 outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:opacity-50"
        @click="confirm?.showModal()"
      >
        {{ t('rewind.clear') }}
      </button>
    </div>
    <p v-if="error" class="text-xs text-danger leading-normal" role="status">
      {{ error }}
      <button
        class="text-accent-text min-h-8 px-2 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        @click="refresh"
      >
        {{ t('rewind.retry') }}
      </button>
    </p>
    <p class="text-xs text-muted-text">
      <kbd>Alt + Shift + R</kbd> · {{ t('rewind.shortcut') }}
    </p>
  </div>
  <dialog
    ref="confirm"
    class="m-auto max-w-sm w-full p-6 bg-card-bg text-text border border-border-strong rounded-card"
    :aria-label="t('rewind.clearTitle')"
  >
    <h3 class="text-base font-semibold">{{ t('rewind.clearTitle') }}</h3>
    <p class="text-sm text-secondary-text mt-3 leading-normal">
      {{ t('rewind.clearNote', { count: status?.count ?? 0 }) }}
    </p>
    <div class="flex justify-end gap-4 mt-4">
      <button
        autofocus
        class="min-h-8 px-2 text-sm rounded-control outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        @click="confirm?.close()"
      >
        {{ t('rewind.cancel') }}
      </button>
      <button
        :disabled="busy"
        class="min-h-8 px-2 text-sm text-danger rounded-control outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
        @click="clearConfirmed"
      >
        {{ t('rewind.confirmClear') }}
      </button>
    </div>
  </dialog>
</template>
