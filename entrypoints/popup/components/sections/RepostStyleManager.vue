<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { REPOST_PRESETS, type RepostCustomStyle, type RepostPreset } from '../../../../shared/ai-repost-presets'
import { parseStyleSamples } from '../../../../shared/ai-repost'
import { useI18n } from '../../composables/useI18n'

const props = defineProps<{
  styles: RepostCustomStyle[]
  builtinDescription?: string
  builtinSamples?: string
  save: (styles: RepostCustomStyle[]) => Promise<boolean>
}>()
const { t } = useI18n()
const selected = ref('summary')
const draft = ref<RepostCustomStyle | null>(null)
const baseline = ref('')
const busy = ref(false)
const error = ref('')
const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== baseline.value)
const base = computed(() => (draft.value?.base ?? selected.value) as RepostPreset)
const sampleCount = computed(() => parseStyleSamples(draft.value?.samples).length)
const fieldClass = 'w-full px-3 py-2 rounded-control border border-border-strong bg-sunken-bg text-xs text-text outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent-ring'
const buttonClass = 'px-3 py-1.5 rounded-control border border-border-strong text-xs text-text disabled:opacity-50'

function load() {
  const saved = props.styles.find(item => item.id === selected.value)
  draft.value = saved ? { ...saved } : null
  baseline.value = JSON.stringify(draft.value)
  error.value = ''
}
watch(selected, load, { flush: 'sync' })

function create(copy: boolean) {
  const existing = props.styles.find(item => item.id === selected.value)
  const sourceName = existing?.name ?? t(`ai.preset.${base.value}`)
  const next: RepostCustomStyle = {
    id: `custom:${crypto.randomUUID()}`,
    name: copy ? t('ai.styleCopyName', { name: sourceName.slice(0, 65) }) : '',
    base: copy ? base.value : 'summary-short',
    description: copy ? existing?.description ?? props.builtinDescription ?? '' : '',
    samples: copy ? existing?.samples ?? props.builtinSamples ?? '' : '',
  }
  selected.value = next.id
  // 选择变化会先读取已保存项；新建项随后填入独立草稿，保存前不写入风格库。
  draft.value = next
  baseline.value = ''
  error.value = ''
}

async function saveDraft() {
  if (!draft.value || busy.value) return
  if (!draft.value.name.trim()) { error.value = t('ai.styleNameRequired'); return }
  const item = { ...draft.value, name: draft.value.name.trim(), description: draft.value.description.trim(), samples: draft.value.samples.trim() }
  const next = props.styles.filter(style => style.id !== item.id)
  const index = props.styles.findIndex(style => style.id === item.id)
  next.splice(index < 0 ? next.length : index, 0, item)
  busy.value = true
  const ok = await props.save(next)
  busy.value = false
  if (!ok) { error.value = t('ai.saveFailed'); return }
  draft.value = item
  baseline.value = JSON.stringify(item)
  error.value = ''
}

async function remove() {
  if (!draft.value || busy.value) return
  busy.value = true
  const ok = await props.save(props.styles.filter(item => item.id !== selected.value))
  busy.value = false
  if (!ok) { error.value = t('ai.saveFailed'); return }
  selected.value = 'summary'
  load()
}

function cancel() {
  if (!props.styles.some(item => item.id === selected.value)) selected.value = 'summary'
  load()
}
</script>

<template>
  <div class="flex flex-col gap-3 pt-3 border-t border-border">
    <div class="flex flex-col gap-1">
      <label for="ai-style-library" class="text-sm font-semibold text-text">{{ t('ai.styleManager') }}</label>
      <p class="text-xs text-muted-text">{{ t('ai.styleManagerHint') }}</p>
    </div>
    <select id="ai-style-library" v-model="selected" :class="fieldClass" :disabled="dirty || busy">
      <optgroup :label="t('ai.builtinStyles')">
        <option v-for="preset in REPOST_PRESETS" :key="preset" :value="preset">{{ t(`ai.preset.${preset}`) }}</option>
      </optgroup>
      <optgroup v-if="styles.length || (draft && !styles.some(item => item.id === selected))" :label="t('ai.customStyles')">
        <option v-for="item in styles" :key="item.id" :value="item.id">{{ item.name }}</option>
        <option v-if="draft && !styles.some(item => item.id === selected)" :value="selected">{{ t('ai.newStyle') }}</option>
      </optgroup>
    </select>
    <div class="flex flex-wrap gap-2">
      <button type="button" :class="buttonClass" :disabled="dirty || busy" data-action="style-add" @click="create(false)">{{ t('ai.newStyle') }}</button>
      <button type="button" :class="buttonClass" :disabled="dirty || busy" data-action="style-copy" @click="create(true)">{{ t('ai.copyStyle') }}</button>
      <button v-if="draft && styles.some(item => item.id === selected)" type="button" :class="buttonClass" :disabled="dirty || busy" data-action="style-delete" @click="remove">{{ t('ai.deleteStyle') }}</button>
    </div>
    <p v-if="!draft" class="text-xs text-muted-text">{{ t(`ai.presetHint.${base}`) }} {{ t('ai.builtinReadOnly') }}</p>
    <fieldset v-else :disabled="busy" class="flex flex-col gap-3 min-w-0">
      <div class="flex flex-col gap-1">
        <label for="ai-style-name" class="text-xs font-semibold text-secondary-text">{{ t('ai.styleName') }}</label>
        <input id="ai-style-name" v-model="draft.name" :class="fieldClass" maxlength="80" />
      </div>
      <div class="flex flex-col gap-1">
        <label for="ai-style-base" class="text-xs font-semibold text-secondary-text">{{ t('ai.styleBase') }}</label>
        <select id="ai-style-base" v-model="draft.base" :class="fieldClass">
          <option v-for="preset in REPOST_PRESETS" :key="preset" :value="preset">{{ t(`ai.preset.${preset}`) }}</option>
        </select>
        <p class="text-xs text-muted-text">{{ t(`ai.presetHint.${draft.base}`) }}</p>
      </div>
      <div class="flex flex-col gap-1">
        <label for="ai-style-requirements" class="text-xs font-semibold text-secondary-text">{{ t('ai.styleRequirements') }}</label>
        <textarea id="ai-style-requirements" v-model="draft.description" :class="fieldClass" rows="4" maxlength="4000" :placeholder="t('ai.styleRequirementsPlaceholder')" />
      </div>
      <div class="flex flex-col gap-1">
        <label for="ai-style-examples" class="text-xs font-semibold text-secondary-text">{{ t('ai.samples') }}</label>
        <textarea id="ai-style-examples" v-model="draft.samples" :class="fieldClass" rows="3" maxlength="12000" :placeholder="t('ai.samplesPlaceholder')" />
        <p class="text-xs text-muted-text">{{ sampleCount ? t('ai.samplesCount', { count: sampleCount }) : t('ai.samplesHint') }}</p>
      </div>
      <div class="flex gap-2">
        <button type="button" :class="buttonClass" data-action="style-save" @click="saveDraft">{{ t('ai.saveStyle') }}</button>
        <button type="button" :class="buttonClass" data-action="style-cancel" @click="cancel">{{ t('ai.cancelStyleEdit') }}</button>
      </div>
    </fieldset>
    <p v-if="error" role="alert" class="text-xs text-danger">{{ error }}</p>
  </div>
</template>
