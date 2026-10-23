import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KeySearchAiQuery, KeySearchAskGrok, KeySearchEnterGrok } from '../../storage-keys'

const sendAiRequest = vi.fn()
vi.mock('../../shared/ai-request', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../shared/ai-request')>()),
  sendAiRequest: (...args: unknown[]) => sendAiRequest(...args),
}))

type MenuModule = typeof import('../../content-scripts/features/search-menu')

let menuModule: MenuModule
let store: Record<string, unknown>
let postMessage: ReturnType<typeof vi.spyOn>
let sendMessage: ReturnType<typeof vi.fn>
let input: HTMLInputElement

/** 仿 X 搜索框：输入框用 aria-owns 指向下拉；第一项是「搜索“…”」，后面是分隔线和账号 */
function renderSearchBox() {
  document.body.innerHTML = `<form role="search"><input data-testid="SearchBox_Search_Input" role="combobox" aria-owns="typeaheadDropdown-1">
    <div id="typeaheadDropdown-1" role="listbox"><div role="progressbar"></div>
    <div role="option" aria-selected="false" data-testid="typeaheadResult"><button type="button">搜索</button></div>
    <div class="separator"></div>
    <div role="option" aria-selected="false" data-testid="typeaheadResult"><button type="button" data-testid="TypeaheadUser">Claude</button></div>
    </div></form>`
  input = document.querySelector('input')!
}

async function type(text: string) {
  input.focus()
  input.value = text
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await vi.advanceTimersByTimeAsync(500)
}

function menu() {
  return document.querySelector<HTMLElement>('.xf-search-menu')
}

function item(action: string) {
  return menu()!.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!
}

function navigations() {
  return (postMessage.mock.calls as unknown[][])
    .map(([data]) => data as { type?: string; href?: string; replace?: boolean })
    .filter((data) => data?.type === 'XF_SEARCH_NAVIGATE')
    .map(({ href, replace }) => ({ href, replace }))
}

function pressEnter(init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init })
  input.dispatchEvent(event)
  return event
}

async function start(settings: Record<string, string> = {}) {
  store = { ...settings }
  menuModule = await import('../../content-scripts/features/search-menu')
  await menuModule.initSearchMenu()
}

beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  sendAiRequest.mockReset()
  sendMessage = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('browser', {
    runtime: { id: 'test-extension', sendMessage },
    storage: { local: { get: async () => ({ ...store }), set: async () => {} } },
  })
  postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => {})
  renderSearchBox()
})

