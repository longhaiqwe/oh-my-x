import { AppError } from './errors'
import { reportAiActivity } from './ai-deadline'

/** Read OpenAI-compatible SSE without waiting for the whole completion. */
export async function readChatCompletionStream(
  response: Response,
  signal: AbortSignal,
  onContent: (delta: string) => void,
): Promise<{ content: string; usage: { promptTokens: number; completionTokens: number } | null }> {
  signal.throwIfAborted()
  if (!response.body) throw new AppError('error.aiScoreParse')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let data: string[] = []
  let content = ''
  let usage: { promptTokens: number; completionTokens: number } | null = null
  let done = false
  let cancellation: Promise<void> | undefined
  const cancel = () => cancellation ??= reader.cancel().catch(() => {})
  const onAbort = () => { void cancel() }
  signal.addEventListener('abort', onAbort, { once: true })

  function dispatch() {
    if (!data.length) return
    const payload = data.join('\n')
    data = []
    if (payload.trim() === '[DONE]') { done = true; return }
    let event: any
    try { event = JSON.parse(payload) } catch { throw new AppError('error.aiScoreParse') }
    if (event?.error) throw new Error(String(event.error.message || event.error.code || 'AI stream error'))
    const choice = event?.choices?.find((c: any) => c.index === 0 || c.index == null)
    const delta = choice?.delta?.content
    if (typeof delta === 'string' && delta) {
      content += delta
      if (content.length > 1_000_000) throw new AppError('error.aiScoreParse')
      onContent(delta)
    }
    if (event?.usage) {
      const prompt = Number(event.usage.prompt_tokens)
      const completion = Number(event.usage.completion_tokens)
      if (Number.isFinite(prompt) || Number.isFinite(completion)) usage = {
        promptTokens: Number.isFinite(prompt) ? prompt : 0,
        completionTokens: Number.isFinite(completion) ? completion : 0,
      }
    }
  }

  function line(value: string) {
    if (!value) dispatch()
    else if (value.startsWith('data:')) data.push(value.slice(5).replace(/^ /, ''))
    // Comments, event names, IDs and keepalives carry no completion text.
  }

  try {
    while (!done) {
      signal.throwIfAborted()
      const part = await reader.read()
      signal.throwIfAborted()
      // 收到任何数据都算有进展，包括思考片段和服务端的保活注释
      if (part.value?.length) reportAiActivity(signal)
      buffer += decoder.decode(part.value, { stream: !part.done })
      if (buffer.length > 1_000_000) throw new AppError('error.aiScoreParse')
      let end: number
      while (!done && (end = buffer.indexOf('\n')) !== -1) {
        line(buffer.slice(0, end).replace(/\r$/, ''))
        buffer = buffer.slice(end + 1)
      }
      if (part.done) {
        if (!done && buffer) line(buffer.replace(/\r$/, ''))
        if (!done) dispatch()
        break
      }
    }
    return { content, usage }
  } finally {
    signal.removeEventListener('abort', onAbort)
    await cancel()
    reader.releaseLock()
  }
}
