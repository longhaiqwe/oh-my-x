/**
 * 发帖框多图排序：运行在页面主环境（MAIN world，由 interceptor.content.ts 安装）。
 *
 * X 发帖框里图片的显示顺序和发帖时的 media_ids 顺序，都取自 Redux 里 mediaUpload 数组的顺序，
 * 发帖框自己的 mediaIds 只用来筛选。所以重排做法是：先用 REMOVE_MEDIA 把这几张图从数组里拿掉
 * （这个普通动作只过滤数组，不取消上传、不释放文件），再用 ADD_MEDIA 按新顺序加回末尾。
 * 两次 dispatch 在同一个同步任务里，React 合并成一次渲染。
 *
 * 只依赖 DOM 和 React 挂在节点上的数据，不引入 shared/i18n。读不到预期结构时什么都不改。
 */
import {
  COMPOSER_MEDIA_REORDER_EVENT,
  COMPOSER_MEDIA_SYNC_EVENT,
  MEDIA_ID_ATTR,
  MEDIA_IDS_ATTR,
  MEDIA_IMAGE_ATTR,
  MEDIA_INDEX_ATTR,
  MEDIA_REORDER_ATTR,
  MEDIA_REORDER_RESULT_ATTR,
  parseMediaIds,
  sameMediaSet,
} from './composer-media'

const REMOVE_MEDIA = 'rweb/mediaUpload/REMOVE_MEDIA'
const ADD_MEDIA = 'rweb/mediaUpload/ADD_MEDIA'

interface MediaFileLike {
  isImage?: boolean
  isVideo?: boolean
  isGif?: boolean
}

export interface ComposerMediaItem {
  id: number | string
  mediaFile?: MediaFileLike
  originalMediaFile?: MediaFileLike
}

interface FiberLike {
  return: FiberLike | null
  memoizedProps?: Record<string, unknown> | null
}

interface StoreLike {
  getState(): { mediaUpload?: unknown }
  dispatch(action: { type: string; payload: unknown }): unknown
}

function getFiber(el: Element): FiberLike | null {
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))
  return key ? ((el as unknown as Record<string, FiberLike>)[key] ?? null) : null
}

function isMediaItem(value: unknown): value is ComposerMediaItem {
  if (!value || typeof value !== 'object') return false
  const id = (value as ComposerMediaItem).id
  return typeof id === 'number' || typeof id === 'string'
}

function isImageItem(item: ComposerMediaItem): boolean {
  const file = item.originalMediaFile ?? item.mediaFile
  return !!file && file.isImage === true && !file.isVideo && !file.isGif
}

/** 从图片格子往上找：先遇到这张图的数据（mediaItem），再遇到整组图片（media 数组） */
export function readMediaGroup(group: Element): { item: ComposerMediaItem; list: ComposerMediaItem[] } | null {
  let fiber = getFiber(group)
  let item: ComposerMediaItem | null = null
  for (let depth = 0; fiber && depth < 40; depth++, fiber = fiber.return) {
    const props = fiber.memoizedProps
    if (!props) continue
    if (!item && isMediaItem(props.mediaItem)) item = props.mediaItem
    if (item && Array.isArray(props.media) && props.media.every(isMediaItem)) {
      const list = props.media as ComposerMediaItem[]
      if (list.some((m) => String(m.id) === String(item!.id))) return { item, list }
    }
  }
  return null
}

function isMediaStore(value: unknown): value is StoreLike {
  if (!value || typeof value !== 'object') return false
  const store = value as StoreLike
  if (typeof store.getState !== 'function' || typeof store.dispatch !== 'function') return false
  try {
    return Array.isArray(store.getState()?.mediaUpload)
  } catch {
    return false
  }
}

let cachedStore: StoreLike | null = null

/** 发帖框里的图片对象就是 mediaUpload 数组里的对象，按引用判断是不是同一个 store */
function storeHas(store: StoreLike, items: readonly ComposerMediaItem[]): boolean {
  const all = store.getState().mediaUpload as ComposerMediaItem[]
  return items.every((item) => all.includes(item))
}