afterEach(() => {
  menuModule?.setSearchMenuSettings({ grok: false, enterGrok: false, ai: false })
  postMessage.mockRestore()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('搜索框下拉的附加选项', () => {
  it('输入文字后放在 X 的第一项后面：问 Grok、用 AI 转成搜索语法', async () => {
    await start()
    await type('上周 claude 新功能')
    const first = document.querySelector('[role="option"]')!
    expect(first.nextElementSibling).toBe(menu())
    expect([...menu()!.querySelectorAll('[data-action]')].map((el) => el.textContent)).toEqual([
      '问 Grok：“上周 claude 新功能”',
      '用 AI 转成搜索语法：“上周 claude 新功能”',
    ])
  })

  it('没有文字时不显示，文字清空后去掉', async () => {
    await start()
    await type('   ')
    expect(menu()).toBeNull()
    await type('claude')
    expect(menu()).not.toBeNull()
    await type('')
    expect(menu()).toBeNull()
  })

  it('输入时下拉还是空的，X 的查询返回、放进项目后再补上', async () => {
    const list = document.getElementById('typeaheadDropdown-1')!
    const options = [...list.children].slice(1)
    options.forEach((el) => el.remove())
    await start()
    await type('claude')
    expect(menu()).toBeNull()
    list.append(...options)
    await vi.advanceTimersByTimeAsync(0)
    expect(document.querySelector('[role="option"]')!.nextElementSibling).toBe(menu())
  })

  it('X 重新渲染下拉后放回原位，只有一份', async () => {
    await start()
    await type('claude')
    const list = document.getElementById('typeaheadDropdown-1')!
    const first = list.querySelector('[role="option"]')!
    const fresh = first.cloneNode(true) as HTMLElement
    first.replaceWith(fresh)
    list.prepend(menu()!)
    await vi.advanceTimersByTimeAsync(0)
    expect(list.querySelectorAll('.xf-search-menu')).toHaveLength(1)
    expect(fresh.nextElementSibling).toBe(menu())
  })

  it('关掉两个开关后去掉，只关一个时只少一项', async () => {
    await start({ [KeySearchAiQuery]: 'off' })
    await type('claude')
    expect(menu()!.querySelectorAll('[data-action]')).toHaveLength(1)
    expect(item('grok')).not.toBeNull()
    menuModule.setSearchMenuSettings({ grok: false, enterGrok: false, ai: false })
    expect(menu()).toBeNull()
  })
})

describe('问 Grok', () => {
  it('点击后打开 Grok 页并带上问题，输入框失焦', async () => {
    await start()
    await type('上周 claude 新功能')
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    item('grok').dispatchEvent(mousedown)
    expect(mousedown.defaultPrevented).toBe(true)
    item('grok').click()
    expect(navigations()).toEqual([{ href: `/i/grok?text=${encodeURIComponent('上周 claude 新功能')}`, replace: false }])
    expect(document.activeElement).not.toBe(input)
  })

  it('回车问 Grok 默认关闭：回车交给 X', async () => {
    await start()
    await type('claude')
    expect(pressEnter().defaultPrevented).toBe(false)
    expect(navigations()).toEqual([])
  })

  it('打开回车问 Grok 后，回车打开 Grok', async () => {
    await start({ [KeySearchEnterGrok]: 'on' })
    await type('claude')
    expect(pressEnter().defaultPrevented).toBe(true)
    expect(navigations()).toEqual([{ href: '/i/grok?text=claude', replace: false }])
  })

  it('用方向键选中下拉项目、输入法组字中、带修饰键、没有文字时，回车交给 X', async () => {
    await start({ [KeySearchEnterGrok]: 'on' })
    await type('claude')
    expect(pressEnter({ isComposing: true }).defaultPrevented).toBe(false)
    expect(pressEnter({ metaKey: true }).defaultPrevented).toBe(false)
    document.querySelectorAll('[role="option"]')[1].setAttribute('aria-selected', 'true')
    expect(pressEnter().defaultPrevented).toBe(false)
    document.querySelectorAll('[role="option"]')[1].setAttribute('aria-selected', 'false')
    await type('  ')
    expect(pressEnter().defaultPrevented).toBe(false)
    expect(navigations()).toEqual([])
  })

  it('关掉问 Grok 后，回车问 Grok 也不生效', async () => {
    await start({ [KeySearchAskGrok]: 'off', [KeySearchEnterGrok]: 'on' })
    await type('claude')
    expect(pressEnter().defaultPrevented).toBe(false)
  })
})

describe('用 AI 转成搜索语法', () => {
  it('发给后台转换，转换中显示进度，拿到搜索词后用 X 的搜索', async () => {
    let resolve!: (value: unknown) => void
    sendAiRequest.mockReturnValue(new Promise((r) => { resolve = r }))
    await start()
    await type('上周关于 Claude、点赞过千的中文帖')
    item('ai').click()
    expect(sendAiRequest).toHaveBeenCalledWith({ type: 'XF_BUILD_SEARCH_QUERY', text: '上周关于 Claude、点赞过千的中文帖' }, expect.any(AbortSignal))
    expect(item('ai').textContent).toBe('正在用 AI 转换：“上周关于 Claude、点赞过千的中文帖”')
    expect(item('ai').getAttribute('aria-disabled')).toBe('true')
    item('ai').click()
    expect(sendAiRequest).toHaveBeenCalledTimes(1)
    resolve({ ok: true, query: 'Claude lang:zh min_faves:1000 since:2026-10-16' })
    await vi.advanceTimersByTimeAsync(0)
    expect(navigations()).toEqual([{ href: '/search?q=Claude%20lang%3Azh%20min_faves%3A1000%20since%3A2026-10-16&src=typed_query', replace: false }])
  })

  it('没配置 AI 服务时显示报错和设置入口，点入口打开设置页', async () => {
    sendAiRequest.mockResolvedValue({ ok: false, error: { code: 'error.aiNoKey' } })
    await start()
    await type('claude')
    item('ai').click()
    await vi.advanceTimersByTimeAsync(0)
    const alert = menu()!.querySelector('[role="alert"]')!
    expect(alert.textContent).toContain('请先在「设置 → AI 服务」中填写 API Key')
    item('settings').click()
    expect(sendMessage).toHaveBeenCalledWith({ type: 'XF_OPEN_SETTINGS', module: 'settings' })
    expect(navigations()).toEqual([])
  })

  it('其他报错只显示报错文字，改了文字后报错消失', async () => {
    sendAiRequest.mockRejectedValue(new Error('网络断开'))
    await start()
    await type('claude')
    item('ai').click()
    await vi.advanceTimersByTimeAsync(0)
    expect(menu()!.querySelector('[role="alert"]')!.textContent).toBe('网络断开')
    expect(menu()!.querySelector('[data-action="settings"]')).toBeNull()
    await type('claude code')
    expect(menu()!.querySelector('[role="alert"]')).toBeNull()
  })

  it('转换中改了文字就取消这次请求，迟到的结果不跳转', async () => {
    let resolve!: (value: unknown) => void
    sendAiRequest.mockReturnValue(new Promise((r) => { resolve = r }))
    await start()
    await type('claude')
    item('ai').click()
    const signal = sendAiRequest.mock.calls[0][1] as AbortSignal
    await type('claude code')
    expect(signal.aborted).toBe(true)
    resolve({ ok: true, query: 'claude' })
    await vi.advanceTimersByTimeAsync(0)
    expect(navigations()).toEqual([])
  })
})
