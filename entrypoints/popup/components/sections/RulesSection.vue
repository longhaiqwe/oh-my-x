<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { SwitchRoot, SwitchThumb } from 'reka-ui'
import {
  KeySpamRulesEnabled,
} from '../../../../storage-keys'
import { getStorage, setStorage } from '../../../../content-scripts/utilities/storage'
import {
  parseEnabledRules,
  serializeEnabledRules,
} from '../../../../shared/spam-rules'
import { SPAM_RULES } from '../../../../shared/spam-types'
import type { SpamRuleId } from '../../../../shared/spam-types'

const enabledRules = ref<Record<SpamRuleId, boolean>>(
  Object.fromEntries(SPAM_RULES.map((r) => [r.id, true])) as Record<SpamRuleId, boolean>,
)

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
 <section class="flex flex-col gap-3">
  <div class="p-3 bg-card-bg rounded-xl flex flex-col gap-2">
   <div>
    <p class="text-[12px] font-semibold">检测规则</p>
    <p class="text-[10px] text-secondary-text mt-0.5">关闭后规则引擎会跳过该检测</p>
   </div>
   <div class="flex flex-col">
    <div
     v-for="rule in SPAM_RULES"
     :key="rule.id"
     class="flex items-center justify-between gap-2 py-2 border-t border-border first:border-t-0"
    >
     <div class="flex-1 min-w-0">
      <div class="text-[12px] font-semibold leading-tight">
       {{ rule.label }}
       <span class="text-[10px] text-secondary-text ml-1">+{{ rule.defaultScore }}</span>
      </div>
      <div class="text-[10px] text-secondary-text leading-tight mt-0.5">{{ rule.description }}</div>
     </div>
     <SwitchRoot
      :model-value="enabledRules[rule.id] !== false"
      @update:model-value="(v) => toggleRule(rule.id, !!v)"
      class="w-8 h-[18px] rounded-full relative flex items-center cursor-pointer shrink-0"
      :class="enabledRules[rule.id] !== false ? 'bg-accent' : 'bg-secondary-text/40'"
     >
      <SwitchThumb
       class="block w-3.5 h-3.5 rounded-full shadow transition-transform duration-100 bg-white"
       :class="enabledRules[rule.id] !== false ? 'translate-x-[15px]' : 'translate-x-0.5'"
      />
     </SwitchRoot>
    </div>
   </div>
  </div>
 </section>
</template>
