import { removeElementById } from './removeElement'

export default function addStyles(id: string, css: string, root: Document | ShadowRoot = document) {
  root.getElementById('xf-style-' + id)?.remove()
  const head = root instanceof ShadowRoot ? root : root.head
  const style = document.createElement('style')
  style.id = 'xf-style-' + id
  style.textContent = css.trim().split('\n').join('')
  head!.appendChild(style)
}

export function removeStyles(id: string) {
  removeElementById('xf-style-' + id)
}

export function stylesExist(id: string, root: Document | ShadowRoot = document) {
  return root.getElementById('xf-style-' + id)
}
