import { expect, it, vi } from 'vitest'
import { readChatCompletionStream } from '../../shared/ai-stream'
import { createReplyScoreStreamParser } from '../../shared/ai-reply-score'

const first = { id: '1', score: 80, signals: ['S1'], reason: '引用 "词语"，包含 } 和 \\ 以及中文' }
const second = { id: '2', score: 15, signals: [], reason: '具体经历' }

it('only emits complete result objects, handling character boundaries, escapes, nested fields and duplicate IDs', () => {
  const onScore = vi.fn()
  const push = createReplyScoreStreamParser(['1', '2'], onScore)
  const opening = '```json\n{"results":[' + JSON.stringify({ ...first, extra: { ignored: true } })
  for (const c of opening.slice(0, -1)) push(c)
  expect(onScore).not.toHaveBeenCalled()
  push(opening.slice(-1))
  expect(onScore).toHaveBeenCalledWith(first)
  push(',' + JSON.stringify(first) + ',' + JSON.stringify({ ...first, id: 'unknown' }) + ',')
  expect(onScore).toHaveBeenCalledTimes(1)
  push(JSON.stringify(second) + ']}\n```')
  expect(onScore).toHaveBeenCalledTimes(2)
  expect(onScore).toHaveBeenLastCalledWith(second)
})

it('uses the same score validation as complete responses and ignores incomplete trailing objects', () => {
  const onScore = vi.fn()
  const push = createReplyScoreStreamParser(['1', '2'], onScore)
  push('{"results":[{"id":"1","score":"bad"},{"id":"1","score":120,"signals":["s1","S1","bad"],"reason":" ok "},{"id":"2","score":')
  expect(onScore).toHaveBeenCalledExactlyOnceWith({ id: '1', score: 100, signals: ['S1'], reason: 'ok' })
})

it('decodes SSE split at every byte, including UTF-8, CRLF, comments, multiple data lines, usage and DONE', async () => {
  const delta = JSON.stringify({ choices: [{ index: 0, delta: { content: '中文' } }] })
  const wire = ': keepalive\r\n\r\ndata: ' + delta + '\r\n\r\n'
    + 'event: message\r\ndata: {"choices": [],\r\ndata: "usage":{"prompt_tokens":100,"completion_tokens":5}}\r\n\r\n'
    + 'data: [DONE]\r\n\r\n'
  const bytes = new TextEncoder().encode(wire)
  const cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const b of bytes) c.enqueue(Uint8Array.of(b)) }, cancel })
  const onDelta = vi.fn()
  expect(await readChatCompletionStream(new Response(body), new AbortController().signal, onDelta)).toEqual({ content: '中文', usage: { promptTokens: 100, completionTokens: 5 } })
  expect(onDelta).toHaveBeenCalledExactlyOnceWith('中文')
  expect(cancel).toHaveBeenCalledOnce()
})

it('propagates provider errors after partial content and cancels the reader', async () => {
  const cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({ start(c) {
    c.enqueue(new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{"content":"partial"}}]}\n\ndata: {"error":{"message":"provider overloaded"}}\n\n'))
  }, cancel })
  const onDelta = vi.fn()
  await expect(readChatCompletionStream(new Response(body), new AbortController().signal, onDelta)).rejects.toThrow('provider overloaded')
  expect(onDelta).toHaveBeenCalledWith('partial')
  expect(cancel).toHaveBeenCalledOnce()
})

it('aborts a stalled read and stops callbacks', async () => {
  const cancel = vi.fn()
  const body = new ReadableStream<Uint8Array>({ cancel })
  const controller = new AbortController()
  const result = readChatCompletionStream(new Response(body), controller.signal, vi.fn())
  controller.abort(new Error('cancelled'))
  await expect(result).rejects.toThrow('cancelled')
  expect(cancel).toHaveBeenCalledOnce()
})

it('reports malformed SSE without losing already delivered content', async () => {
  const body = new ReadableStream<Uint8Array>({ start(c) {
    c.enqueue(new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{"content":"ok"}}]}\n\ndata: {broken}\n\n'))
  } })
  const onDelta = vi.fn()
  await expect(readChatCompletionStream(new Response(body), new AbortController().signal, onDelta)).rejects.toMatchObject({ code: 'error.aiScoreParse' })
  expect(onDelta).toHaveBeenCalledExactlyOnceWith('ok')
})

it('handles EOF without a trailing event separator', async () => {
  const body = new ReadableStream<Uint8Array>({ start(c) {
    c.enqueue(new TextEncoder().encode('data: {"choices":[{"index":0,"delta":{"content":"ok"}}]}'))
    c.close()
  } })
  expect(await readChatCompletionStream(new Response(body), new AbortController().signal, vi.fn())).toMatchObject({ content: 'ok' })
})
