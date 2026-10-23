import { inject, type InjectionKey } from 'vue'
import type { FeatureModuleId } from '../../shared/feature-registry'

export const ModuleNavigationKey: InjectionKey<(module: FeatureModuleId) => void> = Symbol('module-navigation')
export function useModuleNavigation() {
  return inject(ModuleNavigationKey, (module: FeatureModuleId) => {
    void browser.tabs.create({ url: browser.runtime.getURL(`/options.html#${module}`) })
  })
}
