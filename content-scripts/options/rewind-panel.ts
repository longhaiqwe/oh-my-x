import css from './rewind-panel.css?inline'
import { hasExtensionContext } from '../../shared/extension-context'
import { getStorage, setStorage } from '../utilities/storage'
import {
  KeyRewindEnabled,
  KeyRewindFilter,
  KeyRewindNav,
  KeyRewindOcr,
  KeyRewindOcrState,
  KeyRewindRevision,
} from '../../storage-keys'
import {
  REWIND_FILTERS,
  REWIND_GAP,
  normalizeRewind,
  type RewindFilter,
  type RewindPost,
  type RewindOcrState,
} from '../../shared/rewind'
import { rewindRequest, type RewindStatus } from '../../shared/rewind-client'
import {
  getLocale,
  onLocaleChange,
  t,
  type MessageKey,
} from '../../shared/i18n'
import { getRewindAccount } from './rewind-account'
import { getThemeColors } from '../utilities/colors'
import { getXFontFamily } from '../utilities/xTypography'

let host: HTMLElement | null = null,
  root: ShadowRoot | null = null,
  trigger: HTMLElement | undefined,
  status: RewindStatus | undefined
let query = '',
  filter: RewindFilter = 'all',
  scrollTop = 0,
  limit = 40,
  request = 0,
  composing = false
let inputTimer: ReturnType<typeof setTimeout> | undefined,
  refreshTimer: ReturnType<typeof setTimeout> | undefined
