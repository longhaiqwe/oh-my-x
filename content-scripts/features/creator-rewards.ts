import { ACCOUNT_OVERVIEW_QUERY_TYPE, CREATOR_REWARDS_TYPE, XF_BRIDGE_MARKER } from '../../shared/bridge'
import { KeyAccountOverviewQueryId } from '../../storage-keys'
import { getStorage, setStorage } from '../utilities/storage'
import { persistCreatorRewardsObservation } from '../../shared/creator-rewards-daily'
import {
  parseCreatorRewardsObservation,
  parseCreatorRewardsPageState,
  type CreatorRewardsStats,
  type CreatorRewardsObservation,
} from '../../shared/creator-rewards'

let isListening = false

function saveObservation(observation: CreatorRewardsObservation) {
  persistCreatorRewardsObservation(observation).catch(() => {
    // 扩展上下文失效等情况下忽略
  })
}

async function saveAccountOverviewQueryId(queryId: unknown) {
  if (typeof queryId !== 'string' || !/^[A-Za-z0-9_-]{10,64}$/.test(queryId)) return
  if ((await getStorage(KeyAccountOverviewQueryId)) === queryId) return
  await setStorage({ [KeyAccountOverviewQueryId]: queryId })
}

/**
 * 监听来自 MAIN world 拦截器广播的创作者奖励指标数据并写入本地存储
 */
export function listenForCreatorRewardsApi() {
  if (isListening) return
  isListening = true

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    if (!event.data || event.data.__xf !== XF_BRIDGE_MARKER) return

    if (event.data.type === ACCOUNT_OVERVIEW_QUERY_TYPE) {
      void saveAccountOverviewQueryId(event.data.queryId)
      return
    }
    if (event.data.type !== CREATOR_REWARDS_TYPE) return

    try {
      const payload = event.data.payload as CreatorRewardsObservation | CreatorRewardsStats
      if (!payload || typeof payload !== 'object') return
      if ('kind' in payload) {
        if (payload.kind === 'progress') {
          if (payload.stats?.impressionsCount > 0) saveObservation(payload)
        } else {
          const state = parseCreatorRewardsPageState({ ...payload, stage: payload.kind })
          if (state?.stage === 'active') {
            const { stage, ...payout } = state
            saveObservation({ kind: stage, ...payout })
          } else if (state?.stage === 'application' || state?.stage === 'under_review') {
            saveObservation({ kind: state.stage, updatedAt: state.updatedAt })
          }
        }
      } else if (payload.impressionsCount > 0) {
        // 更新前已打开的 X 页仍可能广播旧格式；零值不能覆盖已保存的读数。
        saveObservation({ kind: 'progress', stats: payload })
      }
    } catch {
      // 忽略落库异常
    }
  })
}

/**
 * 在页面 DOM 渲染时，若当前处于创作者奖励页面，直接从 DOM 中提取进度与指标作为双重保险
 */
export function scanCreatorRewardsFromDom(): boolean {
  if (typeof window === 'undefined') return false
  if (!window.location.pathname.includes('creators/original_content_rewards')) {
    return false
  }

  try {
    const observation = parseCreatorRewardsObservation(document.body.innerText || '')
    if (observation) {
      saveObservation(observation)
      return true
    }
  } catch {
    // 忽略 DOM 解析异常
  }

  return false
}
