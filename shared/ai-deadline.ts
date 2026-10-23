// AI 请求的超时：按「多久没有新数据」算，不按固定总时长算。
// - 第一段数据 25 秒内要到（扩展后台收不到响应超过 30 秒可能被关掉）；不流式的请求整段返回才算第一段，和以前一样是 25 秒。
// - 之后每收到一段数据重新计时，连续 15 秒没有新数据才中断。
// - 从开始算最长 90 秒。
// 流式请求一边收一边显示结果，模型慢一点也不会在中途被切断。方案见 docs/plans/ai-reply-scoring.md 4.3。
import { AppError } from './errors'

export const AI_FIRST_DATA_TIMEOUT_MS = 25_000
export const AI_IDLE_TIMEOUT_MS = 15_000
export const AI_MAX_DURATION_MS = 90_000

// 收到数据的地方（读流式响应）只拿得到中止信号，按信号找到对应的计时器
const activityBySignal = new WeakMap<AbortSignal, () => void>()

/** 读响应时每收到一段数据调用一次；这个信号没有计时器时什么也不做 */
export function reportAiActivity(signal: AbortSignal) {
  activityBySignal.get(signal)?.()
}

/**
 * 给一个请求开始计时：超时后用 AppError 中止 controller。
 * 返回 stop，请求结束时调用。
 */
export function startAiDeadline(controller: AbortController, now: () => number = Date.now): () => void {
  const startedAt = now()
  let timer: ReturnType<typeof setTimeout> | undefined
  const arm = (ms: number, error: AppError) => {
    clearTimeout(timer)
    timer = setTimeout(() => controller.abort(error), Math.max(0, ms))
  }
  const touch = () => {
    const left = AI_MAX_DURATION_MS - (now() - startedAt)
    if (left <= AI_IDLE_TIMEOUT_MS) arm(left, new AppError('error.aiTimeout', { seconds: AI_MAX_DURATION_MS / 1000 }))
    else arm(AI_IDLE_TIMEOUT_MS, new AppError('error.aiStalled', { seconds: AI_IDLE_TIMEOUT_MS / 1000 }))
  }
  arm(AI_FIRST_DATA_TIMEOUT_MS, new AppError('error.aiTimeout', { seconds: AI_FIRST_DATA_TIMEOUT_MS / 1000 }))
  activityBySignal.set(controller.signal, touch)
  return () => {
    clearTimeout(timer)
    activityBySignal.delete(controller.signal)
  }
}
