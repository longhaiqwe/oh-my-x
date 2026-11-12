import { createApp, h, shallowRef } from 'vue'
import AudiencePanel from './components/AudiencePanel.vue'
import css from './components/audience-panel.css?inline'
import { type AudienceSnapshot } from './audience'
import { getThemeColors } from '../content-scripts/utilities/colors'
import { getXFontFamily } from '../content-scripts/utilities/xTypography'
let closeActive: (() => void) | undefined
export const closeAudiencePanel = () => closeActive?.()
export function openAudiencePanel(
  snapshot: AudienceSnapshot,
  options: {
    saved?: boolean
    temporary?: boolean
    status?: string
    restart?: () => void
    onClose?: () => void
  } = {},
) {
  closeActive?.()
  const value = shallowRef(snapshot),
    status = shallowRef(options.status)
  const focus = document.activeElement as HTMLElement | null,
    host = document.createElement('div')
  host.id = 'xf-audience-panel'
  const root = host.attachShadow({ mode: 'open' }),
    style = document.createElement('style'),
    dialog = document.createElement('dialog'),
    mount = document.createElement('div')
  style.textContent = css
  mount.style.height = '100%'
  dialog.setAttribute('aria-labelledby', 'audience-title')
  dialog.append(mount)
  root.append(style, dialog)
  const theme = () => {
    const c = getThemeColors()
    const extension = !/^https?:$/.test(location.protocol)
    const colors = extension
      ? {
          bg: 'var(--color-card-bg)',
          fg: 'var(--color-text)',
          muted: 'var(--color-secondary-text)',
          border: 'var(--color-border)',
          hover: 'var(--color-sunken-bg)',
          accent: 'var(--color-accent)',
          'accent-text': 'var(--color-on-accent)',
          soft: 'var(--color-accent-subtle)',
          font: getComputedStyle(document.body).fontFamily,
          shadow: 'var(--shadow-xl)',
        }
      : {
          bg: c.bg,
          fg: c.fg,
          muted: c.fgSecondary,
          border: c.border,
          hover: c.hoverBg,
          accent: c.accent,
          'accent-text': 'var(--xf-accent-text, #fff)',
          soft: c.accentBg,
          font: getXFontFamily(),
          shadow: c.shadow,
        }
    for (const [key, v] of Object.entries(colors))
      host.style.setProperty(`--au-${key}`, v)
  }
  theme()
  document.body.append(host)
  const overflow = document.documentElement.style.overflow
  document.documentElement.style.overflow = 'hidden'
  let closed = false
  function close() {
    if (closed) return
    closed = true
    observer.disconnect()
    window.removeEventListener('resize', theme)
    dialog.close()
    app.unmount()
    host.remove()
    document.documentElement.style.overflow = overflow
    if (focus?.isConnected) focus.focus({ preventScroll: true })
    if (closeActive === close) closeActive = undefined
    options.onClose?.()
  }
  const app = createApp({
    render: () =>
      h(AudiencePanel, {
        snapshot: value.value,
        saved: options.saved,
        temporary: options.temporary,
        status: status.value,
        onClose: close,
        onRestart: options.restart,
      }),
  })
  app.mount(mount)
  closeActive = close
  dialog.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
      } else if (e.key === 'Tab') {
        const controls = [...dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        )].filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
        const first = controls[0], last = controls.at(-1)
        if (first && last && ((e.shiftKey && root.activeElement === first) || (!e.shiftKey && root.activeElement === last))) {
          e.preventDefault()
          ;(e.shiftKey ? last : first).focus({ preventScroll: true })
        }
      }
    },
    true,
  )
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault()
    close()
  })
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect()
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      )
        close()
    }
  })
  const observer = new MutationObserver(theme)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['style', 'class'],
  })
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['style', 'class'],
  })
  window.addEventListener('resize', theme)
  dialog.showModal()
  ;(root.querySelector('button') as HTMLElement)?.focus({ preventScroll: true })
  return {
    close,
    update: (next: AudienceSnapshot, message?: string) => {
      value.value = next
      status.value = message
    },
  }
}
