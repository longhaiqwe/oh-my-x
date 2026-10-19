import { KeySpamWhitelist, KeySpamBlacklist } from '../../../storage-keys'
import { getStorage, setStorage } from '../../utilities/storage'
import { parseHandleList } from '../../../shared/spam-rules'
import { getThemeColors } from '../../utilities/colors'
import { t } from '../../../shared/i18n'

// ─── 状态 ──────────────────────────────────────────

let activeDropdown: HTMLElement | null = null

// ─── 白/黑名单存储 ─────────────────────────────────

function getAuthorHandle(article: HTMLElement): string {
  const links = article.querySelectorAll<HTMLAnchorElement>('a[href^="/"][role="link"]')
  const nav = new Set(['home','explore','notifications','messages','bookmarks','profile','i','compose','search','settings'])
  for (const a of Array.from(links)) {
    const m = a.getAttribute('href')?.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/)
    if (m && m[1] && !nav.has(m[1].toLowerCase())) return m[1].toLowerCase()
  }
  return ''
}

async function addToList(key: string, handle: string): Promise<'added' | 'exists'> {
  const raw = await getStorage(key)
  const existing = parseHandleList(String(raw ?? ''))
  const h = handle.toLowerCase().replace(/^@/, '')
  if (existing.includes(h)) return 'exists'
  const next = [...existing, h].join('\n')
  await setStorage({ [key]: next })
  return 'added'
}

async function removeFromList(key: string, handle: string): Promise<'removed' | 'not_found'> {
  const raw = await getStorage(key)
  const existing = parseHandleList(String(raw ?? ''))
  const h = handle.toLowerCase().replace(/^@/, '')
  const filtered = existing.filter((x) => x !== h)
  if (filtered.length === existing.length) return 'not_found'
  await setStorage({ [key]: filtered.join('\n') })
  return 'removed'
}

let listBtnTimeoutId: ReturnType<typeof setTimeout> | null = null
let cleanupDropdownListeners: (() => void) | null = null

function closeDropdown() {
  if (listBtnTimeoutId) {
    clearTimeout(listBtnTimeoutId)
    listBtnTimeoutId = null
  }
  if (cleanupDropdownListeners) {
    cleanupDropdownListeners()
    cleanupDropdownListeners = null
  }
  if (activeDropdown) {
    activeDropdown.remove()
    activeDropdown = null
  }
}

// ─── 下拉菜单 ──────────────────────────────────────

interface MenuOption {
  label: string
  color: string
  bgColor: string
  /** 返回提示文字；ok 为 false（名单里本来就没有）时用次要色 */
  action: () => Promise<{ text: string; ok: boolean }>
}

