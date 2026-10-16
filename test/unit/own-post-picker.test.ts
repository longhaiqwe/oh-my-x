import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { addComposerInsertLinkButton } from '../../content-scripts/options/composer'
import { searchLibrary, syncLibrary, pauseLibrary } from '../../content-scripts/options/own-post-library-client'
vi.mock('../../content-scripts/options/own-post-library-client',()=>({searchLibrary:vi.fn(),syncLibrary:vi.fn(),pauseLibrary:vi.fn()}))
const result=(posts:any[]=[],meta={})=>({posts,total:posts.length,count:posts.length,meta:{historyDone:false,syncing:false,paused:false,...meta}})
const post=(id='123')=>({id,handle:'me',text:'旧文章',title:'',timestamp:null})
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()}
const open=()=>{addComposerInsertLinkButton();document.querySelector<HTMLButtonElement>('[data-testid="xf-insert-link-button"]')!.click()}
describe('local own post picker',()=>{
  beforeEach(()=>{
    vi.useFakeTimers();vi.clearAllMocks();window.getSelection()?.removeAllRanges()
    vi.mocked(searchLibrary).mockResolvedValue(result())
    vi.mocked(syncLibrary).mockResolvedValue()
    document.body.innerHTML='<a data-testid="AppTabBar_Profile_Link" href="/me"></a><div role="dialog" aria-labelledby="modal-header"><div contenteditable="true" data-testid="tweetTextarea_0">前文 后文</div><div role="tablist"></div></div>'
  })
  afterEach(()=>{document.querySelectorAll<HTMLButtonElement>('[aria-label="关闭帖子选择器"]').forEach(b=>b.click());vi.useRealTimers()})
  it('opens from cache and live searches on typing without waiting for a network sync',async()=>{
    vi.mocked(syncLibrary).mockReturnValue(new Promise(()=>{}))
    vi.mocked(searchLibrary).mockResolvedValue(result([post()]))
    open();await flush()
    expect(document.querySelector('[data-post-id="123"]')).not.toBeNull()
    const input=document.querySelector<HTMLInputElement>('input')!
    input.value='早睡';input.dispatchEvent(new Event('input'))
    await vi.advanceTimersByTimeAsync(150)
    expect(searchLibrary).toHaveBeenLastCalledWith('me','早睡',30)
    expect(document.querySelector('[contenteditable]')?.textContent).toBe('前文 后文')
  })
  it('renders a cover beside text, and falls back cleanly for missing or failed images',async()=>{
    vi.mocked(searchLibrary).mockResolvedValue(result([
      {...post('1'),title:'封面文章',thumbnailUrl:'https://pbs.twimg.com/media/cover.jpg'},
      post('2'),
      {...post('3'),thumbnailUrl:'javascript:alert(1)'},
    ]))
    open();await flush()
    const row=document.querySelector<HTMLElement>('[data-post-id="1"]')!
    expect(row.firstElementChild?.className).toBe('xf-own-cover')
    const image=row.querySelector('img')!
    expect(image.getAttribute('loading')).toBe('lazy')
    expect(row.querySelector('.xf-own-content')?.textContent).toContain('封面文章')
    image.dispatchEvent(new Event('error'))
    expect(row.querySelector('img')).toBeNull()
    expect(row.querySelector('.xf-own-cover')).toBeNull()
    expect(row.classList.contains('xf-own-has-cover')).toBe(false)
    expect(document.querySelector('[data-post-id="2"] .xf-own-cover')).toBeNull()
    expect(document.querySelector('[data-post-id="2"]')?.classList.contains('xf-own-has-cover')).toBe(false)
    expect(document.querySelector('[data-post-id="3"] img')).toBeNull()
  })
  it('preserves caret and quotes into only the selected editor',async()=>{
    vi.mocked(searchLibrary).mockResolvedValue(result([post()]))
    const editor=document.querySelector<HTMLElement>('[contenteditable]')!
    const range=document.createRange();range.setStart(editor.firstChild!,3);range.collapse(true);window.getSelection()!.addRange(range)
    addComposerInsertLinkButton()
    const button=document.querySelector<HTMLButtonElement>('[data-testid="xf-insert-link-button"]')!
    button.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));button.click();await flush()
    document.querySelector<HTMLButtonElement>('[data-post-id="123"]')!.click()
    expect(editor.textContent).toBe('前文 https://x.com/me/status/123 后文')
    expect(document.querySelector('[data-testid="xf-own-post-picker"]')).toBeNull()
  })
  it('ignores stale search responses and reports incomplete coverage',async()=>{
    open();await flush()
    let resolve!:(value:any)=>void
    vi.mocked(searchLibrary).mockReturnValueOnce(new Promise(r=>{resolve=r})).mockResolvedValue(result())
    const input=document.querySelector<HTMLInputElement>('input')!
    input.value='旧';document.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}))
    input.value='新';document.querySelector('form')!.dispatchEvent(new Event('submit',{cancelable:true}));await flush()
    resolve(result([post()]));await flush()
    expect(document.querySelector('[data-post-id]')).toBeNull()
    expect(document.querySelector('.xf-own-sync-text')?.textContent).toContain('尚未同步完')
  })
  it('pauses active sync and stops polling when closed',async()=>{
    vi.mocked(searchLibrary).mockResolvedValue(result([post()],{syncing:true}))
    open();await flush()
    document.querySelector<HTMLButtonElement>('[data-action="sync"]')!.click();await flush()
    expect(pauseLibrary).toHaveBeenCalledOnce()
    document.querySelector<HTMLButtonElement>('[aria-label="关闭帖子选择器"]')!.click()
    const calls=vi.mocked(searchLibrary).mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(searchLibrary).toHaveBeenCalledTimes(calls)
  })
  it('keeps the picker outside the publish toolbar and reinjects a replaced inline toolbar',async()=>{
    document.body.innerHTML='<a data-testid="AppTabBar_Profile_Link" href="/me"></a><section id="reply"><div contenteditable="true" data-testid="tweetTextarea_0">回复</div><div id="toolbar"><div role="tablist"></div><button data-testid="tweetButtonInline">回复</button></div></section>'
    open();await flush()
    expect(document.querySelector('#toolbar')!.previousElementSibling?.getAttribute('data-testid')).toBe('xf-own-post-picker')
    document.querySelector<HTMLButtonElement>('[aria-label="关闭帖子选择器"]')!.click()
    document.querySelector('[role="tablist"]')!.innerHTML=''
    addComposerInsertLinkButton();addComposerInsertLinkButton()
    expect(document.querySelectorAll('[data-testid="xf-insert-link-button"]')).toHaveLength(1)
  })
  it('does not merge two inline editors with an open compose dialog',async()=>{
    const inline=(id:string)=>`<section id="${id}"><div contenteditable="true" data-testid="tweetTextarea_0">${id}</div><div role="tablist"></div><button data-testid="tweetButtonInline">回复</button></section>`
    document.body.insertAdjacentHTML('beforeend',inline('first')+inline('second'))
    vi.mocked(searchLibrary).mockResolvedValue(result([post()]))
    addComposerInsertLinkButton()
    expect(document.querySelectorAll('[data-testid="xf-insert-link-button"]')).toHaveLength(3)
    document.querySelector<HTMLButtonElement>('#second [data-testid="xf-insert-link-button"]')!.click();await flush()
    document.querySelector<HTMLButtonElement>('[data-post-id="123"]')!.click()
    expect(document.querySelector('#second [contenteditable]')?.textContent).toBe('second https://x.com/me/status/123')
    expect(document.querySelector('#first [contenteditable]')?.textContent).toBe('first')
    expect(document.querySelector('[role="dialog"] [contenteditable]')?.textContent).toBe('前文 后文')
  })
  it('preserves focused result nodes during background status polling',async()=>{
    vi.mocked(searchLibrary).mockResolvedValue(result([post()]))
    open();await flush()
    const row=document.querySelector<HTMLButtonElement>('[data-post-id="123"]')!;row.focus()
    await vi.advanceTimersByTimeAsync(3000)
    expect(document.activeElement).toBe(row)
  })
})

it('shows automatic sync off while keeping local results and a manual action',async()=>{
  vi.mocked(searchLibrary).mockResolvedValue({...result([post()]),autoSync:false} as any)
  vi.mocked(syncLibrary).mockResolvedValue()
  document.body.innerHTML='<a data-testid="AppTabBar_Profile_Link" href="/me"></a><div role="dialog" aria-labelledby="modal-header"><div contenteditable="true" data-testid="tweetTextarea_0"></div><div role="tablist"></div></div>'
  open();await flush()
  expect(document.querySelector('.xf-own-sync-text')?.textContent).toContain('自动同步已关闭')
  expect(document.querySelector('[data-post-id="123"]')).not.toBeNull()
  const sync=document.querySelector<HTMLButtonElement>('[data-action="sync"]')!
  expect(sync.textContent).toBe('手动同步')
  sync.click();await flush()
  expect(syncLibrary).toHaveBeenLastCalledWith(true)
  document.querySelector<HTMLButtonElement>('[aria-label="关闭帖子选择器"]')!.click()
})
