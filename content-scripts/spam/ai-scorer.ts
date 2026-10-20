// 回复区 AI 打分的页面侧队列：先批量查缓存，没命中且在自动判断范围内的回复攒成一批发给后台。
// - 查缓存攒 300ms；送模型攒 2 秒或满 20 条
// - 同一页面同时只有一个打分请求；切换页面时清空队列并取消请求
// - 出错、没配置、达到每日上限时暂停自动判断，设置改动后（reset）重新开始
// 结果按推文 ID 存在内存里，X 重建推文元素后按 ID 重新套用。
import {
  REPLY_SCORE_BATCH_SIZE,
  type ReplyScore,
  type ReplyScoreItem,
  type ReplyScoreParent,
  type ReplyScoreSignal,
} from '../../shared/ai-reply-score'
import { REPLY_SCORE_LOOKUP, sendAiRequest, type AiRequest, type AiResponse } from '../../shared/ai-request'
import { isErrorPayload, toTransferable, type TransferableError } from '../../shared/errors'
import { getLocale } from '../../shared/i18n'
import { getTodayKey } from '../../shared/spam-logger'

export type AiPauseReason = 'limit' | 'needsConfig' | 'error'

/** 一条回复当前的 AI 判断状态 */
export type AiDisplay =
  | { status: 'done'; score: number; signals: ReplyScoreSignal[]; reason: string }
  | { status: 'pending' }
  /** 不在自动判断范围内，缓存里也没有 */
  | { status: 'manual' }
  /** 已经试过 MAX_ATTEMPTS 次 */
  | { status: 'failed' }
  | { status: 'paused'; reason: AiPauseReason; error?: TransferableError }

type ScoreMessage = Extract<AiRequest, { type: 'XF_SCORE_REPLIES' }>

export interface AiScorerDeps {
  lookup(ids: string[]): Promise<ReplyScore[]>
  score(message: ScoreMessage, signal: AbortSignal): Promise<AiResponse>
  today(): string
  path(): string
}

export const AI_LOOKUP_DELAY_MS = 300
export const AI_SCORE_DELAY_MS = 2_000
export const AI_MAX_ATTEMPTS = 2
const LOOKUP_CHUNK = 200
// 这些错误要用户去改设置，自动重试没有用
const NEEDS_CONFIG_CODES = new Set(['error.aiNoKey', 'error.aiNoModel', 'error.aiNotAuthorized', 'error.aiBadUrl'])

const PENDING: AiDisplay = { status: 'pending' }

interface QueueEntry {
  item: ReplyScoreItem
  parent: ReplyScoreParent
  auto: boolean
}

const defaultDeps: AiScorerDeps = {
  async lookup(ids) {
    const res = await browser.runtime.sendMessage({ type: REPLY_SCORE_LOOKUP, ids })
    return res?.ok && Array.isArray(res.scores) ? res.scores : []
  },
  score: sendAiRequest,
  today: getTodayKey,
  path: () => location.pathname,
}

