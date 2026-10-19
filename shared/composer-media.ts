/**
 * 发帖框多图排版与排序：页面主环境（MAIN world）和内容脚本共用的常量与纯计算。
 *
 * 两边只通过 DOM 交流：内容脚本在附件区（[data-testid="attachments"]）上派发事件，
 * MAIN world 的监听器同步执行，把结果写回 DOM 属性，内容脚本在 dispatchEvent 返回后读取。
 * 这个文件不能引入 shared/i18n，否则文案表会打进页面里的拦截器。
 */

/** 内容脚本请求 MAIN world 给每张图标出编号、顺序和类型 */
export const COMPOSER_MEDIA_SYNC_EVENT = 'xf-composer-media-sync'
/** 内容脚本请求 MAIN world 按 REORDER_ATTR 里的编号顺序重排图片 */
export const COMPOSER_MEDIA_REORDER_EVENT = 'xf-composer-media-reorder'

/** 附件区：当前顺序的图片编号，逗号分隔（MAIN world 写） */
export const MEDIA_IDS_ATTR = 'data-xf-media-ids'
/** 附件区：期望的图片编号顺序（内容脚本写，MAIN world 读后删除） */
export const MEDIA_REORDER_ATTR = 'data-xf-media-reorder'
/** 附件区：上次重排的结果 ok / error（MAIN world 写） */
export const MEDIA_REORDER_RESULT_ATTR = 'data-xf-media-reorder-result'
/** 图片格子：X 内部的图片编号（MAIN world 写） */
export const MEDIA_ID_ATTR = 'data-xf-media-id'
/** 图片格子：在帖子里的顺序，从 0 开始（MAIN world 写） */
export const MEDIA_INDEX_ATTR = 'data-xf-media-index'
/** 图片格子：是否图片，1 / 0（MAIN world 写） */
export const MEDIA_IMAGE_ATTR = 'data-xf-media-image'

/** X 发帖最多 4 张图 */
export const MAX_COMPOSER_MEDIA = 4

/** 把 from 位置的元素移到 to 位置，其余元素依次挪动；返回新数组 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list]
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export interface SlotRect {
  left: number
  top: number
  right: number
  bottom: number
}

/** 指针落在哪个格子；落在格子之间或网格外时取中心最近的格子 */
export function slotFromPoint(rects: readonly SlotRect[], x: number, y: number): number {
  let best = -1
  let bestDistance = Infinity
  rects.forEach((rect, index) => {
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      best = index
      bestDistance = -1
      return
    }
    if (bestDistance < 0) return
    const dx = x - (rect.left + rect.right) / 2
    const dy = y - (rect.top + rect.bottom) / 2
    const distance = dx * dx + dy * dy
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
  })
  return best
}

/** 解析逗号分隔的编号列表 */
export function parseMediaIds(value: string | null | undefined): string[] {
  return (value || '').split(',').map((id) => id.trim()).filter(Boolean)
}

/** 两组编号是否包含同样的图片（顺序可以不同） */
export function sameMediaSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return set.size === a.length && b.every((id) => set.has(id))
}
