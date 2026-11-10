import { fromTransferable } from './errors'
import {
  REWIND_MESSAGE,
  type RewindResult,
  type RewindOcrState,
} from './rewind'
export interface RewindStatus extends RewindResult {
  account: string
  handle: string
  recording: boolean
  ocr: boolean
  ocrState: RewindOcrState
}
export async function rewindRequest<T = RewindStatus>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const response = await browser.runtime.sendMessage({
    type: REWIND_MESSAGE,
    action,
    ...payload,
  })
  if (!response?.ok)
    throw fromTransferable(response?.error, 'error.cacheUnavailableReload')
  return response.result as T
}
