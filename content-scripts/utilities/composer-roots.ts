import selectors from '../selectors'

/** 只查找当前弹窗的元素，避免取到嵌套的媒体编辑弹窗。 */
export function queryComposerElements(root: Element, selector: string): HTMLElement[] {
  const dialog = root.closest('[role="dialog"]')
  return [...root.querySelectorAll<HTMLElement>(selector)]
    .filter(element => element.closest('[role="dialog"]') === dialog)
}

export function findComposerEditor(root: Element): HTMLElement | null {
  return queryComposerElements(root,
    '.DraftEditor-editorContainer [contenteditable="true"], [data-testid^="tweetTextarea"][contenteditable="true"]'
  )[0] ?? null
}

/** Inline reply composers have no dialog wrapper; find the smallest editor + publish container. */
export function findComposerRoots(): HTMLElement[] {
  // ScrollSnap-List 也用于媒体裁剪页，必须以实际发帖编辑器为准。
  const roots = new Set(Array.from(document.querySelectorAll<HTMLElement>(selectors.modalWrapper)).filter(findComposerEditor))
  for (const editor of document.querySelectorAll<HTMLElement>('[data-testid^="tweetTextarea"][contenteditable="true"]')) {
    if (editor.closest('[role="dialog"]')) continue
    for (let root = editor.parentElement; root && root !== document.body; root = root.parentElement) {
      // Never merge two editors, e.g. another reply or the background home composer.
      if (root.querySelectorAll('[data-testid^="tweetTextarea"][contenteditable="true"]').length > 1) break
      if (root.querySelector('[data-testid="tweetButtonInline"]')) {
        root.dataset.xfInlineComposer = '1'
        roots.add(root)
        break
      }
    }
  }
  return [...roots]
}
