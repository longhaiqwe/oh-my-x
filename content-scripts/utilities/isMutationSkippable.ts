export default function isMutationSkippable(mutationsList: MutationRecord[]) {
  if (!mutationsList.length) return false

  try {
    return mutationsList.every((mutation) => {
      const t = mutation.target as HTMLElement | null
      const changedNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)]

      if (!changedNodes.length && !t) return false
      return changedNodes.length
        ? changedNodes.every((node) => isSingleMutationSkippable(node as HTMLElement, t))
        : isSingleMutationSkippable(null, t)
    })
  } catch {
    return false
  }
}

const SKIPPABLE_NODE_NAMES = new Set(['IMG', 'VIDEO', 'SCRIPT', 'STYLE', '#text', 'path', 'PATH'])

function isSingleMutationSkippable(el: HTMLElement | null, t: HTMLElement | null) {
  try {
    if (!el && !t) return false

    if (el?.nodeName && SKIPPABLE_NODE_NAMES.has(el.nodeName)) return true
    if (t?.nodeName && SKIPPABLE_NODE_NAMES.has(t.nodeName)) return true

    // SVG 元素的 className 是 SVGAnimatedString（非字符串），直接 .startsWith 会抛；
    // 用 classList 更稳妥，兼容 HTML 与 SVG。
    const tClass = typeof t?.className === 'string' ? t.className : (t?.getAttribute('class') ?? '')
    const elClass = typeof el?.className === 'string' ? el.className : (el?.getAttribute('class') ?? '')

    if (
      el?.id?.startsWith('xf-') ||
      t?.id?.startsWith('xf-') ||
      tClass.startsWith('xf-') ||
      elClass.startsWith('xf-')
    )
      return true

    if (t?.closest('head, [data-testid="like"], [data-testid="retweet"], [data-testid="reply"], [data-testid="videoPlayer"], [data-testid="DMDrawer"], [data-testid="sidebarColumn"]'))
      return true

    if (el?.closest('[data-testid^="UserAvatar-Container"], [data-testid="tweetPhoto"], [data-testid="card.wrapper"], [data-testid="DMDrawer"], [data-testid="sidebarColumn"]'))
      return true

    if (el?.firstChild?.nodeName === 'VIDEO' || el?.getAttribute('data-testid') === 'tweetPhoto' || el?.parentElement?.getAttribute('data-testid') === 'tweetPhoto')
      return true

    if (el?.querySelector(':scope > img')) return true

    if (
      el?.nodeName === 'DIV' &&
      el?.firstChild?.firstChild?.firstChild &&
      (el.firstChild.firstChild as HTMLElement)?.getAttribute('data-testid') === 'caret'
    )
      return true

    return false
  } catch {
    return false
  }
}
