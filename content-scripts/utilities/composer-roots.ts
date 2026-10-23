import selectors from '../selectors'

// Only inject into modals that look like a compose modal
function isComposeModal(modal: Element): boolean {
  return !!(
    modal.querySelector('.DraftEditor-editorContainer') ||
    modal.querySelector('[data-testid="ScrollSnap-List"]') ||
    modal.querySelector('[data-testid^="tweetTextarea"]')
  )
}

/** Inline reply composers have no dialog wrapper; find the smallest editor + publish container. */
export function findComposerRoots(): HTMLElement[] {
  const roots = new Set(Array.from(document.querySelectorAll<HTMLElement>(selectors.modalWrapper)).filter(isComposeModal))
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
