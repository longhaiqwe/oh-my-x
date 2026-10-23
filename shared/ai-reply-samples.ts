// 回复区 AI 打分的样例集：设置页「用样例集测试」、npm run test:live、单测共用。
// 判定和 test:live 一致：分数 ≥ 70 算 AI，≤ 30 算真人，31–69 算不确定。
import samples from './ai-reply-samples.json'
import type { ReplyScore, ReplyScoreItem, ReplyScoreParent } from './ai-reply-score'
import type { Locale } from './i18n'
import type { StoredReplyLabel } from './reply-score-db'

export interface SampleReply extends ReplyScoreItem {
  expect: 'ai' | 'human'
}

export interface SampleThread {
  id: string
  locale: Locale
  parent: ReplyScoreParent
  replies: SampleReply[]
}

export const REPLY_SCORE_SAMPLE_THREADS = samples.threads as SampleThread[]

export type SampleVerdict = 'ai' | 'human' | 'unsure' | 'missing'

export function sampleVerdict(score: number | undefined | null): SampleVerdict {
  if (score == null) return 'missing'
  return score >= 70 ? 'ai' : score <= 30 ? 'human' : 'unsure'
}

export interface SampleRow {
  id: string
  threadId: string
  text: string
  expect: 'ai' | 'human'
  score: number | null
  signals: string[]
  reason: string
  verdict: SampleVerdict
  matched: boolean
}

export interface SampleRunSummary {
  total: number
  matched: number
  aiTotal: number
  aiMatched: number
  humanTotal: number
  humanMatched: number
  unsure: number
  missing: number
  rows: SampleRow[]
}

/** 把每段对话的打分结果和预期对照；还没跑到的对话不计入 */
export function summarizeSampleRun(threads: SampleThread[], scoresByThread: Map<string, ReplyScore[]>): SampleRunSummary {
  const summary: SampleRunSummary = { total: 0, matched: 0, aiTotal: 0, aiMatched: 0, humanTotal: 0, humanMatched: 0, unsure: 0, missing: 0, rows: [] }
  for (const thread of threads) {
    const scores = scoresByThread.get(thread.id)
    if (!scores) continue
    const byId = new Map(scores.map((s) => [s.id, s]))
    for (const reply of thread.replies) {
      const result = byId.get(reply.id)
      const verdict = sampleVerdict(result?.score)
      const matched = verdict === reply.expect
      summary.total += 1
      if (matched) summary.matched += 1
      if (reply.expect === 'ai') {
        summary.aiTotal += 1
        if (matched) summary.aiMatched += 1
      } else {
        summary.humanTotal += 1
        if (matched) summary.humanMatched += 1
      }
      if (verdict === 'unsure') summary.unsure += 1
      if (verdict === 'missing') summary.missing += 1
      summary.rows.push({
        id: reply.id,
        threadId: thread.id,
        text: reply.text,
        expect: reply.expect,
        score: result?.score ?? null,
        signals: result?.signals ?? [],
        reason: result?.reason ?? '',
        verdict,
        matched,
      })
    }
  }
  return summary
}

/**
 * 导出标注：每行一条 JSON（JSONL）。字段和样例集对得上（expect：bot 记成 ai，human 记成 human），
 * 挑出来改写后可以并入样例集；原文是别人的回复，不要原样提交到公开仓库。
 */
export function labelsToJsonl(labels: StoredReplyLabel[]): string {
  return labels
    .map((entry) => JSON.stringify({
      id: entry.id,
      expect: entry.label === 'bot' ? 'ai' : 'human',
      label: entry.label,
      author: entry.author,
      text: entry.text,
      delaySeconds: entry.delaySeconds,
      followers: entry.followers,
      verified: entry.verified,
      parent: { author: entry.parentAuthor, text: entry.parentText },
      ...(entry.replyTo ? { replyTo: entry.replyTo } : {}),
      ai: entry.ai,
      labeledAt: new Date(entry.labeledAt).toISOString(),
    }))
    .join('\n') + (labels.length ? '\n' : '')
}
