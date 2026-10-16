<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { KeySpamRulesEnabled } from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import { parseEnabledRules, serializeEnabledRules } from '../../../../shared/spam-rules'
import { SPAM_RULES } from '../../../../shared/spam-types'
import type { SpamRuleId } from '../../../../shared/spam-types'
import { getFeature } from '../../../../shared/feature-registry'
import SwitchToggle from '../ui/SwitchToggle.vue'

const feature = getFeature('spamRules')

const enabledRules = ref<Record<SpamRuleId, boolean>>(
  Object.fromEntries(SPAM_RULES.map((r) => [r.id, true])) as Record<SpamRuleId, boolean>,
)

const enabledCount = computed(() => SPAM_RULES.filter((r) => enabledRules.value[r.id] !== false).length)

onMounted(async () => {
  const raw = await getStorage(KeySpamRulesEnabled)
  const set = parseEnabledRules(String(raw ?? ''))
  enabledRules.value = Object.fromEntries(
    SPAM_RULES.map((r) => [r.id, set.has(r.id)]),
  ) as Record<SpamRuleId, boolean>
})

async function toggleRule(id: SpamRuleId, value: boolean) {
  enabledRules.value = { ...enabledRules.value, [id]: value }
  const next = new Set<SpamRuleId>(
    SPAM_RULES.filter((r) => enabledRules.value[r.id]).map((r) => r.id),
  )
  await setStorage({ [KeySpamRulesEnabled]: serializeEnabledRules(next) })
}
</script>

<template>
 <div class="flex flex-col gap-1">
  <div class="flex items-baseline justify-between">
   <p class="text-sm font-semibold text-text">{{ feature.label }}</p>
   <span class="text-xs text-muted-text">已开启 {{ enabledCount }}/{{ SPAM_RULES.length }}</span>
  </div>
  <p class="text-xs text-secondary-text">{{ feature.description }}</p>
  <div class="flex flex-col rounded-control bg-sunken-bg px-3">
   <div
    v-for="rule in SPAM_RULES"
    :key="rule.id"
    class="flex items-center justify-between gap-3 py-3 border-t border-border first:border-t-0"
   >
    <div class="flex-1 min-w-0">
     <div class="text-sm leading-tight text-text">
      {{ rule.label }}
      <span class="text-xs text-muted-text ml-1">+{{ rule.defaultScore }}</span>
     </div>
     <div class="text-xs text-muted-text leading-normal mt-1">{{ rule.description }}</div>
    </div>
    <SwitchToggle
     :model-value="enabledRules[rule.id] !== false"
     :label="rule.label"
     @update:model-value="(v) => toggleRule(rule.id, v)"
    />
   </div>
  </div>
 </div>
</template>
