import addStyles, { removeStyles } from '../utilities/addStyles'

/**
 * 匹配 X 官方趋势雷达（Radar）页面的路径正则
 * 包括 /i/radar, /i/radar/:id, /i/business/radar 等
 */
export const RADAR_PATH_REGEX = /^\/i\/(business\/)?radar(\/|$)/

/**
 * 在 <body> 上维护标记属性 data-xf-radar，供 CSS 规则识别 Radar 页面，
 * 既用于排除主时间线 700px 宽度限制，也用于激活 Radar 专用宽屏样式。
 * SPA 路由切换时由动态巡检循环调用以保持实时同步。
 */
export function syncRadarPageMarker(state?: string) {
  if (typeof window === 'undefined' || !document?.body) return
  const isRadarPage = RADAR_PATH_REGEX.test(window.location.pathname)
  if (isRadarPage) {
    const currentVal = state || document.body.getAttribute('data-xf-radar') || 'wide'
    document.body.setAttribute('data-xf-radar', currentVal)
  } else {
    document.body.removeAttribute('data-xf-radar')
  }
}

/**
 * 控制 Radar 界面的视图宽度（off: 原版 ~1000px, wide: 宽屏 1400px, full: 撑满 100%）
 */
export function changeRadarWidth(state: string | number | boolean = 'wide') {
  const mode = String(state)
  syncRadarPageMarker(mode)

  if (mode === 'off') {
    removeStyles('radarWidth')
    return
  }

  const maxWidth = mode === 'full' ? '100%' : '1400px'

  addStyles(
    'radarWidth',
    `@media only screen and (min-width: 988px) {
      /* 放开 Radar 页面外层主容器与列壳的最大宽度限制（X 原生限制为 1000px） */
      body[data-xf-radar="wide"] main[role="main"] > div,
      body[data-xf-radar="wide"] main[role="main"] > div > div,
      body[data-xf-radar="wide"] main[role="main"] [data-testid="primaryColumn"],
      body[data-xf-radar="full"] main[role="main"] > div,
      body[data-xf-radar="full"] main[role="main"] > div > div,
      body[data-xf-radar="full"] main[role="main"] [data-testid="primaryColumn"] {
        max-width: ${maxWidth} !important;
        width: 100% !important;
      }

      /* 保持外层容器水平居中或自适应占满 */
      body[data-xf-radar="wide"] main[role="main"] > div,
      body[data-xf-radar="full"] main[role="main"] > div {
        margin-left: auto !important;
        margin-right: auto !important;
      }

      /* 优化 Radar 详情页双栏比例：右栏推文流原生写死了 md:w-[360px]，导致宽屏下左大右小严重失衡。
         将其拓宽为推特舒适阅读宽度区间（450px~560px），使左右两栏在宽屏下维持约 1.6:1 黄金比例 */
      body[data-xf-radar="wide"] main[role="main"] div[class*="md:flex-row"] > div:last-child,
      body[data-xf-radar="wide"] main[role="main"] div[class*="md:w-[360px]"],
      body[data-xf-radar="full"] main[role="main"] div[class*="md:flex-row"] > div:last-child,
      body[data-xf-radar="full"] main[role="main"] div[class*="md:w-[360px]"] {
        width: clamp(450px, 38%, 560px) !important;
        flex: 0 0 clamp(450px, 38%, 560px) !important;
      }
    }`
  )
}
