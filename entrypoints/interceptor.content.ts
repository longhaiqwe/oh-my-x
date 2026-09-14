/**
 * MAIN world 数据拦截器（唯一入口）。
 *
 * 在 document_start 只安装一次 window.fetch / XMLHttpRequest 钩子，按 URL 分流：
 *   - FetchScheduledTweets → 排期数据（postMessage + sessionStorage 条目快照）
 *
 * 安全/隐蔽原则：
 * - 只读不改：clone 响应后再解析，绝不修改原始 Response / XHR 结果
 * - 零日志：默认静默；仅当 window.__XF_DEBUG_SCHEDULED__ = true 时输出排查信息
 * - 最小开销：先做 URL 字符串判断，命中且 response.ok 才 clone + 解析
 * - 静默失败：所有异常吞掉，绝不影响 X 页面自身逻辑
 *
 * 注意：MAIN world 无法直接访问 browser.storage，排期走 window.postMessage，
 * 由 isolated world 的监听器（initialize.ts 注册）落库。
 */
import { XF_BRIDGE_MARKER, SCHEDULED_TWEETS_TYPE } from '../shared/bridge'

export default defineContentScript({
  matches: [
    'https://twitter.com/*',
    'https://mobile.twitter.com/*',
    'https://x.com/*',
    'https://pro.x.com/*',
  ],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    // 扩展总开关：MAIN world 无法读 storage，由 isolated world 通过 postMessage 通知。
    // 默认 true 兼容现有行为（document_start 时还不知道开关状态）；收到关闭通知后停用拦截。
    let interceptEnabled = true

    const SCHEDULED_RAW_KEY = 'xf_scheduled_raw_last'
    const SCHEDULED_ITEMS_KEY = 'xf_scheduled_items_last'
    const DEBUG_FLAG = '__XF_DEBUG_SCHEDULED__'

    // 上次已广播的排期 payload，内容没变就不重复广播，减少 postMessage 与 storage 写入
    let lastScheduledPosted = ''

    function debug(...args: unknown[]) {
      try {
        if ((window as unknown as Record<string, unknown>)[DEBUG_FLAG]) {
          console.log('[X Focus 拦截器]', ...args)
        }
      } catch {
        // ignore
      }
    }

    // 扩展总开关状态由 isolated world 通过 postMessage 推送（MAIN world 无法读 storage）。
    // 带 XF_BRIDGE_MARKER 防止页面其他脚本伪造状态消息。
    window.addEventListener('message', (event) => {
      if (event.source !== window) return
      const data = event.data
      if (
        data &&
        typeof data === 'object' &&
        data.__xf === XF_BRIDGE_MARKER &&
        data.type === 'XF_EXTENSION_STATUS'
      ) {
        interceptEnabled = data.enabled === true
        debug('拦截器状态:', interceptEnabled ? '启用' : '停用')
      }
    })

    // ---------- URL 命中判断（大小写不敏感，避免漏接 X 改动 operation 名大小写） ----------
    const isScheduledUrl = (url: string) => {
      const lower = url.toLowerCase()
      return (
        lower.includes('fetchscheduledtweets') ||
        lower.includes('scheduledtweets') ||
        (lower.includes('/graphql/') && lower.includes('scheduled'))
      )
    }

    // ---------- 排期提取 ----------
    type RawScheduledItem = {
      rest_id?: string
      restId?: string
      scheduling_info?: { execute_at?: number; state?: string }
      schedulingInfo?: { execute_at?: number; state?: string }
      execute_at?: number
      tweet_create_request?: { status?: string }
      tweetCreateRequest?: { status?: string }
      status?: string
    }

    /**
     * 从 GraphQL 响应中提取排期列表。
     * 先试官方路径 data.viewer.scheduled_tweet_list，再试常见变体，
     * 最后做一次有节点上限的深度兜底查找，避免 X 改字段路径后完全失效。
     */
    function extractScheduledItems(
      data: unknown,
    ): Array<{ restId: string; timestamp: number; text: string }> | null {
      if (!data || typeof data !== 'object') return null

      const root = data as Record<string, any>
      const candidates: unknown[] = [
        root?.data?.viewer?.scheduled_tweet_list,
        root?.data?.viewer_v2?.scheduled_tweet_list,
        root?.data?.scheduled_tweet_list,
      ]
      let list: unknown = candidates.find((c) => Array.isArray(c)) ?? null

      if (!Array.isArray(list)) {
        // 深度兜底：任意层级找 scheduled_tweet_list / scheduledTweetList 数组（限制遍历节点数）
        const found: unknown[] = []
        const seen = new Set<unknown>()
        let budget = 5000
        const walk = (node: unknown) => {
          if (budget <= 0 || !node || typeof node !== 'object' || seen.has(node)) return
          seen.add(node)
          budget--
          if (Array.isArray(node)) {
            node.forEach(walk)
            return
          }
          const obj = node as Record<string, unknown>
          for (const [k, v] of Object.entries(obj)) {
            if ((k === 'scheduled_tweet_list' || k === 'scheduledTweetList') && Array.isArray(v)) {
              found.push(...v)
            }
            walk(v)
          }
        }
        walk(data)
        list = found.length > 0 ? found : null
      }

      if (!Array.isArray(list)) return null

      const items = (list as RawScheduledItem[])
        .filter(
          (item) =>
            item?.scheduling_info?.state === 'Scheduled' || item?.schedulingInfo?.state === 'Scheduled',
        )
        .map((item) => ({
          restId: item.rest_id ?? item.restId ?? '',
          timestamp:
            item.scheduling_info?.execute_at ?? item.schedulingInfo?.execute_at ?? item.execute_at ?? 0,
          text: item.tweet_create_request?.status ?? item.tweetCreateRequest?.status ?? item.status ?? '',
        }))
        .filter(
          (item) => typeof item.timestamp === 'number' && !isNaN(item.timestamp) && item.timestamp > 0,
        )

      return items
    }

    function handleScheduled(data: unknown) {
      try {
        const items = extractScheduledItems(data)
        if (!items) return

        const payload = JSON.stringify(items)
        if (payload === lastScheduledPosted) {
          debug('排期数据未变化，跳过广播（当前', items.length, '条）')
          return
        }
        lastScheduledPosted = payload

        // 原始响应便于 DevTools 核对结构；条目快照供 isolated world 链路丢失时回退
        try {
          sessionStorage.setItem(SCHEDULED_RAW_KEY, JSON.stringify(data))
        } catch {
          // ignore
        }
        try {
          sessionStorage.setItem(SCHEDULED_ITEMS_KEY, payload)
        } catch {
          // ignore
        }

        // 携带桥接标记，isolated world 监听端校验 source + type + 标记后才会落库
        window.postMessage(
          { type: SCHEDULED_TWEETS_TYPE, payload: items, __xf: XF_BRIDGE_MARKER },
          '*',
        )
        debug('已广播排期数据', items.length, '条', items)
      } catch (e) {
        debug('排期解析/发送失败', e)
      }
    }

    function route(url: string, data: unknown) {
      if (!data) return
      // 排期：URL 命中后仍由 extractScheduledItems 做结构校验，非排期响应自然落空
      if (isScheduledUrl(url)) handleScheduled(data)
    }

    // ---------- Hook window.fetch ----------
    const originalFetch = window.fetch.bind(window)
    window.fetch = async function (...args: Parameters<typeof fetch>): Promise<Response> {
      const response = await originalFetch(...args)
      // 扩展关闭后不再拦截解析，直接透传响应
      if (!interceptEnabled) return response
      try {
        // 非 2xx 响应不含业务数据，直接跳过，避免无谓的 clone + 解析开销
        if (!response.ok) return response
        const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request)?.url ?? ''
        // 命中才 clone，绝不盲目解析所有 graphql 响应
        if (isScheduledUrl(url)) {
          const cloned = response.clone()
          cloned
            .json()
            .then((data) => route(url, data))
            .catch(() => {})
        }
      } catch {
        // 拦截出错静默忽略，不影响原始请求
      }
      return response
    }

    // ---------- Hook XMLHttpRequest（备用通道） ----------
    const originalOpen = XMLHttpRequest.prototype.open
    const originalSend = XMLHttpRequest.prototype.send

    XMLHttpRequest.prototype.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ): void {
      ;(this as XMLHttpRequest & { __xfUrl?: string }).__xfUrl = String(url)
      // XHR open 的 async 参数默认 true，显式补上避免 undefined 传入
      return originalOpen.call(this, method, url, async ?? true, username, password)
    }

    XMLHttpRequest.prototype.send = function (
      this: XMLHttpRequest,
      ...args: Parameters<XMLHttpRequest['send']>
    ): void {
      const xhr = this as XMLHttpRequest & { __xfUrl?: string; __xfHooked?: boolean }
      // 防止同一个 XHR 对象被复用 send 多次时重复挂载 load 监听
      if (!xhr.__xfHooked) {
        xhr.__xfHooked = true
        this.addEventListener('load', function (this: XMLHttpRequest) {
          if (!interceptEnabled) return
          try {
            const url = (this as XMLHttpRequest & { __xfUrl?: string }).__xfUrl || ''
            if (!isScheduledUrl(url) || !this.responseText) return
            route(url, JSON.parse(this.responseText))
          } catch {
            // 静默忽略
          }
        })
      }
      return originalSend.apply(this, args)
    }
  },
})
