import {
  KeyRewindEnabled,
  KeyRewindNav,
  KeyRewindRevision,
} from '../../storage-keys'
import {
  REWIND_MESSAGE,
  extractRewindPost,
  rewindVisible,
  type RewindPost,
} from '../../shared/rewind'
import { rewindRequest } from '../../shared/rewind-client'
import { hasExtensionContext } from '../../shared/extension-context'
import { getRewindAccount } from '../options/rewind-account'
import {
  openRewindPanel,
  updateRewindTheme,
  resetRewindPanel,
  closeRewindPanel,
} from '../options/rewind-panel'
import {
  isNavExpanded,
  stripNavBadges,
  syncNavEntryLayout,
} from '../utilities/navEntry'
import { t } from '../../shared/i18n'

// X's cloned SVG has a fill class. Set paint on the path so it cannot inherit that fill.
export const REWIND_ICON =
  '<path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2"/>'
let started = false,
  enabled = false,
  nav = false,
  account = '',
  generation = -1,
  path = '',
  version = 0
let timer: ReturnType<typeof setTimeout> | undefined,
  frame = 0,
  io: IntersectionObserver | undefined
const observed = new Set<HTMLElement>(),
  known = new Map<string, string>(),
  pending = new Map<string, RewindPost>(),
  suppressed = new Set<string>()
let ready: Promise<void> | undefined
let cleanup: (() => void) | undefined

export function stopRewind() {
  started = false
  enabled = false
  nav = false
  version++
  cleanup?.()
  cleanup = undefined
  clearTimeout(timer)
  timer = undefined
  cancelAnimationFrame(frame)
  frame = 0
  io?.disconnect()
  observed.clear()
  pending.clear()
  known.clear()
  suppressed.clear()
  closeRewindPanel()
  document.querySelectorAll('.xf-rewind-nav, .xf-rewind-menu').forEach(el => el.remove())
}

