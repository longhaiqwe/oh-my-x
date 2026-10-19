import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  MEDIA_ID_ATTR,
  MEDIA_IDS_ATTR,
  MEDIA_IMAGE_ATTR,
  MEDIA_INDEX_ATTR,
  moveItem,
  sameMediaSet,
  slotFromPoint,
} from '../../shared/composer-media'
import { installComposerMediaBridge } from '../../shared/composer-media-bridge'
import {
  COLUMN_ATTR,
  FRAME_ATTR,
  GRID_ATTR,
  ORDER_ATTR,
  SLOT_ATTR,
  SPACER_ATTR,
  WRAPPER_ATTR,
  requestComposerMediaReorder,
  setComposerMediaGridEnabled,
  updateComposerMediaGrids,
} from '../../content-scripts/options/composer-media'

describe('多图排序的纯计算', () => {
  it('把一项移到新位置，其余依次挪动', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 3)).toEqual(['b', 'c', 'd', 'a'])
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b'])
  })

  it('指针在格子里取该格子，在格子外取中心最近的格子', () => {
    const rects = [
      { left: 0, top: 0, right: 100, bottom: 60 },
      { left: 108, top: 0, right: 208, bottom: 60 },
      { left: 0, top: 68, right: 100, bottom: 128 },
    ]
    expect(slotFromPoint(rects, 150, 30)).toBe(1)
    expect(slotFromPoint(rects, 104, 100)).toBe(2)
    expect(slotFromPoint(rects, 300, -50)).toBe(1)
  })

  it('比较两组编号是否是同一批图片', () => {
    expect(sameMediaSet(['1', '2', '3'], ['3', '1', '2'])).toBe(true)
    expect(sameMediaSet(['1', '2'], ['1', '3'])).toBe(false)
    expect(sameMediaSet(['1', '1'], ['1', '2'])).toBe(false)
  })
})

// ---- 仿 X 的发帖框结构 ----

interface FakeItem {
  id: number
  mediaFile: { isImage: boolean; isVideo: boolean; isGif: boolean }
}

type Action = { type: string; payload: any }

function createStore(items: FakeItem[]) {
  let state = { mediaUpload: [...items] }
  const actions: string[] = []
  return {
    actions,
    getState: () => state,
    dispatch(action: Action) {
      actions.push(action.type)
      if (action.type === 'rweb/mediaUpload/REMOVE_MEDIA') {
        state = { mediaUpload: state.mediaUpload.filter((m) => !action.payload.includes(m.id)) }
      } else if (action.type === 'rweb/mediaUpload/ADD_MEDIA') {
        state = { mediaUpload: state.mediaUpload.concat(action.payload) }
      }
      return action
    },
  }
}

function setFiber(el: Element, fiber: unknown) {
  ;(el as any)['__reactFiber$test'] = fiber
}

function image(id: number, kind: 'image' | 'video' = 'image'): FakeItem {
  return { id, mediaFile: { isImage: kind === 'image', isVideo: kind === 'video', isGif: false } }
}

/** 按 X 的布局生成附件区：2 张并排，3 张左 1 右 2，4 张两列 [0,2] [1,3] */
function buildAttachments(items: FakeItem[]) {
  const store = createStore(items)
  const root = document.createElement('div')
  root.setAttribute('data-testid', 'attachments')
  const outer = document.createElement('div')
  const box = document.createElement('div')
  const spacer = document.createElement('div')
  spacer.style.paddingBottom = '56.25%'
  const fill = document.createElement('div')
  const wrapper = document.createElement('div')
  fill.append(wrapper)
  box.append(spacer, fill)
  outer.append(box)
  const tags = document.createElement('div')
  tags.innerHTML = '<a role="link">圈人</a>'
  root.append(outer, tags)

  const rootFiber = { memoizedProps: { store }, return: null }
  setFiber(root, { memoizedProps: {}, return: rootFiber })
  const listFiber = { memoizedProps: { media: items }, return: rootFiber }

  const groups = items.map((item) => {
    const group = document.createElement('div')
    group.setAttribute('role', 'group')
    group.innerHTML = `<div><div style="background-image: url(blob:${item.id})"></div><img src="blob:${item.id}"></div><button aria-label="编辑媒体">编辑</button>`
    setFiber(group, { memoizedProps: { role: 'group' }, return: { memoizedProps: { mediaItem: item }, return: listFiber } })
    return group
  })
  const column = (...els: HTMLElement[]) => {
    const col = document.createElement('div')
    col.append(...els)
    return col
  }
  if (items.length === 3) wrapper.append(groups[0], column(groups[1], groups[2]))
  else if (items.length === 4) wrapper.append(column(groups[0], groups[2]), column(groups[1], groups[3]))
  else wrapper.append(...groups)

  document.body.append(root)
  return { root, wrapper, spacer, fill, box, outer, groups, store }
}

