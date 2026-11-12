import { AUDIENCE_MESSAGE } from './audience'
import { fromTransferable } from './errors'
export async function audienceRequest<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const response = await browser.runtime.sendMessage({
    type: AUDIENCE_MESSAGE,
    action,
    ...payload,
  })
  if (!response?.ok) throw fromTransferable(response?.error, 'error.readFailed')
  return response.result as T
}
