import addStyles, { stylesExist } from './addStyles'

/** X 默认强调色（蓝）。读不到 X 当前设置时用它，和改动前写死的颜色一致。 */
export const X_DEFAULT_ACCENT_RGB = '29, 155, 240'

/** 跟随 X 强调色，可直接写进 CSS 或行内样式；变量还没写入时退回默认蓝。 */
export const ACCENT = `var(--xf-accent, rgb(${X_DEFAULT_ACCENT_RGB}))`

/** 强调色底上的文字颜色（黄色强调色配深色字，其余配白字）。 */
export const ACCENT_TEXT = 'var(--xf-accent-text, #fff)'

/** 半透明的强调色，用于浅底、边框、阴影。 */
export function accentAlpha(alpha: number) {
  return `rgba(var(--xf-accent-rgb, ${X_DEFAULT_ACCENT_RGB}), ${alpha})`
}

// 按顺序尝试的取色来源。左侧发帖按钮现在是黑/白色，不跟强调色走，所以不用它。
const ACCENT_SOURCES = [
  // 每个页面根部都有的隐藏链接「查看键盘快捷键」，X 把强调色写在它的行内样式里
  { selector: '#react-root a[href="/i/keyboard_shortcuts"]', property: 'color' },
  // 标签栏里选中标签下方的横条
  { selector: '[role="tab"][aria-selected="true"] [style*="background-color"]', property: 'background-color' },
  // 时间线顶部的加载进度条
  { selector: '[data-testid="progressBar-bar"]', property: 'background-color' },
]

const ACCENT_STYLE_ID = 'accent'
let currentAccentRgb: string | null = null

/** 把 `rgb(r, g, b)` 解析成 `r, g, b`；半透明色和黑白灰不算强调色，返回 null。 */
export function parseAccentRgb(color: string | null | undefined): string | null {
  const m = color?.trim().match(/^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/)
  if (!m) return null
  if (m[4] !== undefined && Number(m[4]) < 1) return null
  const [r, g, b] = [m[1], m[2], m[3]].map(Number)
  if (Math.max(r, g, b) - Math.min(r, g, b) < 48) return null
  return `${r}, ${g}, ${b}`
}

/** 从页面上读 X 当前的强调色，读不到返回 null。 */
export function readXAccentRgb(): string | null {
  for (const { selector, property } of ACCENT_SOURCES) {
    const el = document.querySelector<HTMLElement>(selector)
    if (!el) continue
    // 先读行内样式，读不到再算样式，避免每轮动态循环都触发样式计算
    const rgb =
      parseAccentRgb(el.style.getPropertyValue(property)) ??
      parseAccentRgb(window.getComputedStyle(el).getPropertyValue(property))
    if (rgb) return rgb
  }
  return null
}

function getAccentTextColor(rgb: string) {
  const [r, g, b] = rgb.split(',').map(Number)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 160 ? 'rgb(15, 20, 25)' : '#fff'
}

/**
 * 读 X 当前强调色，写成 :root 上的 --xf-accent / --xf-accent-rgb / --xf-accent-text。
 * 变量放在插件自己的 <style> 里：X 会改写 <html> 的行内样式，放那里会被覆盖。
 * 读不到时沿用上次读到的颜色，一次都没读到过就用默认蓝。颜色没变时不重写。
 */
export function syncXAccentColor(): string {
  const rgb = readXAccentRgb() ?? currentAccentRgb ?? X_DEFAULT_ACCENT_RGB
  if (rgb !== currentAccentRgb || !stylesExist(ACCENT_STYLE_ID)) {
    addStyles(
      ACCENT_STYLE_ID,
      `:root { --xf-accent: rgb(${rgb}); --xf-accent-rgb: ${rgb}; --xf-accent-text: ${getAccentTextColor(rgb)}; }`,
    )
    currentAccentRgb = rgb
  }
  return rgb
}

function extractColor(selector: string, varName: string) {
  const element = document.querySelector(selector) as HTMLElement | null
  if (!element) return

  let color: string
  if (varName.includes('bg')) {
    color = window.getComputedStyle(element).backgroundColor
  } else if (varName.includes('border')) {
    color = window.getComputedStyle(element).borderColor
  } else {
    color = window.getComputedStyle(element).color
  }

  const root = document.documentElement
  if (!color) return

  if (root.style.getPropertyValue(`--${varName}-color`)) return

  const colorRgb = color.replace('rgb(', '').replace(')', '')
  root.style.setProperty(`--${varName}-color`, color)
  root.style.setProperty(`--${varName}-color-rgb`, colorRgb)
}

export function extractColorsAsRootVars() {
  extractColor('body', 'body-bg')
  extractColor('[data-testid="primaryColumn"]', 'border')
  extractColor('h2 > span', 'main-text')
  extractColor('div > span', 'main-text')
  extractColor('a > time', 'secondary-text')
  extractColor("[data-testid='primaryColumn'] div[aria-haspopup='menu'] > div > div > svg", 'secondary-text')
  extractColor('div > svg', 'glyphs')
}

export function getThemeColors() {
  const bodyBg = window.getComputedStyle(document.body).backgroundColor
  let isDark = false

  if (bodyBg) {
    const rgb = bodyBg.match(/\d+/g)
    if (rgb && rgb.length >= 3) {
      const [r, g, b] = rgb.map(Number)
      const brightness = (r * 299 + g * 587 + b * 114) / 1000
      if (brightness < 128) {
        isDark = true
      }
    }
  }

  return {
    isDark,
    bg: isDark ? (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' ? bodyBg : 'rgb(21, 32, 43)') : '#ffffff',
    fg: isDark ? 'rgb(247, 249, 249)' : 'rgb(15, 20, 25)',
    fgSecondary: isDark ? 'rgb(142, 150, 157)' : 'rgb(83, 100, 113)',
    border: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.12)',
    hoverBg: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    shadow: isDark ? '0 6px 24px rgba(0, 0, 0, 0.5)' : '0 6px 24px rgba(0, 0, 0, 0.15)',
    accent: ACCENT,
    accentBg: accentAlpha(0.12),
    black: 'rgb(239, 68, 68)',
    blackBg: 'rgba(239, 68, 68, 0.12)',
    green: 'rgb(0, 186, 124)',
  }
}