function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  return event
}

function placeInGrid(groups: HTMLElement[]) {
  // 两列格子，每格 200 × 125，间距 8
  groups.forEach((group) => {
    group.getBoundingClientRect = () => {
      const slot = Number(group.getAttribute(SLOT_ATTR))
      const left = (slot % 2) * 208
      const top = Math.floor(slot / 2) * 133
      return { left, top, right: left + 200, bottom: top + 125, width: 200, height: 125, x: left, y: top, toJSON() {} } as DOMRect
    }
  })
}

describe('发帖框多图排版', () => {
  beforeAll(() => {
    installComposerMediaBridge()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    setComposerMediaGridEnabled(true)
  })

  it('页面主环境按 X 的数据写上编号、顺序和类型', () => {
    const { root, groups } = buildAttachments([image(1), image(2), image(3), image(4)])
    updateComposerMediaGrids()
    expect(root.getAttribute(MEDIA_IDS_ATTR)).toBe('1,2,3,4')
    expect(groups.map((g) => g.getAttribute(MEDIA_ID_ATTR))).toEqual(['1', '2', '3', '4'])
    expect(groups.map((g) => g.getAttribute(MEDIA_INDEX_ATTR))).toEqual(['0', '1', '2', '3'])
    expect(groups.every((g) => g.getAttribute(MEDIA_IMAGE_ATTR) === '1')).toBe(true)
  })

  it('4 张图：拆掉两列结构，按发帖顺序编号', () => {
    const { root, wrapper, spacer, fill, groups } = buildAttachments([image(1), image(2), image(3), image(4)])
    updateComposerMediaGrids()
    expect(root.getAttribute(GRID_ATTR)).toBe('4')
    expect(wrapper.hasAttribute(WRAPPER_ATTR)).toBe(true)
    expect(Array.from(wrapper.children).every((col) => col.hasAttribute(COLUMN_ATTR))).toBe(true)
    expect(fill.hasAttribute(FRAME_ATTR)).toBe(true)
    expect(spacer.hasAttribute(SPACER_ATTR)).toBe(true)
    expect(groups.map((g) => g.getAttribute(SLOT_ATTR))).toEqual(['0', '1', '2', '3'])
    expect(groups.map((g) => g.getAttribute(ORDER_ATTR))).toEqual(['1', '2', '3', '4'])
    expect(groups[0].getAttribute('title')).toBe('拖动可调整顺序')
  })

  it('3 张图：第一张在外层、后两张在列里，也排成同一个网格', () => {
    const { root, wrapper, groups } = buildAttachments([image(7), image(8), image(9)])
    updateComposerMediaGrids()
    expect(root.getAttribute(GRID_ATTR)).toBe('3')
    expect(groups[0].hasAttribute(COLUMN_ATTR)).toBe(false)
    expect(wrapper.children[1].hasAttribute(COLUMN_ATTR)).toBe(true)
    expect(groups.map((g) => g.getAttribute(ORDER_ATTR))).toEqual(['1', '2', '3'])
  })

  it('有视频时保持 X 原样', () => {
    const { root } = buildAttachments([image(1), image(2, 'video')])
    updateComposerMediaGrids()
    expect(root.hasAttribute(GRID_ATTR)).toBe(false)
    expect(root.querySelector(`[${SLOT_ATTR}]`)).toBeNull()
  })

  it('只有 1 张图时不改排版', () => {
    const { root } = buildAttachments([image(1)])
    updateComposerMediaGrids()
    expect(root.hasAttribute(GRID_ATTR)).toBe(false)
  })

  it('关闭开关后去掉所有标记和提示文字', () => {
    const { root, groups } = buildAttachments([image(1), image(2)])
    updateComposerMediaGrids()
    expect(root.hasAttribute(GRID_ATTR)).toBe(true)
    setComposerMediaGridEnabled(false)
    expect(root.hasAttribute(GRID_ATTR)).toBe(false)
    expect(root.querySelector(`[${SLOT_ATTR}], [${WRAPPER_ATTR}], [${SPACER_ATTR}]`)).toBeNull()
    expect(groups[0].hasAttribute('title')).toBe(false)
  })

  it('重排：先移除再按新顺序加回 X 的图片库', () => {
    const { root, store } = buildAttachments([image(1), image(2), image(3)])
    updateComposerMediaGrids()
    expect(requestComposerMediaReorder(root, ['3', '1', '2'])).toBe(true)
    expect(store.getState().mediaUpload.map((m) => m.id)).toEqual([3, 1, 2])
    expect(store.actions).toEqual(['rweb/mediaUpload/REMOVE_MEDIA', 'rweb/mediaUpload/ADD_MEDIA'])
  })

  it('重排请求里的图片和发帖框不一致时不改动', () => {
    const { root, store } = buildAttachments([image(1), image(2)])
    updateComposerMediaGrids()
    expect(requestComposerMediaReorder(root, ['2', '5'])).toBe(false)
    expect(store.actions).toEqual([])
  })

  it('其他发帖框的图片保持在原来的相对位置', () => {
    const other = image(10)
    const { root, store } = buildAttachments([image(1), image(2)])
    store.getState().mediaUpload.unshift(other)
    updateComposerMediaGrids()
    expect(requestComposerMediaReorder(root, ['2', '1'])).toBe(true)
    expect(store.getState().mediaUpload.map((m) => m.id)).toEqual([10, 2, 1])
  })

  it('拖动第 1 张到第 4 格，松手后 X 的顺序变成 2 3 4 1，之后的点击不触发', () => {
    const { root, groups, store } = buildAttachments([image(1), image(2), image(3), image(4)])
    updateComposerMediaGrids()
    placeInGrid(groups)

    const picture = groups[0].querySelector('img')!
    picture.dispatchEvent(pointer('pointerdown', 50, 50))
    window.dispatchEvent(pointer('pointermove', 120, 60))
    expect(document.querySelector('.xf-media-drag-ghost')).not.toBeNull()
    window.dispatchEvent(pointer('pointermove', 300, 180))
    // 拖动中先按预览顺序编号
    expect(groups.map((g) => g.getAttribute(ORDER_ATTR))).toEqual(['4', '1', '2', '3'])
    window.dispatchEvent(pointer('pointerup', 300, 180))

    expect(store.getState().mediaUpload.map((m) => m.id)).toEqual([2, 3, 4, 1])
    expect(document.querySelector('.xf-media-drag-ghost')).toBeNull()

    let clicked = false
    groups[0].addEventListener('click', () => { clicked = true })
    groups[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(clicked).toBe(false)
  })

  it('移动距离很小时当作点击，不改顺序', () => {
    const { groups, store } = buildAttachments([image(1), image(2)])
    updateComposerMediaGrids()
    placeInGrid(groups)
    groups[0].querySelector('img')!.dispatchEvent(pointer('pointerdown', 50, 50))
    window.dispatchEvent(pointer('pointermove', 52, 51))
    window.dispatchEvent(pointer('pointerup', 52, 51))
    expect(store.actions).toEqual([])
    expect(document.querySelector('.xf-media-drag-ghost')).toBeNull()
  })

  it('从编辑按钮上按下不开始拖动', () => {
    const { groups, store } = buildAttachments([image(1), image(2)])
    updateComposerMediaGrids()
    placeInGrid(groups)
    groups[0].querySelector('button')!.dispatchEvent(pointer('pointerdown', 20, 20))
    window.dispatchEvent(pointer('pointermove', 300, 60))
    window.dispatchEvent(pointer('pointerup', 300, 60))
    expect(store.actions).toEqual([])
  })

  it('按 Esc 取消拖动，恢复原来的编号', () => {
    const { groups, store } = buildAttachments([image(1), image(2), image(3)])
    updateComposerMediaGrids()
    placeInGrid(groups)
    groups[0].querySelector('img')!.dispatchEvent(pointer('pointerdown', 50, 50))
    window.dispatchEvent(pointer('pointermove', 300, 60))
    expect(groups.map((g) => g.getAttribute(ORDER_ATTR))).toEqual(['2', '1', '3'])
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    expect(groups.map((g) => g.getAttribute(ORDER_ATTR))).toEqual(['1', '2', '3'])
    window.dispatchEvent(pointer('pointerup', 300, 60))
    expect(store.actions).toEqual([])
  })
})
