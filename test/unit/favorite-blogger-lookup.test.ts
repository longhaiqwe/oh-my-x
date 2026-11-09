import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFavoriteBloggerLookup } from '../../content-scripts/features/favorite-blogger-lookup'
import { MENTION_SEARCH_MESSAGE } from '../../shared/mention-search'
import type { FavoriteBlogger } from '../../shared/favorite-bloggers'

const user = { id: '1', name: '向阳乔木', handle: 'vista8', avatar: '', following: true, verified: true }
let input: HTMLInputElement
let lookup: ReturnType<typeof createFavoriteBloggerLookup>
let send: ReturnType<typeof vi.fn>
let select: ReturnType<typeof vi.fn<(blogger: FavoriteBlogger) => Promise<boolean>>>
function type(value: string) { input.value = value; input.dispatchEvent(new Event('input')) }

beforeEach(() => {
  vi.useFakeTimers()
  send = vi.fn(async () => ({ ok: true, users: [user] }))
  select = vi.fn(async () => true)
  vi.stubGlobal('browser', { runtime: { sendMessage: send } })
  document.body.innerHTML = '<input>'
  input = document.querySelector('input')!
  lookup = createFavoriteBloggerLookup(input, select, () => {})
  document.body.append(lookup.element)
})
afterEach(() => { lookup.dispose(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('收藏昵称候选', () => {
  it('未带 @ 的用户名保留明确的直接收藏选项，不自动将英文昵称当成用户名', async () => {
    type('Chris')
    await vi.advanceTimersByTimeAsync(200)
    expect(select).not.toHaveBeenCalled()
    const direct = lookup.element.querySelector<HTMLButtonElement>('.xf-favorites-direct')!
    expect(direct.textContent).toBe('按用户名收藏 @Chris')
    direct.click()
    await vi.advanceTimersByTimeAsync(0)
    expect(select).toHaveBeenCalledWith({ name: 'Chris', handle: 'Chris' })
  })
  it.each(['乔木', 'Chris', 'Chris Smith'])('对昵称 %s 防抖查询，选择后传递真实昵称与用户名', async query => {
    type(query.slice(0, 1))
    await vi.advanceTimersByTimeAsync(100)
    type(query)
    await vi.advanceTimersByTimeAsync(200)
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith({ type: MENTION_SEARCH_MESSAGE, query })
    expect(lookup.element.textContent).toContain('向阳乔木')
    expect(lookup.element.textContent).toContain('@vista8')
    lookup.element.querySelector<HTMLButtonElement>('[role="option"]')!.click()
    await vi.advanceTimersByTimeAsync(0)
    expect(select).toHaveBeenCalledWith({ name: '向阳乔木', handle: 'vista8' })
    expect(input.value).toBe('')
    expect(lookup.element.hidden).toBe(true)
  })

  it.each(['@vista8', 'https://x.com/vista8', 'twitter.com/vista8', 'https://x.com/vista8/status/123', 'https://example.com/user', '', '长'.repeat(31)])('明确用户名、链接或无效查询不发昵称请求：%s', async value => {
    type(value)
    await vi.advanceTimersByTimeAsync(200)
    expect(send).not.toHaveBeenCalled()
    expect(lookup.element.hidden).toBe(true)
  })

  it('中文输入法组字不查询，提交组字后才查', async () => {
    input.dispatchEvent(new Event('compositionstart'))
    type('乔')
    await vi.advanceTimersByTimeAsync(300)
    expect(send).not.toHaveBeenCalled()
    input.value = '乔木'
    input.dispatchEvent(new Event('compositionend'))
    await vi.advanceTimersByTimeAsync(200)
    expect(send).toHaveBeenCalledWith({ type: MENTION_SEARCH_MESSAGE, query: '乔木' })
  })

  it('方向键选中、回车收藏，Escape 先收起候选且不关闭父面板', async () => {
    type('乔木')
    await vi.advanceTimersByTimeAsync(200)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }))
    expect(input.getAttribute('aria-activedescendant')).toBe(lookup.element.querySelector('[role="option"]')!.id)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    await vi.advanceTimersByTimeAsync(0)
    expect(select).toHaveBeenCalledTimes(1)
    type('乔木')
    await vi.advanceTimersByTimeAsync(200)
    const parentKeydown = vi.fn()
    document.addEventListener('keydown', parentKeydown)
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    document.removeEventListener('keydown', parentKeydown)
    expect(parentKeydown).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('输入改变和面板关闭后，迟到的请求不能恢复旧候选', async () => {
    let resolve!: (value: unknown) => void
    send.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    type('旧名字')
    await vi.advanceTimersByTimeAsync(200)
    type('新名字')
    resolve({ ok: true, users: [{ ...user, name: '旧结果' }] })
    await vi.advanceTimersByTimeAsync(0)
    expect(lookup.element.textContent).not.toContain('旧结果')
    await vi.advanceTimersByTimeAsync(200)
    expect(lookup.element.textContent).toContain('向阳乔木')
    send.mockImplementationOnce(() => new Promise(r => { resolve = r }))
    type('第三个名字')
    await vi.advanceTimersByTimeAsync(200)
    lookup.dispose()
    resolve({ ok: true, users: [user] })
    await vi.advanceTimersByTimeAsync(0)
    expect(lookup.element.hidden).toBe(true)
    expect(lookup.element.querySelector('[role="option"]')).toBeNull()
  })

  it('查询失败和无结果给出提示，重新提交可重试', async () => {
    send.mockResolvedValueOnce({ ok: false })
    type('乔木')
    await vi.advanceTimersByTimeAsync(200)
    expect(lookup.element.textContent).toContain('查找账号失败')
    send.mockResolvedValueOnce({ ok: true, users: [] })
    lookup.searchNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(lookup.element.textContent).toContain('没有找到博主')
    lookup.searchNow()
    await vi.advanceTimersByTimeAsync(0)
    expect(lookup.element.querySelector('[role="option"]')).not.toBeNull()
  })

  it('保存失败保留候选和输入，恢复可操作状态；昵称按纯文本显示', async () => {
    send.mockResolvedValueOnce({ ok: true, users: [{ ...user, name: '<img src=x onerror=alert(1)>' }] })
    select.mockResolvedValueOnce(false)
    type('乔木')
    await vi.advanceTimersByTimeAsync(200)
    const option = lookup.element.querySelector<HTMLButtonElement>('[role="option"]')!
    expect(option.querySelector('img')).toBeNull()
    expect(option.textContent).toContain('<img')
    option.click()
    option.click()
    await vi.advanceTimersByTimeAsync(0)
    expect(select).toHaveBeenCalledTimes(1)
    expect(input.value).toBe('乔木')
    expect(input.disabled).toBe(false)
    expect(option.disabled).toBe(false)
  })
})
