export const REPOST_PRESETS = ['summary', 'summary-short', 'extension', 'extension-short'] as const
export type RepostPreset = typeof REPOST_PRESETS[number]
export interface RepostPresets {
  optionA: string
  optionB: string
}

export interface RepostCustomStyle {
  id: string
  name: string
  base: RepostPreset
  description: string
  samples: string
}

export function normalizeRepostPreset(value: unknown, fallback: RepostPreset): RepostPreset {
  // 兼容第一版「简短回复」的存储值。
  if (value === 'reply') return 'summary-short'
  return REPOST_PRESETS.includes(value as RepostPreset) ? value as RepostPreset : fallback
}

export function parseRepostStyles(raw: unknown): RepostCustomStyle[] {
  let data: unknown = raw
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw) } catch { return [] }
  }
  if (!Array.isArray(data)) return []
  const seen = new Set<string>()
  return data.flatMap((item): RepostCustomStyle[] => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' ||
        !/^custom:[a-zA-Z0-9-]{1,80}$/.test(item.id) || seen.has(item.id) ||
        typeof item.name !== 'string' || !item.name.trim()) return []
    seen.add(item.id)
    return [{
      id: item.id,
      name: item.name.trim().slice(0, 80),
      base: normalizeRepostPreset(item.base, 'summary-short'),
      description: typeof item.description === 'string' ? item.description.trim().slice(0, 4000) : '',
      samples: typeof item.samples === 'string' ? item.samples.trim().slice(0, 12000) : '',
    }]
  })
}

export function normalizeRepostPresets(
  value?: Partial<Record<keyof RepostPresets, unknown>>,
  styles: RepostCustomStyle[] = [],
): RepostPresets {
  const resolve = (id: unknown, fallback: RepostPreset) =>
    typeof id === 'string' && styles.some(style => style.id === id) ? id : normalizeRepostPreset(id, fallback)
  return {
    optionA: resolve(value?.optionA, 'summary'),
    optionB: resolve(value?.optionB, 'summary-short'),
  }
}
