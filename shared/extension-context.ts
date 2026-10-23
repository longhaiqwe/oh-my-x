/** Chrome leaves old content scripts alive after an extension reload/update. */
export function isExtensionContextInvalidated(error: unknown): boolean {
  const message = typeof error === 'string' ? error : error instanceof Error ? error.message : ''
  return /extension context invalidated/i.test(message)
}
