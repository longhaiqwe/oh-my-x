import { afterEach, expect, it, vi } from 'vitest'
import { followComposerToolbarColor } from '../../content-scripts/options/composer-colors'

afterEach(() => { document.body.innerHTML = '' })

it('四个底部入口跟随可用原生图标；主题变更和原生节点替换后继续同步', async () => {
  document.body.innerHTML = '<div role="tablist"><button disabled><svg style="color:rgb(190, 200, 210)"></svg></button><button><svg style="color:rgb(128, 156, 172)"></svg></button>' +
    '<button class="xf-insert-link-button"><svg></svg></button>'.repeat(4) + '</div>'
  const toolbar = document.querySelector<HTMLElement>('[role="tablist"]')!
  const native = toolbar.querySelectorAll('svg')[1]
  const colors = () => [...toolbar.querySelectorAll<HTMLElement>('.xf-insert-link-button')].map(button => button.style.getPropertyValue('--xf-composer-icon-color'))
  followComposerToolbarColor(toolbar)
  expect(colors()).toEqual(Array(4).fill('rgb(128, 156, 172)'))
  native.style.color = 'rgb(29, 155, 240)'
  await vi.waitFor(() => expect(colors()).toEqual(Array(4).fill('rgb(29, 155, 240)')))
  native.parentElement!.innerHTML = '<svg style="color:rgb(239, 243, 244)"></svg>'
  await vi.waitFor(() => expect(colors()).toEqual(Array(4).fill('rgb(239, 243, 244)')))
})

it('多个发帖框分别取色；原生工具延迟出现时替换备用强调色', async () => {
  document.body.innerHTML = '<div id="a"><button class="xf-insert-link-button"></button></div><div id="b"><button><svg style="color:rgb(0, 186, 124)"></svg></button><button class="xf-insert-link-button"></button></div>'
  const first = document.querySelector<HTMLElement>('#a')!
  const second = document.querySelector<HTMLElement>('#b')!
  followComposerToolbarColor(first)
  followComposerToolbarColor(second)
  const color = (root: HTMLElement) => root.querySelector<HTMLElement>('.xf-insert-link-button')!.style.getPropertyValue('--xf-composer-icon-color')
  expect(color(first)).toContain('--xf-accent')
  expect(color(second)).toBe('rgb(0, 186, 124)')
  first.insertAdjacentHTML('afterbegin', '<button><svg style="color:rgb(128, 156, 172)"></svg></button>')
  await vi.waitFor(() => expect(color(first)).toBe('rgb(128, 156, 172)'))
  expect(color(second)).toBe('rgb(0, 186, 124)')
})