async function refreshOwner() {
  const next = getRewindAccount()?.account || ''
  if (next !== account) {
    account = next
    generation = -1
    version++
    known.clear()
    pending.clear()
    suppressed.clear()
    resetRewindPanel()
  }
  if (path !== location.pathname) {
    path = location.pathname
    version++
    for (const id of pending.keys()) known.delete(id)
    pending.clear()
    io?.disconnect()
    observed.clear()
  }
  if (!account || generation >= 0) return
  const owner = account,
    token = version
  try {
    const result = await rewindRequest('status', { account: owner })
    if (owner === account && token === version) generation = result.generation
  } catch {
    /* Not logged in or extension was updated. */
  }
}
async function flush() {
  timer = undefined
  const owner = account,
    token = version,
    batch = [...pending.values()].slice(0, 20)
  if (
    !batch.length ||
    generation < 0 ||
    !enabled ||
    document.hidden ||
    location.pathname !== '/home' ||
    getRewindAccount()?.account !== owner
  ) {
    pending.clear()
    return
  }
  for (const post of batch) pending.delete(post.id)
  try {
    await rewindRequest('add', { account: owner, generation, posts: batch })
  } catch {
    if (token === version) {
      for (const p of batch) known.delete(p.id)
      window.dispatchEvent(new Event('xf-rewind-save-failed'))
    }
  }
  if (pending.size && token === version)
    timer = setTimeout(() => void flush(), 800)
}
function collect() {
  frame = 0
  if (
    !enabled ||
    generation < 0 ||
    document.hidden ||
    location.pathname !== '/home' ||
    getRewindAccount()?.account !== account
  )
    return
  if (innerWidth <= 600 && document.getElementById('xf-rewind-root')) return
  const visibleIds = new Set<string>()
  for (const article of observed) {
    if (!article.isConnected) {
      io?.unobserve(article)
      observed.delete(article)
      continue
    }
    const rect = article.getBoundingClientRect(),
      style = getComputedStyle(article)
    if (
      style.visibility === 'hidden' ||
      style.display === 'none' ||
      Number(style.opacity) === 0 ||
      rect.right <= 0 ||
      rect.left >= innerWidth
    )
      continue
    const shown = Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0)
    if (!rewindVisible(rect.height, shown, innerHeight)) continue
    const post = extractRewindPost(article)
    if (!post) continue
    visibleIds.add(post.id)
    if (suppressed.has(post.id)) continue
    const fingerprint = JSON.stringify({ ...post, firstSeenAt: 0 })
    if (known.get(post.id) === fingerprint) continue
    known.set(post.id, fingerprint)
    if (known.size > 3000) known.delete(known.keys().next().value!)
    pending.set(post.id, post)
    if (!timer) timer = setTimeout(() => void flush(), 800)
  }
  for (const id of suppressed) if (!visibleIds.has(id)) suppressed.delete(id)
}
function schedule() {
  if (!started) return
  if (!hasExtensionContext()) {
    stopRewind()
    return
  }
  if (!frame) frame = requestAnimationFrame(collect)
}
function open(trigger?: HTMLElement) {
  void openRewindPanel(trigger).catch(() => {})
}
function ensureNavigation() {
  const selector = '.xf-rewind-nav'
  if (!nav) {
    document.querySelectorAll(selector).forEach((n) => n.remove())
    return
  }
  const home = document.querySelector<HTMLElement>(
    'header[role="banner"] a[data-testid="AppTabBar_Home_Link"],nav[role="navigation"] a[href="/home"]',
  )
  if (home) {
    let entry = document.querySelector<HTMLElement>(selector)
    if (!entry) {
      entry = home.cloneNode(true) as HTMLElement
      entry.classList.add('xf-rewind-nav', 'xf-sidebar-button')
      entry.removeAttribute('href')
      entry.removeAttribute('data-testid')
      entry.removeAttribute('aria-current')
      entry.removeAttribute('id')
      entry.setAttribute('role', 'button')
      entry.tabIndex = 0
      stripNavBadges(entry)
      const svg = entry.querySelector('svg')
      if (svg) {
        svg.innerHTML = REWIND_ICON
        svg.setAttribute('viewBox', '0 0 24 24')
        svg.setAttribute('fill', 'none')
        svg.setAttribute('stroke', 'currentColor')
        svg.setAttribute('stroke-width', '1.75')
      }
      const target = entry
      entry.addEventListener('click', (e) => {
        e.preventDefault()
        open(target)
      })
      entry.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open(target)
        }
      })
    }
    if (home.nextElementSibling !== entry) home.after(entry)
    entry.setAttribute('aria-label', t('feature.rewind.label'))
    entry.title = t('feature.rewind.label')
    entry.setAttribute('aria-haspopup', 'dialog')
    syncNavEntryLayout(
      entry,
      isNavExpanded(home),
      home,
      t('feature.rewind.label'),
      !!document.getElementById('xf-rewind-root'),
    )
  }
}
export function dismissRewindMenu(menu: HTMLElement) {
  const root = menu.closest<HTMLElement>('[role="menu"]') || menu
  // X's menu portal has an unlabelled full-viewport dismissal surface.
  // Let X close its own menu so its focus lock and backdrop are also removed.
  const backdrop = Array.from(root.parentElement?.children || []).find((node) => {
    if (!(node instanceof HTMLElement) || node === root || node.childElementCount)
      return false
    const rect = node.getBoundingClientRect()
    return rect.left <= 0 && rect.top <= 0 &&
      rect.right >= document.documentElement.clientWidth &&
      rect.bottom >= document.documentElement.clientHeight
  }) as HTMLElement | undefined
  if (backdrop) backdrop.click()
  else root.dispatchEvent(new KeyboardEvent('keydown', {
    key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true,
  }))
}

