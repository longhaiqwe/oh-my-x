import type { Component, InjectionKey } from 'vue'
import { inject } from 'vue'
import type { FeatureModuleId } from '../../shared/feature-registry'

// 同步导入各模块页：本地扩展没有网络下载延迟（打包总体积仅百余 KB），
// 同步导入消除 defineAsyncComponent 导致的异步挂载空白间隙与二次渲染瀑布流。
// 使用方配合 v-if / :key 确保只有当前模块才会实例化与挂载。
import LayoutModule from './components/modules/LayoutModule.vue'
import FilterModule from './components/modules/FilterModule.vue'
import InsightModule from './components/modules/InsightModule.vue'
import CreateModule from './components/modules/CreateModule.vue'
import EngageModule from './components/modules/EngageModule.vue'

/** 模块 id → 模块页组件，弹窗和完整设置页共用 */
export const moduleComponents: Record<FeatureModuleId, Component> = {
  layout: LayoutModule,
  filter: FilterModule,
  insight: InsightModule,
  create: CreateModule,
  engage: EngageModule,
}

/** 当前设置界面：插件弹窗，或整页打开的完整设置页 */
export type SettingsSurface = 'popup' | 'options'
export const SettingsSurfaceKey: InjectionKey<SettingsSurface> = Symbol('settings-surface')

export function useSettingsSurface(): SettingsSurface {
  return inject(SettingsSurfaceKey, 'popup')
}

/** 设置界面的滚动容器：弹窗里是 #app（见 popup/style.css），完整设置页是整个页面 */
export function getScrollContainer(): HTMLElement | null {
  const app = document.getElementById('app')
  if (app && getComputedStyle(app).overflowY === 'auto') return app
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}
