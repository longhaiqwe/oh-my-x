import { ACCENT } from '../utilities/colors'

const CUSTOM = '.xf-insert-link-button'
const toolbars = new Set<HTMLElement>()
let observer: MutationObserver | null = null

function syncColor(toolbar: HTMLElement) {
  // Refactoring UI §2.2 / §7.3：复用相邻原生图标的颜色，不继承正文色，也不取禁用按钮。
  const source = [...toolbar.querySelectorAll<SVGElement>('svg')].find(icon =>
    !icon.closest(CUSTOM) &&
    !!icon.closest('button, [role="button"]') &&
    !icon.closest(':disabled, [aria-disabled="true"], [hidden]'),
  )
  const color = source ? getComputedStyle(source).color : ''
  for (const button of toolbar.querySelectorAll<HTMLElement>(CUSTOM)) {
    const value = color || ACCENT
    if (button.style.getPropertyValue('--xf-composer-icon-color') !== value) {
      button.style.setProperty('--xf-composer-icon-color', value)
    }
  }
}

/** 底部工具栏独立取色；选区浮层继续复用原生 B / I 的样式。 */
export function followComposerToolbarColor(toolbar: HTMLElement) {
  toolbars.add(toolbar)
  syncColor(toolbar)
  if (observer) return
  observer = new MutationObserver(records => {
    for (const root of toolbars) {
      if (!root.isConnected) { toolbars.delete(root); continue }
      const changed = records.some(({ target }) => {
        const element = target instanceof Element ? target : target.parentElement
        if (!element || element.closest(CUSTOM)) return false
        return root.contains(element) || element.contains(root) || document.head.contains(element)
      })
      if (changed) syncColor(root)
    }
    if (!toolbars.size) { observer?.disconnect(); observer = null }
  })
  observer.observe(document.documentElement, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ['class', 'style', 'disabled', 'aria-disabled', 'hidden'],
  })
}
