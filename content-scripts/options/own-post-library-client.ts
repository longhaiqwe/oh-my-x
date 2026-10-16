import { KeyOwnPostAutoSync } from '../../storage-keys'
import { normalizeSettings } from '../../shared/settings'
import { OWN_POSTS_FETCH_REQ_TYPE, OWN_POSTS_FETCH_RES_TYPE, XF_BRIDGE_MARKER } from '../../shared/bridge'
import { getOwnHandle, type OwnPostsPage } from '../../shared/own-posts'
import { LIBRARY_MESSAGE, LIBRARY_SYNC, type LibraryRequest } from '../../shared/own-post-library'

export function requestOwnPostsPage(handle: string, query: string, cursor: string | null, signal: AbortSignal): Promise<OwnPostsPage> {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID()
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive); signal.removeEventListener('abort', abort) }
    const abort = () => { cleanup(); reject(new Error('已关闭')) }
    const receive = (event: MessageEvent) => {
      const data = event.data
      if (event.source !== window || event.origin !== location.origin || data?.__xf !== XF_BRIDGE_MARKER ||
          data.type !== OWN_POSTS_FETCH_RES_TYPE || data.requestId !== requestId) return
      cleanup()
      if (!data.ok || !Array.isArray(data.page?.posts)) reject(new Error(data.error || '读取失败，请重试'))
      else resolve(data.page)
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error('读取超时，请重试或刷新 X')) }, 45_000)
    signal.addEventListener('abort', abort, { once: true })
    window.addEventListener('message', receive)
    window.postMessage({ type: OWN_POSTS_FETCH_REQ_TYPE, requestId, handle, query, ...(cursor ? { cursor } : {}), __xf: XF_BRIDGE_MARKER }, location.origin)
  })
}


export function getOwnAccount(): { account: string; handle: string } | null {
  const handle = getOwnHandle()
  try {
    const twid = decodeURIComponent(document.cookie.match(/(?:^|;\s*)twid=([^;]+)/)?.[1] || '').replace(/"/g,'')
    const account = twid.match(/^u=(\d+)$/)?.[1]
    return account && handle ? { account, handle } : null
  } catch { return null }
}
async function send(request: LibraryRequest) {
  const response = await browser.runtime.sendMessage({ type:LIBRARY_MESSAGE, ...request })
  if (!response?.ok) throw new Error(response?.error || '本地缓存暂不可用，请刷新 X 后重试')
  return response.result
}
async function automaticSyncEnabled(): Promise<boolean> {
  const settings = await browser.storage.local.get(KeyOwnPostAutoSync)
  return normalizeSettings(settings)[KeyOwnPostAutoSync] === 'on'
}
export async function searchLibrary(handle: string, query: string, limit=30) {
  const owner=getOwnAccount()
  if (!owner || owner.handle.toLowerCase()!==handle.toLowerCase()) throw new Error('当前账号已变化，请重新打开选择器')
  const result=await send({...owner,action:'search',query,limit:Math.min(limit,100),offset:0})
  // More than 100 visible rows are read in bounded local pages, never fetched over the network.
  for(let offset=100;offset<Math.min(limit,result.total);offset+=100){
    const page=await send({...owner,action:'search',query,limit:Math.min(100,limit-offset),offset})
    result.posts.push(...page.posts)
  }
  if(getOwnAccount()?.account!==owner.account || getOwnHandle()?.toLowerCase()!==handle.toLowerCase()) throw new Error('当前账号已变化，请重新打开选择器')
  return { ...result, autoSync: await automaticSyncEnabled() }
}
let running: Promise<void> | null = null
let controller: AbortController | null = null
let manualRun = false
export async function pauseLibrary() {
  const owner=getOwnAccount()
  if (!owner) return
  await send({...owner,action:'pause'})
  controller?.abort()
}
export function syncLibrary(manual=false): Promise<void> {
  if (running) return running
  manualRun=manual
  running=run(manual).finally(()=>{running=null;controller=null})
  return running
}
async function run(manual: boolean) {
  const owner=getOwnAccount()
  if(!owner) return
  let token:string|undefined
  let error=''
  controller=new AbortController()
  const signal=controller.signal
  const stillOwner=()=>getOwnAccount()?.account===owner.account && getOwnHandle()?.toLowerCase()===owner.handle.toLowerCase()
  try {
    if (!manual && !(await automaticSyncEnabled())) return
    if (signal.aborted) return
    let job=await send({...owner,action:'begin',manual})
    token=job.token
    if(!token) return
    // Bound each batch, checkpoint every page, then yield to the next scheduled run.
    for(let pageNumber=0;pageNumber<20 && !job.done && !signal.aborted;pageNumber++) {
      if (!manual && !(await automaticSyncEnabled())) break
      if(signal.aborted || !stillOwner()) break
      const page=await requestOwnPostsPage(owner.handle,'',job.cursor,signal)
      if(signal.aborted || !stillOwner()) break
      if(!page.hasTimeline) throw new Error('X 未返回可读取的帖子列表')
      job=await send({...owner,action:'page',token,posts:page.posts,cursor:page.cursor})
      window.dispatchEvent(new Event('xf-own-library-updated'))
      if(!job.done && pageNumber<19) await new Promise<void>(resolve=>{
        const finish=()=>{clearTimeout(timer);signal.removeEventListener('abort',finish);resolve()}
        const timer=setTimeout(finish,2500);signal.addEventListener('abort',finish,{once:true})
      })
    }
  } catch(e) {
    if(!signal.aborted) error=e instanceof Error?e.message:'同步失败，请稍后重试'
  } finally {
    if(token) {
      try{await send({...owner,action:'finish',token,error})}catch{/* Paused, switched account or another tab has taken over. */}
    }
    window.dispatchEvent(new Event('xf-own-library-updated'))
  }
}
let started=false
export function startOwnPostSync() {
  if(started) return
  started=true
  const tick=()=>{void syncLibrary().catch(()=>{})}
  browser.runtime.onMessage.addListener(message=>{if(message?.type===LIBRARY_SYNC)tick()})
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(KeyOwnPostAutoSync in changes)) return
    const enabled = normalizeSettings({[KeyOwnPostAutoSync]: changes[KeyOwnPostAutoSync].newValue})[KeyOwnPostAutoSync] === 'on'
    if (!enabled && !manualRun) controller?.abort()
    if (enabled) void (running || Promise.resolve()).then(tick)
    window.dispatchEvent(new Event('xf-own-library-updated'))
  })
  // Also covers SPA account switches and sleeping computers missing an alarm.
  setInterval(tick,60_000)
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()})
  window.addEventListener('pagehide',()=>controller?.abort())
  tick()
}
