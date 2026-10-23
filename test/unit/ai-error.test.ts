import { expect, it } from 'vitest'
import { describeAiError } from '../../shared/ai-error'

it.each([
  ['Extension context invalidated.', 'refresh', '扩展连接已失效'],
  [{ code: 'error.backgroundDisconnected' }, 'refresh', '扩展连接已断开'],
  [{ code: 'error.aiTimeout', params: { seconds: 25 } }, 'retry', 'AI 请求超时'],
  [{ code: 'error.requestTimeout' }, 'retry', 'AI 请求超时'],
  [{ code: 'error.aiHttp', params: { status: 400, detail: 'maximum context length exceeded' } }, 'settings', '输入内容过长'],
  [{ code: 'error.aiHttp', params: { status: 429, detail: 'rate limit exceeded' } }, 'retry', 'AI 请求受限'],
  [{ code: 'error.aiHttp', params: { status: 401, detail: 'Invalid API key' } }, 'settings', 'AI 鉴权失败'],
  [{ code: 'error.aiHttp', params: { status: 503, detail: 'unavailable' } }, 'retry', 'AI 服务暂不可用'],
  [{ code: 'error.aiScoreParse' }, 'retry', 'AI 返回格式异常'],
  ['Failed to fetch', 'retry', '无法连接 AI 服务'],
  ['Something unexpected', 'retry', 'AI 判断失败'],
])('explains %j without confusing causes', (error, action, summary) => {
  expect(describeAiError(error)).toMatchObject({ action, summary })
})

it('keeps diagnostics and does not infer long context from a timeout', () => {
  const result = describeAiError({ code: 'error.aiTimeout', params: { seconds: 25 } })
  expect(result.detail).toContain('25')
  expect(result.guidance).toContain('不能据此判断')
  expect(describeAiError({ code: 'error.aiHttp', params: { status: 400, detail: 'bad request' } }).summary).toBe('AI 判断失败')
})

it('supports English and renders provider text only as diagnostic data', () => {
  expect(describeAiError('Extension context invalidated.', 'en')).toMatchObject({ action: 'refresh', summary: 'Extension connection expired' })
  expect(describeAiError('<img src=x onerror=alert(1)>').detail).toBe('<img src=x onerror=alert(1)>')
})
