<script setup lang="ts">
import { computed } from 'vue'
import {
 DropdownMenuContent,
 DropdownMenuItemIndicator,
 DropdownMenuPortal,
 DropdownMenuRadioGroup,
 DropdownMenuRadioItem,
 DropdownMenuRoot,
 DropdownMenuTrigger,
} from 'reka-ui'
import { LANGUAGE_NAMES, LANGUAGE_SETTINGS, normalizeLanguageSetting, resolveLocale } from '../../../../shared/i18n'
import { useI18n } from '../../composables/useI18n'

// 界面语言切换：地球图标按钮，点开选「跟随浏览器 / 中文 / English」
defineProps<{ triggerClass?: string }>()

const { t, setting, setLanguage } = useI18n()

const options = computed(() =>
 LANGUAGE_SETTINGS.map((value) => ({
  value,
  label: value === 'auto' ? t('language.auto', { language: LANGUAGE_NAMES[resolveLocale('auto')] }) : LANGUAGE_NAMES[value],
  lang: value === 'auto' ? undefined : value,
 })),
)

function onSelect(value: unknown) {
 void setLanguage(normalizeLanguageSetting(value))
}
</script>

<template>
 <DropdownMenuRoot>
  <DropdownMenuTrigger :class="triggerClass" :aria-label="t('language.button')" :title="t('language.button')">
   <svg class="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
   </svg>
  </DropdownMenuTrigger>
  <DropdownMenuPortal>
   <DropdownMenuContent
    align="end"
    :side-offset="4"
    class="z-50 min-w-40 p-1 rounded-control border border-border bg-card-bg shadow-md"
   >
    <DropdownMenuRadioGroup :model-value="setting" @update:model-value="onSelect">
     <DropdownMenuRadioItem
      v-for="opt in options"
      :key="opt.value"
      :value="opt.value"
      :lang="opt.lang"
      class="flex items-center justify-between gap-4 min-h-8 px-2 rounded-control text-sm text-text cursor-pointer outline-none
       data-[highlighted]:bg-sunken-bg data-[state=checked]:font-semibold data-[state=checked]:text-accent-text"
     >
      {{ opt.label }}
      <DropdownMenuItemIndicator>
       <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" />
       </svg>
      </DropdownMenuItemIndicator>
     </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
   </DropdownMenuContent>
  </DropdownMenuPortal>
 </DropdownMenuRoot>
</template>
