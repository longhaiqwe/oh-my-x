import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  changeNavigationButtonsLabels,
  changeNavigationWidth,
} from '../../content-scripts/options/navigation'

const styleOf = (id: string) => document.getElementById(`xf-style-${id}`)?.textContent ?? null

describe('changeNavigationWidth', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = `<header role="banner"><div><div><div><nav role="navigation"></nav></div></div></div></header>`
  })

  afterEach(() => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
  })

  it('显示导航文字时，把占位层和内容层都设成指定宽度，只在 X 显示文字的窗口宽度下生效', () => {
    changeNavigationWidth(225, 'always')
    const css = styleOf('navigationWidth')!
    expect(css).toContain('@media only screen and (min-width: 1265px)')
    expect(css).toContain('header[role="banner"] > div,')
    expect(css).toContain('header[role="banner"] > div > div > div { width: 225px !important; }')
  })

  it('悬停模式同样使用这个宽度', () => {
    changeNavigationWidth(200, 'hover')
    expect(styleOf('navigationWidth')).toContain('width: 200px !important;')
  })

  it('导航文字为「从不」时不覆盖，保持图标宽度', () => {
    changeNavigationWidth(225, 'always')
    changeNavigationWidth(225, 'never')
    expect(styleOf('navigationWidth')).toBeNull()
  })

  it('等于 X 默认宽度或数值非法时移除样式，保持 X 原样', () => {
    changeNavigationWidth(225, 'always')
    changeNavigationWidth(275, 'always')
    expect(styleOf('navigationWidth')).toBeNull()

    changeNavigationWidth(225, 'always')
    changeNavigationWidth('bad', 'always')
    expect(styleOf('navigationWidth')).toBeNull()
  })

  it('悬停模式不再把导航栏写死为 275px，宽度交给导航栏宽度设置', () => {
    changeNavigationButtonsLabels('hover')
    expect(styleOf('showLabelsOnHover')).not.toContain('275px')
  })
})
