// X 的字体通常设在文字节点上，body 上的字体不能代表原生界面的字体。
const FALLBACK_FONT = 'TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
const NATIVE_TEXT_SELECTORS = [
  '[data-testid="AppTabBar_Home_Link"] span',
  '[data-testid="UserName"] span',
  '[data-testid="User-Name"] span',
  '[data-testid="tweetText"]',
]

/** 只取字体族，不复制昵称或导航的字号、字重；没有原生文字时使用无衬线回退。 */
export function getXFontFamily(reference?: Element | null): string {
  if (reference) {
    const family = window.getComputedStyle(reference).fontFamily
    if (family && family !== 'inherit') return family
  }
  for (const selector of NATIVE_TEXT_SELECTORS) {
    const candidates = [...document.querySelectorAll(selector)].filter(node =>
      node.textContent?.trim() && !node.closest('.xf-profile-name-actions, .xf-sidebar-button, svg'),
    )
    // 从最内层文字取样，避开只有布局样式的外层 span。
    const text = candidates.find(node => !node.querySelector('span'))
    if (!text) continue
    const family = window.getComputedStyle(text).fontFamily
    if (family && family !== 'inherit') return family
  }
  return FALLBACK_FONT
}
