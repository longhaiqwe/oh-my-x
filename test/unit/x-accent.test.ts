import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type ColorsModule = typeof import('../../content-scripts/utilities/colors')

const BLUE = '29, 155, 240'
const PURPLE = '120, 86, 255'
const YELLOW = '255, 212, 0'

function accentStyleText() {
  return document.getElementById('xf-style-accent')?.textContent ?? ''
}

function setShortcutLink(color: string) {
  let root = document.getElementById('react-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'react-root'
    document.body.appendChild(root)
  }
  root.innerHTML = `<h2 role="heading"><a href="/i/keyboard_shortcuts" style="color: ${color};">查看键盘快捷键</a></h2>`
}

describe('X 强调色', () => {
  let colors: ColorsModule

  beforeEach(async () => {
    document.head.innerHTML = ''
    document.body.innerHTML = ''
    // 每个用例重新加载模块，清掉上次读到的颜色
    vi.resetModules()
    colors = await import('../../content-scripts/utilities/colors')
  })

  describe('parseAccentRgb', () => {
    it('接受不透明的彩色', () => {
      expect(colors.parseAccentRgb('rgb(120, 86, 255)')).toBe(PURPLE)
      expect(colors.parseAccentRgb('rgba(255, 212, 0, 1)')).toBe(YELLOW)
    })

    it('黑白灰、半透明、透明和无法解析的值都不算', () => {
      expect(colors.parseAccentRgb('rgb(15, 20, 25)')).toBeNull()
      expect(colors.parseAccentRgb('rgb(255, 255, 255)')).toBeNull()
      expect(colors.parseAccentRgb('rgb(113, 118, 123)')).toBeNull()
      expect(colors.parseAccentRgb('rgba(29, 155, 240, 0.1)')).toBeNull()
      expect(colors.parseAccentRgb('rgba(0, 0, 0, 0)')).toBeNull()
      expect(colors.parseAccentRgb('')).toBeNull()
      expect(colors.parseAccentRgb(undefined)).toBeNull()
    })
  })

  describe('readXAccentRgb', () => {
    it('从「查看键盘快捷键」隐藏链接读到强调色', () => {
      setShortcutLink('rgb(120, 86, 255)')
      expect(colors.readXAccentRgb()).toBe(PURPLE)
    })

    it('没有隐藏链接时读选中标签下方的横条', () => {
      document.body.innerHTML = `
        <div role="tablist">
          <div role="tab" aria-selected="false"><div style="background-color: rgb(83, 100, 113);"></div></div>
          <div role="tab" aria-selected="true"><div style="background-color: rgb(249, 24, 128);"></div></div>
        </div>`
      expect(colors.readXAccentRgb()).toBe('249, 24, 128')
    })

    it('来源是中性色时跳过，继续找下一个来源', () => {
      setShortcutLink('rgb(15, 20, 25)')
      document.body.insertAdjacentHTML(
        'beforeend',
        '<div data-testid="progressBar-bar" style="width: 0%; background-color: rgb(0, 186, 124);"></div>',
      )
      expect(colors.readXAccentRgb()).toBe('0, 186, 124')
    })

    it('不读发帖按钮（它现在是黑/白色）', () => {
      document.body.innerHTML =
        '<a data-testid="SideNav_NewTweet_Button" style="background-color: rgb(120, 86, 255);"></a>'
      expect(colors.readXAccentRgb()).toBeNull()
    })

    it('页面上没有任何来源时返回 null', () => {
      expect(colors.readXAccentRgb()).toBeNull()
    })
  })

  describe('syncXAccentColor', () => {
    it('读不到时写入默认蓝', () => {
      expect(colors.syncXAccentColor()).toBe(BLUE)
      const css = accentStyleText()
      expect(css).toContain(`--xf-accent: rgb(${BLUE});`)
      expect(css).toContain(`--xf-accent-rgb: ${BLUE};`)
      expect(css).toContain('--xf-accent-text: #fff;')
    })

    it('读到强调色后写入变量', () => {
      setShortcutLink('rgb(120, 86, 255)')
      expect(colors.syncXAccentColor()).toBe(PURPLE)
      expect(accentStyleText()).toContain(`--xf-accent: rgb(${PURPLE});`)
      expect(accentStyleText()).toContain(`--xf-accent-rgb: ${PURPLE};`)
    })

    it('用户换色后变量跟着更新；黄色配深色字', () => {
      setShortcutLink('rgb(120, 86, 255)')
      colors.syncXAccentColor()
      setShortcutLink('rgb(255, 212, 0)')
      expect(colors.syncXAccentColor()).toBe(YELLOW)
      const css = accentStyleText()
      expect(css).toContain(`--xf-accent-rgb: ${YELLOW};`)
      expect(css).toContain('--xf-accent-text: rgb(15, 20, 25);')
    })

    it('之后读不到时沿用上次读到的颜色，不跳回默认蓝', () => {
      setShortcutLink('rgb(120, 86, 255)')
      colors.syncXAccentColor()
      document.body.innerHTML = ''
      expect(colors.syncXAccentColor()).toBe(PURPLE)
      expect(accentStyleText()).toContain(`--xf-accent-rgb: ${PURPLE};`)
    })

    it('颜色没变时不重写样式；样式被移除后会补回', () => {
      setShortcutLink('rgb(120, 86, 255)')
      colors.syncXAccentColor()
      const style = document.getElementById('xf-style-accent')
      colors.syncXAccentColor()
      expect(document.getElementById('xf-style-accent')).toBe(style)

      style!.remove()
      colors.syncXAccentColor()
      expect(accentStyleText()).toContain(`--xf-accent-rgb: ${PURPLE};`)
    })
  })

  it('CSS 写法在变量缺失时退回默认蓝', () => {
    expect(colors.ACCENT).toBe(`var(--xf-accent, rgb(${BLUE}))`)
    expect(colors.accentAlpha(0.12)).toBe(`rgba(var(--xf-accent-rgb, ${BLUE}), 0.12)`)
    expect(colors.ACCENT_TEXT).toBe('var(--xf-accent-text, #fff)')
    expect(colors.getThemeColors().accent).toBe(colors.ACCENT)
  })
})

