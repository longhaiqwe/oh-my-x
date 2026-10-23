// 显式设置 AI_STREAM_CONFIG 为本地配置 JSON 路径才会发请求。
// JSON 字段：baseUrl、apiKey、model。不要提交配置文件，也不要把密钥写进命令行。
// AI_STREAM_CONFIG=/path/to/private.json npm run test:live -- test/live/ai-stream-timing.live.ts
// 可选 AI_STREAM_BATCH_SIZE=20，测试满批；默认 3 条。
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { buildReplyScoreMessages, createReplyScoreStreamParser, parseReplyScoreResponse } from '../../shared/ai-reply-score'
import { resolveChatCompletionsUrl } from '../../shared/ai-repost'
import { readChatCompletionStream } from '../../shared/ai-stream'

describe.skipIf(!process.env.AI_STREAM_CONFIG)('当前 AI 服务流式计时（真实接口）', () => {
  it('用模拟回复测首段文本、首条评分和总耗时', async () => {
    const config = JSON.parse(await readFile(process.env.AI_STREAM_CONFIG!, 'utf8'))
    for (const field of ['baseUrl', 'apiKey', 'model']) {
      if (typeof config[field] !== 'string' || !config[field].trim()) throw new Error(`配置缺少 ${field}`)
    }
    const endpoint = resolveChatCompletionsUrl(config.baseUrl.trim())
    const host = new URL(endpoint).hostname
    const parent = { id: 'timing-parent', author: 'sample', text: '做了一个浏览器扩展，自动把评论分类。之前要等全部评论处理完才显示，现在希望每完成一条就显示一条。' }
    const replies = [
      { id: 'timing-1', author: 'alice', text: '我之前做图片上传也遇到过，改成每张上传完就显示缩略图，用户就不觉得卡了。', delaySeconds: 90 },
      { id: 'timing-2', author: 'bob', text: '这个思路很有价值！从等待全部处理到逐条显示，不仅提升效率，也优化了用户体验。期待更多创新！', delaySeconds: 15 },
      { id: 'timing-3', author: 'carol', text: '能显示进度就行，别把我正在看的那条突然藏起来😂', delaySeconds: 160 },
    ]
    if (process.env.AI_STREAM_BATCH_SIZE === '20') {
      const extra = [
        '一条条显示会不会导致页面一直跳？我看评论最烦这个了。',
        '从批量等待到实时反馈，这种细节优化正是产品竞争力的体现。',
        '我写过类似的，用 SSE，每个对象解析完整再更新，别按 token 更新列表。',
        '期待上线，支持一下！',
        '分类错了能撤回吗？我经常写短评，怕被当机器人。',
        '这不仅是一次交互升级，更是对用户注意力的尊重，值得所有开发者借鉴。',
        '手机网页版能用不',
        '我们去年做过测量，超过 3 秒没反馈用户就开始重复点按钮。',
        '每条后面放个正在判断的小圆圈就行。',
        '支持！持续优化用户体验，才能在激烈竞争中脱颖而出！',
        '我一般先看原文再看评论，能别默认折叠么',
        '网络断了已完成的结果还在吗？',
        '逐条反馈让等待变得可见，这个改动抓住了用户体验的核心。可以考虑加入进度条。',
        '刚试了我的扩展，页面切换后旧请求还在跑，白花了不少钱😅',
        '你用哪个模型？我本地跑小模型经常把真人长评判错。',
        '界面不卡就挺好了，准确率更重要吧',
        '哈哈我也是先做完功能才发现等半天没反应，最后加了个计数器',
      ]
      replies.push(...extra.map((text, index) => ({ id: `timing-${index + 4}`, author: `sample-${index + 4}`, text, delaySeconds: 30 + index * 17 })))
    }
    const ids = replies.map(reply => reply.id)
    const started = performance.now()
    const elapsed = () => Math.round(performance.now() - started)
    const scores: { id: string; ms: number }[] = []
    let headersMs: number | null = null
    let firstTextMs: number | null = null
    let deltas = 0
    let status: number | null = null
    let contentType = ''
    let failure: string | null = null
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25_000)
    try {
      const response = await fetch(endpoint, {
        method: 'POST', credentials: 'omit', redirect: 'error', signal: controller.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey.trim()}` },
        body: JSON.stringify({ model: config.model.trim(), temperature: 0, stream: true,
          messages: buildReplyScoreMessages(parent, replies, 'zh-CN'),
          ...(['api.openai.com', 'api.deepseek.com'].includes(host) ? { response_format: { type: 'json_object' } } : {}),
        }),
      })
      headersMs = elapsed()
      status = response.status
      contentType = response.headers.get('content-type') ?? ''
      if (!response.ok) { await response.body?.cancel(); throw new Error(`HTTP ${status}`) }
      if (contentType.includes('text/event-stream')) {
        const push = createReplyScoreStreamParser(ids, score => { scores.push({ id: score.id, ms: elapsed() }) })
        await readChatCompletionStream(response, controller.signal, delta => {
          firstTextMs ??= elapsed()
          deltas++
          push(delta)
        })
      } else {
        const json = await response.json()
        const content = json.choices?.[0]?.message?.content ?? ''
        firstTextMs = elapsed()
        for (const score of parseReplyScoreResponse(content, ids)) scores.push({ id: score.id, ms: elapsed() })
      }
    } catch {
      // 仅输出状态，不打印响应正文或可能含认证信息的原始异常。
      failure = controller.signal.aborted ? 'timeout_25s' : status && status >= 400 ? `HTTP_${status}` : 'request_or_parse_failed'
    } finally { clearTimeout(timer) }
    console.log(JSON.stringify({ host, model: config.model.trim(), count: replies.length, status, contentType,
      headersMs, firstTextMs, scores, deltas, totalMs: elapsed(), failure }, null, 2))
    expect(failure).toBeNull()
    expect(scores).toHaveLength(replies.length)
  })
})