export function createAiScorer(deps: AiScorerDeps = defaultDeps) {
  const results = new Map<string, ReplyScore>()
  const lookedUp = new Set<string>()
  const attempts = new Map<string, number>()
  const lookupQueue = new Map<string, QueueEntry>()
  const scoreQueue = new Map<string, QueueEntry>()
  const inFlight = new Set<string>()
  const listeners = new Set<() => void>()
  let paused: { reason: AiPauseReason; error?: TransferableError; day: string } | null = null
  let lookupTimer: ReturnType<typeof setTimeout> | null = null
  let scoreTimer: ReturnType<typeof setTimeout> | null = null
  let controller: AbortController | null = null
  let lastPath: string | null = null
  let version = 0

  function changed() {
    version++
    for (const listener of [...listeners]) listener()
  }

  function clearQueues() {
    if (lookupTimer) clearTimeout(lookupTimer)
    if (scoreTimer) clearTimeout(scoreTimer)
    lookupTimer = scoreTimer = null
    lookupQueue.clear()
    scoreQueue.clear()
    inFlight.clear()
    controller?.abort()
    controller = null
  }

  function checkNavigation() {
    const path = deps.path()
    if (lastPath !== null && path !== lastPath) clearQueues()
    lastPath = path
  }

  function pause(reason: AiPauseReason, error?: TransferableError) {
    paused = { reason, error, day: deps.today() }
  }

  function pauseForError(error: TransferableError | undefined) {
    const code = isErrorPayload(error) ? error.code : ''
    pause(NEEDS_CONFIG_CODES.has(code) ? 'needsConfig' : 'error', error)
  }

  function tryEnqueue(entry: QueueEntry): AiDisplay {
    const { id } = entry.item
    if (!entry.auto) return { status: 'manual' }
    if ((attempts.get(id) ?? 0) >= AI_MAX_ATTEMPTS) return { status: 'failed' }
    // 每日上限到了第二天自动解除
    if (paused?.reason === 'limit' && paused.day !== deps.today()) paused = null
    if (paused) return { status: 'paused', reason: paused.reason, error: paused.error }
    scoreQueue.set(id, entry)
    scheduleScore()
    return PENDING
  }

  function scheduleLookup() {
    if (!lookupTimer) lookupTimer = setTimeout(() => void flushLookup(), AI_LOOKUP_DELAY_MS)
  }

  async function flushLookup() {
    lookupTimer = null
    const entries = [...lookupQueue.values()]
    lookupQueue.clear()
    if (!entries.length) return
    for (let i = 0; i < entries.length; i += LOOKUP_CHUNK) {
      const chunk = entries.slice(i, i + LOOKUP_CHUNK)
      let found: ReplyScore[] = []
      try {
        found = await deps.lookup(chunk.map((e) => e.item.id))
      } catch (error) {
        // 插件更新后旧页面连不上后台；当作没有缓存
        console.debug('[oh-my-x] AI 打分缓存查询失败', error)
      }
      for (const score of found) results.set(score.id, score)
      for (const entry of chunk) {
        lookedUp.add(entry.item.id)
        if (!results.has(entry.item.id)) tryEnqueue(entry)
      }
    }
    changed()
  }

  function scheduleScore() {
    if (controller) return // 当前请求结束后会再排
    if (scoreQueue.size >= REPLY_SCORE_BATCH_SIZE) {
      if (scoreTimer) clearTimeout(scoreTimer)
      scoreTimer = null
      void flushScore()
      return
    }
    if (!scoreTimer) {
      scoreTimer = setTimeout(() => {
        scoreTimer = null
        void flushScore()
      }, AI_SCORE_DELAY_MS)
    }
  }

  async function flushScore() {
    if (controller || paused || !scoreQueue.size) return
    // 同一批只放同一个主帖下的回复（Deck 可能同时开着几个对话栏）
    const first = scoreQueue.values().next().value as QueueEntry
    const batch = [...scoreQueue.values()]
      .filter((e) => e.parent.id === first.parent.id)
      .slice(0, REPLY_SCORE_BATCH_SIZE)
    for (const entry of batch) {
      scoreQueue.delete(entry.item.id)
      inFlight.add(entry.item.id)
    }
    const own = new AbortController()
    controller = own
    const countAttempt = () => {
      for (const entry of batch) {
        if (!results.has(entry.item.id)) attempts.set(entry.item.id, (attempts.get(entry.item.id) ?? 0) + 1)
      }
    }
    try {
      const res = await deps.score(
        { type: 'XF_SCORE_REPLIES', parent: first.parent, replies: batch.map((e) => e.item), mode: 'auto', locale: getLocale() },
        own.signal,
      )
      if (own.signal.aborted) return
      if (res.ok) {
        for (const score of res.scores ?? []) results.set(score.id, score)
        if (res.limitReached) pause('limit')
        else countAttempt()
      } else {
        pauseForError(res.error)
        countAttempt()
      }
    } catch (error) {
      if (own.signal.aborted) return // 切换页面时取消的
      pauseForError(toTransferable(error, 'error.aiFailed'))
      countAttempt()
    } finally {
      if (controller === own) {
        controller = null
        for (const entry of batch) inFlight.delete(entry.item.id)
        changed()
        if (scoreQueue.size && !paused) scheduleScore()
      }
    }
  }

  return {
    /**
     * 取一条回复的 AI 判断状态；还没有结果时按需排队查缓存或送模型。
     * auto：这条回复在自动判断范围内。不在范围内的只查缓存。
     */
    request(item: ReplyScoreItem, parent: ReplyScoreParent, auto: boolean): AiDisplay {
      checkNavigation()
      const done = results.get(item.id)
      if (done) return { status: 'done', score: done.score, signals: done.signals, reason: done.reason }
      // 还在排队的用最新扫描到的数据替换：粉丝数可能比正文晚拿到
      const queued = lookupQueue.get(item.id) ?? scoreQueue.get(item.id)
      if (queued) {
        queued.item = item
        return PENDING
      }
      if (inFlight.has(item.id)) return PENDING
      const entry = { item, parent, auto }
      if (!lookedUp.has(item.id)) {
        lookupQueue.set(item.id, entry)
        scheduleLookup()
        return PENDING
      }
      return tryEnqueue(entry)
    },
    /** 结果或状态每变一次加 1；扫描器用它判断调试条要不要重画 */
    version: () => version,
    onChange(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    /** 设置改动后：解除暂停，失败次数清零 */
    reset() {
      paused = null
      attempts.clear()
      changed()
    },
    /** 关闭 AI 判断：清空队列，取消进行中的请求 */
    stop() {
      clearQueues()
    },
  }
}

export type AiScorer = ReturnType<typeof createAiScorer>

export const aiScorer = createAiScorer()