describe('动态功能循环', () => {
  it('每轮重新读取强调色，用户在 X 里换色后变量跟着变', async () => {
    document.head.innerHTML = ''
    vi.resetModules()
    const { dynamicFeatures } = await import('../../content-scripts/features/dynamic')

    setShortcutLink('rgb(120, 86, 255)')
    await dynamicFeatures.general(['navigation'])
    expect(accentStyleText()).toContain(`--xf-accent-rgb: ${PURPLE};`)

    setShortcutLink('rgb(255, 122, 0)')
    await dynamicFeatures.general(['navigation'])
    expect(accentStyleText()).toContain('--xf-accent-rgb: 255, 122, 0;')
  })
})

describe('注入页面的界面不再写死 X 蓝', () => {
  const projectRoot = join(__dirname, '../..')
  const X_BLUE = /#1d9bf0|rgba?\(\s*29,\s*155,\s*240/gi
  // 故意保留的固定蓝：表示含义，或照搬 X 不随强调色变的操作按钮颜色
  const ALLOWED: Record<string, number> = {
    // 曝光比、互动比的评级色（差/普通/良好/优秀/爆火）
    'content-scripts/options/stat-ratio.ts': 4,
    // 粉丝数徽章的档位色（t0 灰 / t1 蓝 / t2 绿 / t3 橙 / t4 粉）
    'content-scripts/features/user-followers.ts': 2,
    // X 收藏按钮的激活色是固定的 blue500
    'content-scripts/features/bookmark-counter.ts': 2,
    // 悬浮条照搬 X 操作按钮：回复、收藏固定蓝，引用绿、点赞粉
    'content-scripts/features/quick-interaction.ts': 10,
  }

  function listFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      return statSync(path).isDirectory() ? listFiles(path) : [path]
    })
  }

  it('除了列出的保留项，内容脚本和注入样式都用强调色变量', () => {
    const files = [
      ...listFiles(join(projectRoot, 'content-scripts')).filter((p) => p.endsWith('.ts')),
      join(projectRoot, 'public/css/main.css'),
    ]
    const counts: Record<string, number> = {}
    for (const file of files) {
      const rel = relative(projectRoot, file)
      if (rel === 'content-scripts/utilities/colors.ts') continue
      const text = readFileSync(file, 'utf8').replace(/var\(--xf-accent[^)]*\)/g, '')
      const n = text.match(X_BLUE)?.length ?? 0
      if (n > 0) counts[rel] = n
    }
    expect(counts).toEqual(ALLOWED)
  })
})
