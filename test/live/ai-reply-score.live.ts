// 用真实接口给 shared/ai-reply-samples.json 打分，对照每条的预期，记录耗时和用量。会产生费用。
// 插件设置页的「用样例集测试」做的是同一件事，用的是插件里「AI 总结转发」的配置。
//
// 运行（key 只从环境变量读，不要写进任何文件）：
//   AI_API_KEY=你的Key AI_MODEL=模型名 AI_BASE_URL=https://api.deepseek.com/v1 npm run test:live
// 可选：AI_JSON_MODE=1 请求带 response_format: json_object（服务支持时）
import { describe, expect, it } from 'vitest'
import { buildReplyScoreMessages, parseReplyScoreResponse } from '../../shared/ai-reply-score'
import { REPLY_SCORE_SAMPLE_THREADS as threads, sampleVerdict as verdict } from '../../shared/ai-reply-samples'
import { resolveChatCompletionsUrl } from '../../shared/ai-repost'

const { AI_API_KEY = '', AI_MODEL = '', AI_BASE_URL = 'https://api.openai.com/v1', AI_JSON_MODE = '' } = process.env

describe.skipIf(!AI_API_KEY || !AI_MODEL)('AI 打分样例集（真实接口）', () => {
  it('逐段对话打分并对照预期', async () => {
    const lines: string[] = [`接口 ${resolveChatCompletionsUrl(AI_BASE_URL)}，模型 ${AI_MODEL}`]
    let matched = 0
    let total = 0
    let promptTokens = 0
    let completionTokens = 0
    let missing = 0

    for (const thread of threads) {
      const startedAt = Date.now()
      const res = await fetch(resolveChatCompletionsUrl(AI_BASE_URL), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${AI_API_KEY}` },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: buildReplyScoreMessages(thread.parent, thread.replies, thread.locale),
          temperature: 0,
          ...(AI_JSON_MODE ? { response_format: { type: 'json_object' } } : {}),
        }),
      })
      const json: any = await res.json()
      expect(res.ok, JSON.stringify(json).slice(0, 300)).toBe(true)
      promptTokens += json.usage?.prompt_tokens ?? 0
      completionTokens += json.usage?.completion_tokens ?? 0
      const scores = new Map(parseReplyScoreResponse(String(json.choices?.[0]?.message?.content ?? ''), thread.replies.map((r) => r.id)).map((s) => [s.id, s]))
      lines.push('', `[${thread.id}] ${((Date.now() - startedAt) / 1000).toFixed(1)} 秒，${thread.replies.length} 条`)
      for (const reply of thread.replies) {
        const result = scores.get(reply.id)
        const got = verdict(result?.score)
        const ok = got === reply.expect
        total += 1
        if (ok) matched += 1
        if (got === 'missing') missing += 1
        lines.push(`  ${ok ? '✓' : '✗'} ${reply.id} 预期 ${reply.expect}，得分 ${result?.score ?? '无'} ${result?.signals.join(',') ?? ''} ${result?.reason ?? ''}`)
      }
    }

    lines.push('', `相符 ${matched}/${total}，缺结果 ${missing} 条；用量：输入 ${promptTokens} token，输出 ${completionTokens} token（服务没返回用量时为 0）`)
    console.log(lines.join('\n'))
    expect(missing).toBe(0)
  })
})
