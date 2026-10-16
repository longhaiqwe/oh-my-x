import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { syncLibrary, searchLibrary, pauseLibrary, startOwnPostSync } from '../../content-scripts/options/own-post-library-client'
import { createLibraryService, emptyLibrary, type LibraryState } from '../../shared/own-post-library'
import { OWN_POSTS_FETCH_REQ_TYPE, OWN_POSTS_FETCH_RES_TYPE, XF_BRIDGE_MARKER } from '../../shared/bridge'
let state:LibraryState
let fetches:number
let listener:(event:MessageEvent)=>void
const post=(id:string)=>({id,handle:'me',text:'历史旧文章',title:'',timestamp:1,url:`https://x.com/me/status/${id}`})
beforeEach(()=>{
  vi.useFakeTimers();fetches=0;state=emptyLibrary('42')
  document.body.innerHTML='<a data-testid="AppTabBar_Profile_Link" href="/me"></a>';document.cookie='twid=u%3D42'
  const service=createLibraryService({read:async()=>structuredClone(state),update:async(_key,change)=>change(state)})
  ;(browser.runtime as any).sendMessage=vi.fn(async request=>({ok:true,result:await service(request)}))
  listener=event=>{if(event.data?.type!==OWN_POSTS_FETCH_REQ_TYPE)return;fetches++;window.dispatchEvent(new MessageEvent('message',{source:window,origin:location.origin,data:{type:OWN_POSTS_FETCH_RES_TYPE,__xf:XF_BRIDGE_MARKER,requestId:event.data.requestId,ok:true,page:{posts:[post(String(fetches))],hasTimeline:true,cursor:fetches===1?'next':null}}}))}
  vi.spyOn(window,'postMessage').mockImplementation(data=>listener(new MessageEvent('message',{data})))
})
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers()})
it('fills history automatically, then answers repeated searches without network requests',async()=>{
  const run=syncLibrary();await vi.advanceTimersByTimeAsync(2600);await run
  expect(fetches).toBe(2);expect(state.meta.historyDone).toBe(true)
  expect((await searchLibrary('me','旧文章')).total).toBe(2)
  expect((await searchLibrary('me','旧文章')).total).toBe(2);expect(fetches).toBe(2)
})
it('pauses between pages without losing the checkpoint',async()=>{
  const run=syncLibrary();await vi.advanceTimersByTimeAsync(1)
  await pauseLibrary();await run
  expect(state.meta.paused).toBe(true);expect(state.meta.historyCursor).toBe('next');expect(fetches).toBe(1)
})
it('does not commit a page returned after an account switch',async()=>{
  vi.mocked(window.postMessage).mockImplementation(data=>{
    document.cookie='twid=u%3D43';listener(new MessageEvent('message',{data}))
  })
  await syncLibrary()
  expect(Object.keys(state.posts)).toHaveLength(0)
})

it('keeps local search available with automatic sync off, but allows a manual batch',async()=>{
  vi.spyOn(browser.storage.local as any,'get').mockResolvedValue({ownPostAutoSync:'off'})
  await syncLibrary()
  expect(fetches).toBe(0)
  expect((await searchLibrary('me','')).autoSync).toBe(false)
  const manual=syncLibrary(true);await vi.advanceTimersByTimeAsync(2600);await manual
  expect(fetches).toBe(2)
  expect((await searchLibrary('me','旧文章')).total).toBe(2)
  await syncLibrary();expect(fetches).toBe(2)
})
it('stops automatic pagination when disabled and resumes from its checkpoint when enabled',async()=>{
  const settings=vi.spyOn(browser.storage.local as any,'get').mockResolvedValue({ownPostAutoSync:'on'})
  const run=syncLibrary();await vi.advanceTimersByTimeAsync(1)
  settings.mockResolvedValue({ownPostAutoSync:'off'})
  await vi.advanceTimersByTimeAsync(2600);await run
  expect(fetches).toBe(1);expect(state.meta.historyCursor).toBe('next')
  expect(state.meta.paused).toBe(false)
  settings.mockResolvedValue({ownPostAutoSync:'on'})
  await vi.advanceTimersByTimeAsync(60_000);await syncLibrary()
  expect(fetches).toBe(2);expect(state.meta.historyDone).toBe(true)
})

it('stops an in-flight automatic run as soon as the setting changes',async()=>{
  let change!:(changes:any,area:string)=>void
  const previous=(browser.storage as any).onChanged
  ;(browser.storage as any).onChanged={addListener:(fn:typeof change)=>{change=fn}}
  vi.mocked(window.postMessage).mockImplementation(()=>{})
  try {
    startOwnPostSync()
    const run=syncLibrary();await vi.advanceTimersByTimeAsync(1)
    expect(window.postMessage).toHaveBeenCalledTimes(1)
    change({ownPostAutoSync:{newValue:'off'}},'local')
    await run
    expect(state.meta.lease).toBeUndefined()
    expect(state.meta.error).toBe('')
    expect(Object.keys(state.posts)).toHaveLength(0)
  } finally {
    ;(browser.storage as any).onChanged=previous
    vi.clearAllTimers()
  }
})