// Observe only the menu opened by X's More button; never add to a tweet's dropdown.
function watchMore(event: Event) {
  const target = event.target as Element
  if (!target.closest?.('[data-testid="AppTabBar_More_Menu"]') || !nav) return
  const start = Date.now()
  const attempt = () => {
    if (!started) return
    const menu = document.querySelector<HTMLElement>(
      '[data-testid="Dropdown"], [role="menu"]',
    )
    if (menu) {
      if (!menu.querySelector('.xf-rewind-menu')) {
        const button = document.createElement('button')
        button.className = 'xf-rewind-menu'
        button.setAttribute('role', 'menuitem')
        button.style.cssText =
          'display:flex;align-items:center;gap:12px;padding:16px;width:100%;font:inherit;color:inherit;background:transparent;border:0;cursor:pointer'
        const nativeLabel = menu.querySelector<HTMLElement>('a [dir="ltr"]')
        if (nativeLabel) {
          const style = getComputedStyle(nativeLabel)
          button.style.fontSize = style.fontSize
          button.style.fontWeight = style.fontWeight
          button.style.lineHeight = style.lineHeight
        }
        button.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">${REWIND_ICON}</svg>`
        button.append(t('feature.rewind.label'))
        button.onclick = () => {
          dismissRewindMenu(menu)
          open(target as HTMLElement)
        }
        menu.append(button)
      }
    } else if (Date.now() - start < 1500) setTimeout(attempt, 50)
  }
  setTimeout(attempt, 0)
}
export function runRewind() {
  if (!started) return
  if (!hasExtensionContext()) {
    stopRewind()
    return
  }
  if (!ready)
    ready = refreshOwner().finally(() => {
      ready = undefined
      schedule()
    })
  if (enabled && location.pathname === '/home')
    for (const article of document.querySelectorAll<HTMLElement>(
      'article[data-testid="tweet"]',
    ))
      if (!observed.has(article)) {
        observed.add(article)
        io?.observe(article)
      }
  ensureNavigation()
  updateRewindTheme()
  schedule()
}
export function startRewind() {
  if (started || !hasExtensionContext()) return
  started = true
  const controller = new AbortController()
  const { signal } = controller
  io = new IntersectionObserver(schedule, {
    threshold: [0, 0.25, 0.5, 0.75, 1],
  })
  const configure = async () => {
    const s = await browser.storage.local.get([KeyRewindEnabled, KeyRewindNav])
    if (!started || !hasExtensionContext()) return
    enabled = s[KeyRewindEnabled] === 'on'
    nav = s[KeyRewindNav] === 'on'
    if (!enabled) {
      version++
      pending.clear()
      known.clear()
      io?.disconnect()
      observed.clear()
    }
    runRewind()
  }
  void configure().catch(stopRewind)
  window.addEventListener('scroll', schedule, { passive: true, capture: true, signal })
  window.addEventListener('resize', runRewind, { signal })
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      for (const id of pending.keys()) known.delete(id)
      pending.clear()
      version++
    } else runRewind()
  }, { signal })
  document.addEventListener('click', watchMore, { capture: true, signal })
  window.addEventListener('xf-rewind-retry-save', () => {
    known.clear()
    schedule()
  }, { signal })
  // Also supplements media loaded after the article and observes SPA account/route changes.
  const tick = setInterval(runRewind, 1500)
  window.addEventListener(
    'pagehide',
    stopRewind,
    { once: true, signal },
  )
  const storageChanged = (changes: Record<string, unknown>, area: string) => {
    if (area !== 'local') return
    if (changes[KeyRewindEnabled] || changes[KeyRewindNav]) void configure().catch(stopRewind)
    if (changes[KeyRewindRevision] && account) {
      const owner = account
      void rewindRequest('status', { account: owner })
        .then((result) => {
          if (owner !== account) return
          if (generation >= 0 && result.generation !== generation) {
            version++
            pending.clear()
            known.clear()
            for (const article of observed) {
              const p = extractRewindPost(article)
              if (p) suppressed.add(p.id)
            }
          }
          generation = result.generation
        })
        .catch(() => {})
    }
  }
  const messageReceived: Parameters<typeof browser.runtime.onMessage.addListener>[0] = (m, _sender, respond) => {
    if (m?.type !== REWIND_MESSAGE) return
    if (m.action === 'context') {
      respond(getRewindAccount())
      return
    }
    if (m.action === 'open') {
      open()
      respond({ ok: true })
      return
    }
  }
  cleanup = () => {
    controller.abort()
    clearInterval(tick)
    try { browser.storage.onChanged.removeListener(storageChanged) } catch {}
    try { browser.runtime.onMessage.removeListener(messageReceived) } catch {}
  }
  browser.storage.onChanged.addListener(storageChanged)
  browser.runtime.onMessage.addListener(messageReceived)
  void rewindRequest('hello').catch(() => {})
}
