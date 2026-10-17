import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ReplyAssistant,
  clampJumpButtonPosition,
  parseJumpButtonPosition,
} from '../../content-scripts/features/reply-assistant'
import { KeyJumpRepliesPosition } from '../../storage-keys'

describe('直达回复胶囊的位置计算', () => {
  const size = { width: 100, height: 36 }
  const viewport = { width: 1000, height: 700 }

  it('窗口内的位置保持不变', () => {
    expect(clampJumpButtonPosition({ right: 24, bottom: 84 }, size, viewport)).toEqual({ right: 24, bottom: 84 })
  })

  it('拖出窗口时拉回可见范围，并与边缘保持 8px', () => {
    expect(clampJumpButtonPosition({ right: -50, bottom: 5000 }, size, viewport)).toEqual({ right: 8, bottom: 656 })
    expect(clampJumpButtonPosition({ right: 2000, bottom: -10 }, size, viewport)).toEqual({ right: 892, bottom: 8 })
  })

  it('读取保存的位置，损坏的数据按默认位置处理', () => {
    expect(parseJumpButtonPosition('{"right":40,"bottom":120}')).toEqual({ right: 40, bottom: 120 })
    expect(parseJumpButtonPosition('{"right":"a"}')).toBeNull()
    expect(parseJumpButtonPosition('not json')).toBeNull()
    expect(parseJumpButtonPosition(undefined)).toBeNull()
  })
})

function pointer(type: string, init: { clientX: number; clientY: number }) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  return event
}

describe('拖动直达回复胶囊', () => {
  let set: ReturnType<typeof vi.fn>
  let btn: HTMLElement
  let assistant: any

  beforeEach(() => {
    set = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('browser', { runtime: { id: 'test-extension' }, storage: { local: { get: vi.fn().mockResolvedValue({}), set } } })
    // jsdom 默认窗口 1024 × 768；胶囊在右下角，宽 100、高 36
    btn = document.createElement('div')
    btn.getBoundingClientRect = () => ({ left: 800, top: 500, right: 900, bottom: 536, width: 100, height: 36, x: 800, y: 500, toJSON() {} }) as DOMRect
    document.body.append(btn)
    assistant = ReplyAssistant.getInstance() as any
    assistant.jumpButton = btn
    assistant.attachDrag(btn)
  })

  afterEach(() => {
    btn.remove()
    assistant.jumpButton = null
    assistant.position = undefined
    vi.unstubAllGlobals()
  })

  it('按住移动后，胶囊跟着移动并保存位置，松手后的点击不触发跳转', async () => {
    btn.dispatchEvent(pointer('pointerdown', { clientX: 850, clientY: 518 }))
    btn.dispatchEvent(pointer('pointermove', { clientX: 650, clientY: 318 }))
    expect(btn.style.getPropertyValue('right')).toBe('324px')
    expect(btn.style.getPropertyValue('bottom')).toBe('432px')
    expect(btn.classList.contains('xf-jump-dragging')).toBe(true)

    btn.dispatchEvent(pointer('pointerup', { clientX: 650, clientY: 318 }))
    expect(btn.classList.contains('xf-jump-dragging')).toBe(false)
    expect(assistant.suppressClick).toBe(true)
    expect(set).toHaveBeenCalledWith({ [KeyJumpRepliesPosition]: JSON.stringify({ right: 324, bottom: 432 }) })

    // 如果浏览器没有补发 click，下一轮事件循环前恢复，不会吞掉之后的正常点击
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(assistant.suppressClick).toBe(false)
  })

  it('只移动 2px 仍然算点击，不改变位置', () => {
    btn.dispatchEvent(pointer('pointerdown', { clientX: 850, clientY: 518 }))
    btn.dispatchEvent(pointer('pointermove', { clientX: 852, clientY: 518 }))
    btn.dispatchEvent(pointer('pointerup', { clientX: 852, clientY: 518 }))
    expect(btn.style.getPropertyValue('right')).toBe('')
    expect(assistant.suppressClick).toBe(false)
    expect(set).not.toHaveBeenCalled()
  })
})