const inerted = new Map<HTMLElement, boolean>()
let scrollLock: { value: string; priority: string } | undefined
const icons = {
  history: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2',
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  close: 'm6 6 12 12M18 6 6 18',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z',
  arrow: 'M7 17 17 7M7 7h10v10',
}
const svg = (name: keyof typeof icons) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name]}"/></svg>`
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  )
function highlight(text: string) {
  const index = query.trim()
    ? text.toLocaleLowerCase().indexOf(query.trim().toLocaleLowerCase())
    : -1
  return index < 0
    ? escape(text)
    : escape(text.slice(0, index)) +
        '<mark>' +
        escape(text.slice(index, index + query.trim().length)) +
        '</mark>' +
        escape(text.slice(index + query.trim().length))
}
const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  root!.querySelector<T>(selector)!
function button(action: string, label: string, cls = 'link') {
  return `<button type="button" data-action="${action}" class="${cls}">${escape(label)}</button>`
}
function postHtml(post: RewindPost) {
  const ocrText =
    status?.ocr && query
      ? post.media
          .map((m) => m.text || '')
          .find((text) =>
            normalizeRewind(text).includes(normalizeRewind(query)),
          )
      : ''
  return `<article class="post">${post.avatar ? `<img class="avatar" src="${escape(post.avatar)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span class="avatar">${escape(post.name.slice(0, 1))}</span>`}<div class="body">${post.context ? `<div class="context">${highlight(post.context)}</div>` : ''}<div class="author"><b>${highlight(post.name)}</b><span>@${highlight(post.handle)}</span></div><p class="text collapsed">${highlight(post.text)}</p>${post.text.length > 240 ? button('expand', t('rewind.expand')) : ''}${post.media.length ? `<div class="media">${post.media.map((m) => `<figure><img src="${escape(m.src)}" alt="" loading="lazy" referrerpolicy="no-referrer">${m.kind === 'video' ? `<figcaption>${t('rewind.video')}</figcaption>` : ''}</figure>`).join('')}</div>` : ''}${post.quote ? `<div class="quote"><b>${highlight(post.quote.name)}</b>${highlight(post.quote.text)}</div>` : ''}${ocrText ? `<p class="ocr-match">${escape(t('rewind.ocrMatch', { text: ocrText.slice(0, 240) }))}</p>` : ''}<div class="foot"><span title="${escape(post.postedAt)}">${t('rewind.firstSeen')} ${new Date(post.firstSeenAt).toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit' })}</span><a href="https://x.com/${post.handle}/status/${post.id}" target="_blank" rel="noopener noreferrer">${t('rewind.original')}${svg('arrow')}</a></div></div></article>`
}
function renderResults(posts: RewindPost[]) {
  let previous = 0
  $('.list').innerHTML = posts
    .map((p) => {
      const group = !previous || previous - p.firstSeenAt > REWIND_GAP
      previous = p.firstSeenAt
      return (
        (group
          ? `<div class="group">${new Date(p.firstSeenAt).toLocaleString(getLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} · ${t('rewind.firstSeen')}</div>`
          : '') + postHtml(p)
      )
    })
    .join('')
  if (!posts.length) {
    const empty = status?.count === 0
    $('.list').innerHTML =
      `<div class="empty">${svg(empty ? 'history' : 'search')}<h2>${t(empty ? (status?.recording ? 'rewind.empty' : 'rewind.disabled') : 'rewind.noMatch')}</h2><p>${t(empty ? 'rewind.emptyDescription' : 'rewind.noMatchDescription')}</p>${empty ? (!status?.recording ? button('enable', t('rewind.enable')) : location.pathname !== '/home' ? `<a href="https://x.com/home">${t('rewind.home')}</a>` : '') : button('reset', t('rewind.reset'))}</div>`
  }
  $('.list')
    .querySelectorAll<HTMLImageElement>('img')
    .forEach((img) =>
      img.addEventListener(
        'error',
        () => {
          const replacement = document.createElement('span')
          replacement.className = img.classList.contains('avatar')
            ? 'avatar'
            : 'image-error'
          replacement.textContent = img.classList.contains('avatar')
            ? ''
            : t('rewind.imageFailed')
          img.replaceWith(replacement)
        },
        { once: true },
      ),
    )
}
function updateStatus() {
  if (!root || !status) return
  $('#identity').textContent =
    `${status.handle ? '@' + status.handle : status.account} · ${t('rewind.count', { count: status.count })}`
  $('#recording').textContent = t(
    status.recording ? 'rewind.recording' : 'rewind.paused',
  )
  $('#count').textContent = t('rewind.matches', { count: status.total })
  const phase = status.ocrState?.phase
  $('#ocr').textContent = t(
    !status.ocr
      ? 'rewind.ocrOff'
      : phase === 'download'
        ? 'rewind.ocrDownload'
        : phase === 'error'
          ? 'rewind.ocrError'
          : phase === 'working'
            ? 'rewind.ocrWorking'
            : 'rewind.ocrReady',
    { count: status.ocrState?.left || 0 },
  )
  if (
    status.ocr &&
    phase === 'download' &&
    typeof status.ocrState.progress === 'number'
  )
    $('#ocr').textContent += ` ${Math.round(status.ocrState.progress * 100)}%`
  $('#more').hidden = limit >= status.total
  $('#clear').hidden = !query
}
async function load(restore = false) {
  const token = ++request,
    owner = getRewindAccount()
  if (!root) return
  if (!owner) {
    $('.list').innerHTML =
      `<div class="empty"><p>${t('rewind.accountMissing')}</p>${button('retry', t('rewind.retry'))}</div>`
    return
  }
  try {
    // Background pages are capped at 100 rows per response.
    const response = await rewindRequest('query', {
      account: owner.account,
      query,
      filter,
      limit: Math.min(limit, 100),
    })
    for (
      let offset = 100;
      offset < Math.min(limit, response.total);
      offset += 100
    ) {
      if (token !== request) return
      const page = await rewindRequest('query', {
        account: owner.account,
        query,
        filter,
        offset,
        limit: Math.min(100, limit - offset),
      })
      if (page.generation !== response.generation) throw new Error('generation')
      response.posts.push(...page.posts)
    }
    if (
      token !== request ||
      !root ||
      getRewindAccount()?.account !== owner.account
    )
      return
    status = { ...response, handle: owner.handle }
    renderResults(response.posts)
    updateStatus()
    if (restore) $('.list').scrollTop = scrollTop
  } catch {
    if (root && token === request)
      $('.list').innerHTML =
        `<div class="empty"><p>${t('rewind.failed')}</p>${button('retry', t('rewind.retry'))}</div>`
  }
}
function setFilter(value: unknown, persist = false) {
  const next = REWIND_FILTERS.includes(value as RewindFilter)
    ? (value as RewindFilter)
    : 'all'
  if (filter !== next) {
    limit = 40
    scrollTop = 0
  }
  filter = next
  root
    ?.querySelectorAll<HTMLElement>('[data-filter]')
    .forEach((button) =>
      button.setAttribute(
        'aria-pressed',
        String(button.dataset.filter === filter),
      ),
    )
  if (persist)
    void setStorage({ [KeyRewindFilter]: filter }).then((saved) => {
      if (!saved && root) $('#notice').textContent = t('rewind.saveFailed')
    })
}
function storageChanged(changes: Record<string, unknown>, area: string) {
  if (area !== 'local' || !root) return
  if (changes[KeyRewindFilter]) {
    setFilter((changes[KeyRewindFilter] as { newValue?: unknown }).newValue)
    void load()
  }
  if (changes[KeyRewindRevision]) {
    const owner = getRewindAccount()?.account
    void rewindRequest('status', { account: owner })
      .then((next) => {
        if (!root || getRewindAccount()?.account !== owner) return
        if (status && next.generation !== status.generation) {
          scrollTop = 0
          limit = 40
          $('#new').hidden = true
          void load()
        } else if ($('.list').scrollTop > 20) {
          $('#new').hidden = false
        } else {
          clearTimeout(refreshTimer)
          refreshTimer = setTimeout(() => void load(), 200)
        }
      })
      .catch(() => {})
  }
  if (
    changes[KeyRewindEnabled] ||
    changes[KeyRewindOcr] ||
    changes[KeyRewindOcrState]
  ) {
    void getStorage([KeyRewindEnabled, KeyRewindOcr, KeyRewindOcrState])
      .then((s) => {
        if (!status || !root) return
        status.recording = s[KeyRewindEnabled] === 'on'
        status.ocr = s[KeyRewindOcr] === 'on'
        status.ocrState = (s[KeyRewindOcrState] as unknown as RewindOcrState) || {
          phase: 'off',
        }
        updateStatus()
        if (changes[KeyRewindOcr]) void load()
      }).catch(() => {})
  }
}
function restoreInert() {
  for (const [el, value] of inerted) el.inert = value
  inerted.clear()
  if (scrollLock) {
    document.documentElement.style.setProperty(
      'overflow',
      scrollLock.value,
      scrollLock.priority,
    )
    scrollLock = undefined
  }
}
export function updateRewindTheme() {
  if (!host || !root) return
  const colors = getThemeColors()
  for (const [name, value] of Object.entries({
    bg: colors.bg,
    fg: colors.fg,
    muted: colors.fgSecondary,
    border: colors.border,
    hover: colors.hoverBg,
    accent: colors.accent,
    soft: colors.accentBg,
    shadow: colors.shadow,
    font: getXFontFamily(),
  }))
    host.style.setProperty(`--rw-${name}`, value)
  const modal = innerWidth <= 600
  $('.panel').setAttribute('aria-modal', String(modal))
  if (modal) {
    if (!scrollLock) {
      const style = document.documentElement.style
      scrollLock = {
        value: style.getPropertyValue('overflow'),
        priority: style.getPropertyPriority('overflow'),
      }
      style.setProperty('overflow', 'hidden', 'important')
    }
    for (const child of document.body.children)
      if (
        child !== host &&
        child instanceof HTMLElement &&
        !inerted.has(child)
      ) {
        inerted.set(child, child.inert)
        child.inert = true
      }
  } else restoreInert()
}
export function closeRewindPanel() {
  if (!root) return
  scrollTop = $('.list').scrollTop
  request++
  clearTimeout(inputTimer)
  clearTimeout(refreshTimer)
  restoreInert()
  host?.remove()
  host = null
  root = null
  // Chrome can throw synchronously even while removing a stale listener.
  try { browser.storage.onChanged.removeListener(storageChanged) } catch {}
  window.removeEventListener('keydown', keydown, true)
  window.removeEventListener('xf-rewind-save-failed', saveFailed)
  document
    .querySelector('.xf-rewind-nav')
    ?.setAttribute('aria-expanded', 'false')
  trigger?.focus({ preventScroll: true })
}
const close = closeRewindPanel
export function resetRewindPanel() {
  const reopen = !!root
  close()
  query = ''
  filter = 'all'
  scrollTop = 0
  limit = 40
  status = undefined
  if (reopen) void openRewindPanel()
}
function keydown(e: KeyboardEvent) {
  if (!root) return
  if (e.key === 'Escape') {
    e.stopImmediatePropagation()
    e.preventDefault()
    close()
    return
  }
  if (e.key === 'Tab' && innerWidth <= 600) {
    const controls = [
      ...root.querySelectorAll<HTMLElement>('button,input,a'),
    ].filter((el) => !el.hidden && el.offsetParent !== null)
    const first = controls[0],
      last = controls.at(-1)
    if (e.shiftKey && root.activeElement === first) {
      e.preventDefault()
      last?.focus()
    } else if (!e.shiftKey && root.activeElement === last) {
      e.preventDefault()
      first?.focus()
    }
  }
}
function saveFailed() {
  if (root)
    $('#notice').innerHTML =
      `${t('rewind.saveFailed')} ${button('retrySave', t('rewind.retry'))}`
}
export async function openRewindPanel(from?: HTMLElement) {
  if (!hasExtensionContext()) return
  if (root) {
    $('#search').focus()
    return
  }
  trigger = from
  host = document.createElement('div')
  host.id = 'xf-rewind-root'
  root = host.attachShadow({ mode: 'open' })
  root.innerHTML = `<style>${css}</style><section class="panel" role="dialog" aria-label="${t('feature.rewind.label')}"><header class="header"><div class="heading">${svg('history')}<h2>${t('feature.rewind.label')}</h2><button class="icon" data-action="settings" aria-label="${t('rewind.details')}">${svg('settings')}</button><button class="icon" data-action="close" aria-label="${t('rewind.close')}">${svg('close')}</button></div><div class="status"><span id="identity">${t('rewind.local')}</span><span id="recording"></span></div><label class="search">${svg('search')}<input id="search" type="search" placeholder="${t('rewind.search')}" aria-label="${t('rewind.search')}"><button id="clear" class="icon" data-action="clear" aria-label="${t('rewind.clearSearch')}">${svg('close')}</button></label><div class="filters">${REWIND_FILTERS.map((f) => `<button data-filter="${f}" aria-pressed="${f === filter}">${t(`rewind.${f}` as MessageKey)}</button>`).join('')}</div><div class="meta"><span id="count" role="status"></span><button id="ocr" class="link" data-action="ocr"></button></div><div id="notice" class="notice" role="status"></div></header><button id="new" class="new" data-action="new" hidden>${t('rewind.new')}</button><div class="list"><div class="empty">${t('rewind.loading')}</div></div><footer class="footer"><button id="more" data-action="more" class="link" hidden>${t('rewind.more')}</button><span>${t('rewind.originalNote')}</span></footer></section>`
  document.body.append(host)
  updateRewindTheme()
  document
    .querySelector('.xf-rewind-nav')
    ?.setAttribute('aria-expanded', 'true')
  const search = $<HTMLInputElement>('#search')
  search.value = query
  search.focus({ preventScroll: true })
  const searchNow = () => {
    if (composing) return
    query = search.value
    limit = 40
    clearTimeout(inputTimer)
    inputTimer = setTimeout(() => void load(), 150)
  }
  search.addEventListener('input', searchNow)
  search.addEventListener('compositionstart', () => {
    composing = true
  })
  search.addEventListener('compositionend', () => {
    composing = false
    searchNow()
  })
  for (const type of ['keydown', 'keyup', 'keypress']) {
    root.addEventListener(type, (event) => event.stopPropagation())
  }
  let filterTouched = false
  root.addEventListener('click', (e) => {
    if (!hasExtensionContext()) {
      close()
      return
    }
    const target = (e.target as Element).closest<HTMLElement>('button')
    if (!target) return
    if (target.dataset.filter) {
      filterTouched = true
      setFilter(target.dataset.filter, true)
      void load()
      return
    }
    const action = target.dataset.action
    if (action === 'close') {
      close()
      return
    }
    if (action === 'expand') {
      target.previousElementSibling?.classList.remove('collapsed')
      target.remove()
      return
    }
    if (action === 'settings' || action === 'ocr') {
      void rewindRequest('settings').catch(() => {
        if (root) $('#notice').textContent = t('rewind.failed')
      })
      return
    }
    if (action === 'clear' || action === 'reset') {
      query = ''
      search.value = ''
      limit = 40
      if (action === 'reset') {
        filterTouched = true
        setFilter('all', true)
      }
      void load()
      search.focus()
    }
    if (action === 'more') {
      scrollTop = $('.list').scrollTop
      limit += 40
      void load(true)
    }
    if (action === 'new' || action === 'retry') {
      limit = 40
      $('#new').hidden = true
      void load()
    }
    if (action === 'retrySave') {
      window.dispatchEvent(new Event('xf-rewind-retry-save'))
      $('#notice').textContent = ''
    }
    if (action === 'enable')
      void getStorage([KeyRewindNav])
        .then((s) =>
          setStorage({
            [KeyRewindEnabled]: 'on',
            ...(s[KeyRewindNav] === undefined ? { [KeyRewindNav]: 'on' } : {}),
          }),
        )
        .then((saved) => saved ? load() : saveFailed())
        .catch(saveFailed)
  })
  try {
    browser.storage.onChanged.addListener(storageChanged)
  } catch {
    close()
    return
  }
  window.addEventListener('keydown', keydown, true)
  window.addEventListener('xf-rewind-save-failed', saveFailed)
  const openedRoot = root
  const preference = await getStorage([KeyRewindFilter])
  if (root !== openedRoot) return
  if (preference && !filterTouched) setFilter(preference[KeyRewindFilter])
  await load(true)
}
onLocaleChange(() => {
  if (root) {
    close()
    void openRewindPanel(trigger)
  }
})
