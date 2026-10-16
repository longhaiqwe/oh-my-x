import { describe, it, expect } from 'vitest'
import { createLibraryService, emptyLibrary, type LibraryState, type LibraryRequest } from '../../shared/own-post-library'
const post = (id: string, text = '早睡', handle = 'me', timestamp = Number(id)) => ({ id, text, handle, timestamp, title: '', url: `https://x.com/${handle}/status/${id}` })
function setup() {
  const accounts = new Map<string, LibraryState>()
  let now = 1_000_000_000
  const service = createLibraryService({
    read: async key => structuredClone(accounts.get(key) || emptyLibrary(key)),
    update: async (key, change) => { const state = structuredClone(accounts.get(key) || emptyLibrary(key)); const value = change(state); accounts.set(key, state); return value },
  }, () => now)
  const call = (action: LibraryRequest['action'], extra = {}, account = '42') => service({ action, account, handle: 'me', ...extra })
  return { call, advance: (ms: number) => { now += ms } }
}
describe('local own posts library', () => {
  it('persists pages, searches all cached text/title case-insensitively and isolates accounts', async () => {
    const { call } = setup()
    const start = await call('begin')
    await call('page', { token: start.token, posts: [post('100','AI 与早睡'), { ...post('99',''), title:'早睡笔记' }, post('98','别人的早睡','other')], cursor:'older' })
    const found = await call('search',{query:'ai 早睡'})
    expect(found.posts.map((p:any)=>p.id)).toEqual(['100'])
    expect((await call('search',{query:'早睡'})).total).toBe(2)
    expect((await call('search',{query:'早睡'},'43')).total).toBe(0)
  })
  it('deduplicates, resumes history and does not call a partial history complete', async () => {
    const {call}=setup(); const first=await call('begin')
    await call('page',{token:first.token,posts:[post('10')],cursor:'next'})
    await call('finish',{token:first.token})
    const second=await call('begin',{manual:true})
    expect(second.cursor).toBe('next')
    await call('page',{token:second.token,posts:[post('10'),post('9')],cursor:null})
    const found=await call('search',{query:''})
    expect(found.total).toBe(2);expect(found.meta.historyDone).toBe(true)
  })
  it('leases one sync across tabs and rejects stale writes after pause', async () => {
    const {call}=setup(); const start=await call('begin')
    expect((await call('begin',{manual:true})).token).toBeUndefined()
    await call('pause')
    await expect(call('page',{token:start.token,posts:[post('1')],cursor:null})).rejects.toThrow('同步已结束')
    expect((await call('begin')).token).toBeUndefined()
    expect((await call('begin',{manual:true})).token).toBeTruthy()
  })
  it('refreshes new pages without stopping on one pinned cached post, then resumes history', async () => {
    const {call,advance}=setup();let run=await call('begin')
    await call('page',{token:run.token,posts:[post('10'),post('9'),post('1')],cursor:'history'})
    await call('finish',{token:run.token});advance(31*60_000)
    run=await call('begin');expect(run.mode).toBe('refresh');expect(run.cursor).toBeNull()
    let next=await call('page',{token:run.token,posts:[post('1'),post('12'),post('11')],cursor:'head2'})
    expect(next.mode).toBe('refresh');expect(next.cursor).toBe('head2')
    next=await call('page',{token:run.token,posts:[post('10'),post('9')],cursor:'head3'})
    expect(next.mode).toBe('history');expect(next.cursor).toBe('history')
  })
  it('persists rate-limit backoff even for manual retry and expires abandoned leases', async () => {
    const {call,advance}=setup();let run=await call('begin')
    await call('finish',{token:run.token,error:'请求过于频繁'})
    expect((await call('begin',{manual:true})).token).toBeUndefined()
    advance(16*60_000);run=await call('begin',{manual:true});expect(run.token).toBeTruthy()
    advance(61_000);expect((await call('begin',{manual:true})).token).toBeTruthy()
  })
  it('updates cached edits and paginates local search independently of network cursors', async () => {
    const {call}=setup();const run=await call('begin')
    await call('page',{token:run.token,posts:[post('3'),post('2'),post('1')],cursor:'more'})
    await call('page',{token:run.token,posts:[post('3','更新正文')],cursor:null})
    expect((await call('search',{query:'更新'})).posts[0].id).toBe('3')
    const page=await call('search',{query:'',offset:1,limit:1})
    expect(page.posts.map((p:any)=>p.id)).toEqual(['2']);expect(page.total).toBe(3)
  })
  it('rechecks a previously empty account for newly published posts', async () => {
    const {call,advance}=setup();let run=await call('begin')
    await call('page',{token:run.token,posts:[],cursor:null});await call('finish',{token:run.token})
    advance(31*60_000);run=await call('begin')
    expect(run.token).toBeTruthy();expect(run.mode).toBe('refresh')
    await call('page',{token:run.token,posts:[post('100')],cursor:null})
    expect((await call('search',{query:''})).count).toBe(1)
  })

})

it('persists valid thumbnails and removes untrusted URLs at the storage boundary',async()=>{
  const {call}=setup();const run=await call('begin')
  await call('page',{token:run.token,posts:[{...post('2'),thumbnailUrl:'https://pbs.twimg.com/media/cover.jpg'},{...post('1'),thumbnailUrl:'https://evil.example/image.jpg'}],cursor:null})
  const result=await call('search')
  expect(result.posts.map((p:any)=>p.thumbnailUrl)).toEqual(['https://pbs.twimg.com/media/cover.jpg',null])
})
it('backfills pre-cover caches once without dropping saved posts or bypassing rate limits',async()=>{
  const state=emptyLibrary('42');delete state.meta.thumbnailVersion
  state.posts['1']={...post('1'),searchText:'早睡'}
  state.meta.historyCursor='old';state.meta.historyDone=true;state.meta.retryAt=2000
  let now=1000
  const service=createLibraryService({read:async()=>state,update:async(_,change)=>change(state)},()=>now)
  const request={account:'42',handle:'me',action:'begin' as const}
  expect((await service(request)).token).toBeUndefined()
  expect(state.meta.historyCursor).toBe('old')
  now=3000
  const job=await service(request)
  expect(job.cursor).toBeNull();expect(job.done).toBe(false)
  expect(state.posts['1'].text).toBe('早睡')
  expect(state.meta.thumbnailVersion).toBe(1)
  await service({...request,action:'page',token:job.token,posts:[{...post('1'),thumbnailUrl:null}],cursor:'new'})
  await service({...request,action:'finish',token:job.token})
  expect((await service({...request,manual:true})).cursor).toBe('new')
})
