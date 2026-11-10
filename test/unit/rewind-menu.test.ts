import { expect, it, vi } from 'vitest'
import { dismissRewindMenu } from '../../content-scripts/features/rewind'

it('有 15px 滚动条时仍识别原生全屏背景并关闭，不点击菜单链接', () => {
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(innerWidth - 15)
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(innerHeight)
  const portal = document.createElement('div')
  portal.innerHTML = '<div></div><div></div><div role="menu"><div data-testid="Dropdown"><a href="/settings">设置</a></div></div>'
  const [backdrop, spacer, menu] = [...portal.children] as HTMLElement[]
  vi.spyOn(backdrop, 'getBoundingClientRect').mockReturnValue({
    top: 0, left: 0, right: innerWidth - 15, bottom: innerHeight,
    width: innerWidth - 15, height: innerHeight,
  } as DOMRect)
  const close = vi.fn()
  const navigate = vi.fn()
  backdrop.addEventListener('click', close)
  menu.querySelector('a')!.addEventListener('click', navigate)
  dismissRewindMenu(menu.querySelector('[data-testid="Dropdown"]')!)
  expect(close).toHaveBeenCalledOnce()
  expect(navigate).not.toHaveBeenCalled()
  expect(spacer.childElementCount).toBe(0)
  vi.restoreAllMocks()
})
