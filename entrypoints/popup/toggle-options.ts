export interface ToggleOption {
  value: string
  label: string
}

/** 一行开关：名称取自功能清单，值写入 storageKey */
export interface ToggleRowItem {
  featureId: string
  storageKey: string
  options: ToggleOption[]
}

export const SHOW_HIDE_OPTIONS: ToggleOption[] = [
  { value: 'on', label: '显示' },
  { value: 'off', label: '隐藏' },
]

export const ON_OFF_OPTIONS: ToggleOption[] = [
  { value: 'on', label: '开启' },
  { value: 'off', label: '关闭' },
]