export async function showListDropdown(article: HTMLElement, anchor: HTMLElement) {
  if (activeDropdown) {
    closeDropdown()
    return
  }

  const handle = getAuthorHandle(article)
  if (!handle) return

  const rawWhite = String(await getStorage(KeySpamWhitelist) ?? '')
  const rawBlack = String(await getStorage(KeySpamBlacklist) ?? '')
  const whitelist = new Set(parseHandleList(rawWhite).map((h) => h.toLowerCase()))
  const blacklist = new Set(parseHandleList(rawBlack).map((h) => h.toLowerCase()))
  const h = handle.toLowerCase()

  const c = getThemeColors()

  let menuOptions: MenuOption[]
  if (whitelist.has(h)) {
    menuOptions = [{
      label: `➖ ${t('listPage.removeAllow')}`,
      color: c.fgSecondary,
      bgColor: c.hoverBg,
      action: async () => {
        const r = await removeFromList(KeySpamWhitelist, handle)
        return r === 'removed' ? { text: t('listPage.removedAllow'), ok: true } : { text: t('listPage.notInAllow'), ok: false }
      },
    }]
  } else if (blacklist.has(h)) {
    menuOptions = [{
      label: `➖ ${t('listPage.removeBlock')}`,
      color: c.fgSecondary,
      bgColor: c.hoverBg,
      action: async () => {
        const r = await removeFromList(KeySpamBlacklist, handle)
        return r === 'removed' ? { text: t('listPage.removedBlock'), ok: true } : { text: t('listPage.notInBlock'), ok: false }
      },
    }]
  } else {
    menuOptions = [
      {
        label: `➕ ${t('listPage.addAllow')}`,
        color: c.accent,
        bgColor: c.accentBg,
        action: async () => {
          await removeFromList(KeySpamBlacklist, handle)
          const r = await addToList(KeySpamWhitelist, handle)
          return { text: r === 'added' ? t('listPage.addedAllow') : t('listPage.alreadyAllow'), ok: true }
        },
      },
      {
        label: `➕ ${t('listPage.addBlock')}`,
        color: c.black,
        bgColor: c.blackBg,
        action: async () => {
          await removeFromList(KeySpamWhitelist, handle)
          const r = await addToList(KeySpamBlacklist, handle)
          return { text: r === 'added' ? t('listPage.addedBlock') : t('listPage.alreadyBlock'), ok: true }
        },
      },
    ]
  }

  const dropdown = document.createElement('div')
  dropdown.setAttribute('data-xf-list-dropdown', '1')
  dropdown.style.cssText = [
    'position:fixed',
    'z-index:999998',
    `background:${c.bg}`,
    'border-radius:12px',
    `box-shadow:${c.shadow}`,
    `border:1px solid ${c.border}`,
    'padding:6px 0',
    'min-width:140px',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
    'font-size:13px',
  ].join(';')



  for (const opt of menuOptions) {
    const item = document.createElement('button')
    item.type = 'button'
    item.textContent = opt.label
    item.style.cssText = [
      'display:block',
      'width:100%',
      'padding:7px 12px',
      'text-align:left',
      'background:transparent',
      'border:none',
      `color:${c.fg}`,
      'cursor:pointer',
      'font-size:13px',
      'transition:background 0.12s,color 0.12s',
      'outline:none',
    ].join(';')

    item.addEventListener('mouseenter', () => {
      item.style.background = opt.bgColor
      item.style.color = opt.color
    })
    item.addEventListener('mouseleave', () => {
      item.style.background = 'transparent'
      item.style.color = c.fg
    })

    item.addEventListener('click', async (e) => {
      e.stopPropagation()
      e.preventDefault()
      item.disabled = true
      item.textContent = t('listPage.working')
      const result = await opt.action()
      item.textContent = result.text
      item.style.color = result.ok ? c.green : c.fgSecondary
      listBtnTimeoutId = setTimeout(() => closeDropdown(), 2000)
    })

    dropdown.appendChild(item)
  }

  document.body.appendChild(dropdown)
  activeDropdown = dropdown

  const rect = anchor.getBoundingClientRect()
  const ddW = dropdown.offsetWidth || 140
  const updatePosition = () => {
    if (!activeDropdown || !anchor || !document.contains(anchor)) {
      closeDropdown()
      return
    }
    const rect = anchor.getBoundingClientRect()
    const ddW = dropdown.offsetWidth || 140
    const ddH = dropdown.offsetHeight
    let top = rect.bottom + 4
    let left = rect.left - ddW + rect.width

    if (left < 4) left = 4
    if (top + ddH > window.innerHeight - 4) top = rect.top - ddH - 4

    dropdown.style.top = `${top}px`
    dropdown.style.left = `${left}px`
  }

  updatePosition()

  const outsideHandler = (e: MouseEvent) => {
    if (!dropdown.contains(e.target as Node) && !anchor.contains(e.target as Node)) {
      closeDropdown()
    }
  }

  window.addEventListener('resize', updatePosition)
  window.addEventListener('scroll', updatePosition, true)

  cleanupDropdownListeners = () => {
    document.removeEventListener('click', outsideHandler, true)
    window.removeEventListener('resize', updatePosition)
    window.removeEventListener('scroll', updatePosition, true)
  }

  setTimeout(() => {
    if (activeDropdown === dropdown) {
      document.addEventListener('click', outsideHandler, true)
    }
  }, 0)
}
