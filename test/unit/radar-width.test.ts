import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { JSDOM } from 'jsdom'
import { changeRadarWidth, syncRadarPageMarker, RADAR_PATH_REGEX } from '../../content-scripts/options/radar'

describe('radar-width', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM(
      `<!DOCTYPE html><html><head></head><body>
        <main role="main">
          <div id="radar-container">
            <div>Radar Content</div>
          </div>
        </main>
      </body></html>`,
      { pretendToBeVisual: true, url: 'https://x.com/home' },
    )
    globalThis.document = dom.window.document
    // @ts-expect-error jsdom window 与浏览器 Window 类型不完全兼容
    globalThis.window = dom.window
  })

  afterEach(() => {
    dom.window.close()
  })

  it('correctly matches radar routes with RADAR_PATH_REGEX', () => {
    expect(RADAR_PATH_REGEX.test('/i/radar')).toBe(true)
    expect(RADAR_PATH_REGEX.test('/i/radar/2100033969874178136')).toBe(true)
    expect(RADAR_PATH_REGEX.test('/i/business/radar')).toBe(true)
    expect(RADAR_PATH_REGEX.test('/i/business/radar/123')).toBe(true)
    expect(RADAR_PATH_REGEX.test('/home')).toBe(false)
    expect(RADAR_PATH_REGEX.test('/i/account_analytics')).toBe(false)
  })

  it('syncs data-xf-radar attribute based on current path and mode', () => {
    // 1. 默认在 /home 时不应有 data-xf-radar
    syncRadarPageMarker('wide')
    expect(document.body.hasAttribute('data-xf-radar')).toBe(false)

    // 2. 进入 /i/radar/2100033969874178136，带有 wide 标记
    dom.window.history.pushState({}, '', '/i/radar/2100033969874178136')
    syncRadarPageMarker('wide')
    expect(document.body.getAttribute('data-xf-radar')).toBe('wide')

    // 3. 切换为 full 模式
    syncRadarPageMarker('full')
    expect(document.body.getAttribute('data-xf-radar')).toBe('full')

    // 4. 离开 Radar 页面返回 /home，标记被移除
    dom.window.history.pushState({}, '', '/home')
    syncRadarPageMarker('wide')
    expect(document.body.hasAttribute('data-xf-radar')).toBe(false)
  })

  it('injects 1400px wide layout CSS when mode is wide', () => {
    dom.window.history.pushState({}, '', '/i/radar')
    changeRadarWidth('wide')

    const styleEl = document.getElementById('xf-style-radarWidth')
    expect(styleEl).not.toBeNull()
    const css = styleEl!.textContent!

    expect(css).toContain('body[data-xf-radar="wide"] main[role="main"] > div')
    expect(css).toContain('max-width: 1400px !important')
    expect(css).toContain('width: 100% !important')
    expect(css).toContain('margin-left: auto !important')
    expect(css).toContain('margin-right: auto !important')
    expect(css).toContain('clamp(450px, 38%, 560px) !important')
  })

  it('injects 100% full-width layout CSS when mode is full', () => {
    dom.window.history.pushState({}, '', '/i/radar')
    changeRadarWidth('full')

    const styleEl = document.getElementById('xf-style-radarWidth')
    expect(styleEl).not.toBeNull()
    const css = styleEl!.textContent!

    expect(css).toContain('body[data-xf-radar="full"] main[role="main"] > div')
    expect(css).toContain('max-width: 100% !important')
    expect(css).toContain('clamp(450px, 38%, 560px) !important')
  })

  it('removes radar width styles when mode is off', () => {
    dom.window.history.pushState({}, '', '/i/radar')
    changeRadarWidth('wide')
    expect(document.getElementById('xf-style-radarWidth')).not.toBeNull()

    changeRadarWidth('off')
    expect(document.getElementById('xf-style-radarWidth')).toBeNull()
  })
})
