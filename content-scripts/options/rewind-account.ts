import { getOwnHandle } from '../../shared/own-posts'

/** The mobile navigation may not contain a profile link. A stable cookie ID is sufficient. */
export function getRewindAccount(): { account: string; handle: string } | null {
  try {
    const cookie = decodeURIComponent(
      document.cookie.match(/(?:^|;\s*)twid=([^;]+)/)?.[1] || '',
    ).replace(/"/g, '')
    const account = cookie.match(/^u=(\d+)$/)?.[1]
    return account ? { account, handle: getOwnHandle() || '' } : null
  } catch {
    return null
  }
}
