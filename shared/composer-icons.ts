// Skia 绘制，24 × 24 画布、两行、2px 主线；圆点使用等价 circle 精简导出路径。
// Refactoring UI §7.3：按实际 20px 显示尺寸检查；数字用路径，避免字体差异。
const svg = (content: string) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">${content}</svg>`
const lines = '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M10 7L21 7M10 17L21 17"/>'
export const BULLET_LIST_ICON = svg(lines + '<g fill="currentColor"><circle cx="4.5" cy="7" r="1.75"/><circle cx="4.5" cy="17" r="1.75"/></g>')
export const NUMBERED_LIST_ICON = svg(lines + '<path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M3 5.25L4.5 4.25L4.5 9.75M3 9.75L6 9.75M2.75 15.25C2.75 13.25 6.25 13.25 6.25 15.25C6.25 16.25 4.5 17.5 2.75 19.5L6.25 19.5"/>')
