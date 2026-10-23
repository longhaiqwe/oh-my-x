import { CREATE_DRAFT_QUERY_TYPE, XF_BRIDGE_MARKER } from '../../shared/bridge'
import { KeyCreateDraftQueryId } from '../../storage-keys'
import { getStorage, setStorage } from '../utilities/storage'

let isListening = false

async function saveCreateDraftQueryId(queryId: unknown) {
  if (typeof queryId !== 'string' || !/^[A-Za-z0-9_-]{10,64}$/.test(queryId)) return
  if ((await getStorage(KeyCreateDraftQueryId)) === queryId) return
  await setStorage({ [KeyCreateDraftQueryId]: queryId })
}

/**
 * X 页面自己存草稿时，拦截器广播当时的接口编号；写进存储，后台右键存草稿时优先用这个编号
 */
export function listenForCreateDraftQueryId() {
  if (isListening) return
  isListening = true

  window.addEventListener('message', (event) => {
    if (event.source !== window || event.origin !== location.origin) return
    if (!event.data || event.data.__xf !== XF_BRIDGE_MARKER || event.data.type !== CREATE_DRAFT_QUERY_TYPE) return
    void saveCreateDraftQueryId(event.data.queryId).catch(() => {
      // 扩展上下文失效等情况下忽略
    })
  })
}