/** 从附件区往上找包含这几张图的 Redux store（react-redux Provider 的 store / context value） */
export function findMediaStore(root: Element, items: readonly ComposerMediaItem[]): StoreLike | null {
  if (cachedStore && isMediaStore(cachedStore) && storeHas(cachedStore, items)) return cachedStore
  let fiber = getFiber(root)
  for (let depth = 0; fiber && depth < 800; depth++, fiber = fiber.return) {
    const props = fiber.memoizedProps
    if (!props) continue
    const value = props.value as Record<string, unknown> | undefined
    for (const candidate of [props.store, value?.store, value]) {
      if (isMediaStore(candidate) && storeHas(candidate, items)) {
        cachedStore = candidate
        return candidate
      }
    }
  }
  return null
}

/** 给附件区里的每张图写上编号、顺序和类型 */
export function syncComposerMedia(root: Element) {
  let list: ComposerMediaItem[] | null = null
  const entries: Array<[Element, ComposerMediaItem]> = []
  root.querySelectorAll('[role="group"]').forEach((group) => {
    const found = readMediaGroup(group)
    if (!found) {
      group.removeAttribute(MEDIA_ID_ATTR)
      group.removeAttribute(MEDIA_INDEX_ATTR)
      group.removeAttribute(MEDIA_IMAGE_ATTR)
      return
    }
    list = found.list
    entries.push([group, found.item])
  })

  const ids = list ? (list as ComposerMediaItem[]).map((m) => String(m.id)) : []
  root.setAttribute(MEDIA_IDS_ATTR, ids.join(','))
  for (const [group, item] of entries) {
    group.setAttribute(MEDIA_ID_ATTR, String(item.id))
    group.setAttribute(MEDIA_INDEX_ATTR, String(ids.indexOf(String(item.id))))
    group.setAttribute(MEDIA_IMAGE_ATTR, isImageItem(item) ? '1' : '0')
  }
}

/** 按 MEDIA_REORDER_ATTR 里的编号顺序重排；成功返回 true */
export function reorderComposerMedia(root: Element): boolean {
  const wanted = parseMediaIds(root.getAttribute(MEDIA_REORDER_ATTR))
  root.removeAttribute(MEDIA_REORDER_ATTR)
  const group = root.querySelector('[role="group"]')
  const found = group ? readMediaGroup(group) : null
  if (!found) return false
  const current = found.list.map((m) => String(m.id))
  if (!sameMediaSet(current, wanted)) return false
  if (current.join(',') === wanted.join(',')) return true

  const store = findMediaStore(root, found.list)
  if (!store) return false
  const ordered = wanted.map((id) => found.list.find((m) => String(m.id) === id)!)
  const ids = ordered.map((m) => m.id)

  store.dispatch({ type: REMOVE_MEDIA, payload: ids })
  try {
    store.dispatch({ type: ADD_MEDIA, payload: ordered })
  } catch {
    // 加回失败时按原顺序再加一次，避免图片从发帖框里消失
    const stillMissing = found.list.filter((m) => !(store.getState().mediaUpload as ComposerMediaItem[]).includes(m))
    if (stillMissing.length) store.dispatch({ type: ADD_MEDIA, payload: stillMissing })
    return false
  }
  const after = (store.getState().mediaUpload as ComposerMediaItem[])
    .filter((m) => ids.includes(m.id))
    .map((m) => String(m.id))
  return after.join(',') === wanted.join(',')
}

let installed = false

export function installComposerMediaBridge(isEnabled: () => boolean = () => true) {
  if (installed) return
  installed = true
  document.addEventListener(COMPOSER_MEDIA_SYNC_EVENT, (event) => {
    const root = event.target
    if (!isEnabled() || !(root instanceof Element)) return
    try {
      syncComposerMedia(root)
    } catch {
      root.setAttribute(MEDIA_IDS_ATTR, '')
    }
  }, true)
  document.addEventListener(COMPOSER_MEDIA_REORDER_EVENT, (event) => {
    const root = event.target
    if (!(root instanceof Element)) return
    let ok = false
    try {
      ok = isEnabled() && reorderComposerMedia(root)
    } catch {
      ok = false
    }
    root.setAttribute(MEDIA_REORDER_RESULT_ATTR, ok ? 'ok' : 'error')
  }, true)
}
