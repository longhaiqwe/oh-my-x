import {
  KeyQuickListAdderEnabled,
  KeyQuickListNavEnabled,
  KeyQuickListNavPosition,
  KeyQuickLists,
} from '../../storage-keys'
import {
  extractHandleFromCard,
  extractUserIdFromCard,
  toPlainQuickLists,
  sortQuickLists,
  type QuickListItem,
} from '../../shared/quick-list'
import { getStorage, setStorage } from '../utilities/storage'
import { ACCENT, ACCENT_TEXT, getThemeColors } from '../utilities/colors'

const BTN_CLASS = 'xf-quick-list-btn'
const NAV_CLASS = 'xf-quick-list-nav-entry'
const STYLE_ID = 'xf-quick-list-style'

const LIST_ICON_SVG_INNER = `
  <g>
    <path fill="currentColor" d="M3 4.5C3 3.12 4.12 2 5.5 2h13C19.88 2 21 3.12 21 4.5v15c0 1.38-1.12 2.5-2.5 2.5h-13C4.12 22 3 20.88 3 19.5v-15zM5.5 4c-.28 0-.5.22-.5.5v15c0 .28.22.5.5.5h13c.28 0 .5-.22.5-.5v-15c0-.28-.22-.5-.5-.5h-13zM16 10H8V8h8v2zm-8 2h8v2H8v-2zm0 4h5v2H8v-2z"/>
  </g>
`

let activeMenu: HTMLDivElement | null = null
let activeMenuOwner: HTMLElement | null = null
let navEntryEl: HTMLElement | null = null
let navPanelEl: HTMLDivElement | null = null
let navPanelAnchor: HTMLElement | null = null
let toastTimer: ReturnType<typeof setTimeout> | null = null

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
    .${BTN_CLASS} {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      border: 1px solid;
      border-radius: 9999px;
      background: transparent;
      cursor: pointer;
      white-space: nowrap;
      box-sizing: border-box;
      transition: background-color 0.15s ease, opacity 0.15s ease;
      user-select: none;
    }
    .${BTN_CLASS}:hover {
      background: var(--xf-ql-hover-bg, rgba(127, 127, 127, 0.1));
    }
    .${BTN_CLASS} svg {
      flex: none;
    }

    /* 浮动面板共通样式 */
    .xf-ql-panel {
      position: fixed;
      z-index: 99999;
      width: 278px;
      border-radius: 16px;
      font-size: 14px;
      font-family: inherit;
      overflow: hidden;
      animation: xf-ql-fade-in 0.15s ease-out;
    }
    @keyframes xf-ql-fade-in {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .xf-ql-panel-title {
      padding: 12px 16px 8px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .xf-ql-filters {
      display: flex;
      gap: 4px;
      padding: 0 12px 10px;
      border-bottom: 1px solid var(--xf-ql-border);
      overflow-x: auto;
    }
    .xf-ql-filter-btn {
      display: inline-flex;
      align-items: baseline;
      gap: 4px;
      padding: 4px 10px;
      font: inherit;
      font-size: 13px;
      line-height: 18px;
      border-radius: 9999px;
      border: none;
      background: transparent;
      color: var(--xf-ql-fg2);
      cursor: pointer;
      white-space: nowrap;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .xf-ql-filter-btn:hover {
      background: var(--xf-ql-hover-bg);
      color: inherit;
    }
    .xf-ql-filter-btn.active {
      background: var(--xf-ql-accent-bg);
      color: var(--xf-ql-accent);
      font-weight: 700;
    }
    .xf-ql-filter-count {
      font-size: 12px;
      font-weight: 400;
      font-variant-numeric: tabular-nums;
    }
    .xf-ql-pin-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      margin-right: -6px;
      padding: 0;
      border: none;
      border-radius: 9999px;
      background: transparent;
      color: var(--xf-ql-fg3);
      cursor: pointer;
      flex: none;
      transition: background-color 0.15s ease, color 0.15s ease;
    }
    .xf-ql-pin-btn:hover {
      background: var(--xf-ql-accent-bg);
      color: var(--xf-ql-accent);
    }
    .xf-ql-pin-btn.pinned {
      color: var(--xf-ql-accent);
    }
    .xf-ql-tag {
      font-size: 12px;
      line-height: 16px;
      padding: 0 5px;
      border-radius: 4px;
      border: 1px solid var(--xf-ql-border);
      color: var(--xf-ql-fg2);
      flex: none;
    }
    .xf-ql-divider {
      height: 1px;
      margin: 4px 16px;
      background: var(--xf-ql-border);
    }
    .xf-ql-panel-body {
      max-height: 280px;
      overflow-y: auto;
    }
    .xf-ql-panel-loading, .xf-ql-panel-empty {
      padding: 16px;
      font-size: 13px;
      line-height: 1.5;
    }
    .xf-ql-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 9px 16px;
      cursor: pointer;
      transition: background-color 0.15s ease;
      text-decoration: none;
      color: inherit;
    }
    .xf-ql-item:hover {
      background-color: var(--xf-ql-hover-bg);
    }
    .xf-ql-item:focus-visible,
    .xf-ql-filter-btn:focus-visible,
    .xf-ql-pin-btn:focus-visible {
      outline: 2px solid var(--xf-ql-accent);
      outline-offset: -2px;
    }
    .xf-ql-item-main {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex: 1;
    }
    .xf-ql-item-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
    }
    .xf-ql-item-state {
      margin-left: 8px;
      font-weight: 700;
      display: flex;
      align-items: center;
      flex: none;
    }

    /* 侧边栏「我的 Lists」面板：贴在入口右侧 */
    .xf-ql-nav-panel {
      animation-name: xf-ql-slide-in;
    }
    @keyframes xf-ql-slide-in {
      from { opacity: 0; transform: translateX(-4px); }
      to { opacity: 1; transform: translateX(0); }
    }
    .xf-ql-nav-panel .xf-ql-panel-title {
      font-size: 15px;
    }
    .xf-ql-nav-panel .xf-ql-panel-body {
      max-height: min(360px, calc(100vh - 120px));
      padding: 4px 0;
    }
    .xf-ql-nav-panel .xf-ql-item {
      padding: 8px 16px;
    }
    .xf-ql-nav-panel .xf-ql-item-name {
      font-size: 15px;
    }
    .xf-ql-panel-foot {
      padding: 9px 16px;
      font-size: 11px;
      border-top: 1px solid var(--xf-ql-border);
    }

    /* 加载 Spinner */
    .xf-ql-spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid currentColor;
      border-top-color: transparent;
      animation: xf-ql-spin 0.7s linear infinite;
    }
    @keyframes xf-ql-spin {
      to { transform: rotate(360deg); }
    }

    /* 侧边栏 Lists 入口样式 */
    .${NAV_CLASS} {
      cursor: pointer;
      user-select: none;
    }

    /* Toast 提示 */
    .xf-ql-toast {
      position: fixed;
      left: 50%;
      bottom: 32px;
      transform: translate(-50%, 16px);
      z-index: 100000;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      border-radius: 9999px;
      font-size: 14px;
      font-weight: 600;
      opacity: 0;
      transition: opacity 0.2s ease, transform 0.2s ease;
      pointer-events: none;
      max-width: 80vw;
    }
    .xf-ql-toast.xf-ql-toast-show {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  `
  document.documentElement.appendChild(style)
}

function applyPanelTheme(panel: HTMLElement) {
  const theme = getThemeColors()
  panel.style.backgroundColor = theme.bg
  panel.style.color = theme.fg
  panel.style.border = `1px solid ${theme.border}`
  panel.style.boxShadow = theme.shadow
  panel.style.setProperty('--xf-ql-border', theme.border)
  panel.style.setProperty('--xf-ql-hover-bg', theme.hoverBg)
  panel.style.setProperty('--xf-ql-fg2', theme.fgSecondary)
  // 比第二档文字再浅一档，给每行都有的图钉用，避免一列图标抢眼
  panel.style.setProperty('--xf-ql-fg3', theme.isDark ? 'rgb(113, 118, 123)' : 'rgb(139, 152, 165)')
  panel.style.setProperty('--xf-ql-accent', ACCENT)
  panel.style.setProperty('--xf-ql-accent-bg', theme.accentBg)
}

function pinIconSvg(filled: boolean) {
  return `<svg width="16" height="16" viewBox="0 0 24 24" fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>`
}

function showQuickListToast(text: string, ok: boolean) {
  let toast = document.querySelector('.xf-ql-toast') as HTMLElement | null
  if (toast) toast.remove()
  if (toastTimer) clearTimeout(toastTimer)

  const theme = getThemeColors()
  toast = document.createElement('div')
  toast.className = 'xf-ql-toast'
  toast.style.backgroundColor = theme.isDark ? 'rgb(239, 243, 244)' : 'rgb(15, 20, 25)'
  toast.style.color = theme.isDark ? 'rgb(15, 20, 25)' : 'rgb(255, 255, 255)'
  toast.style.boxShadow = theme.shadow

  const iconColor = ok ? 'rgb(0, 186, 124)' : 'rgb(244, 33, 46)'
  toast.innerHTML = `
    <span style="display:flex;color:${iconColor}">
      ${
        ok
          ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
          : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
      }
    </span>
    <span>${escapeHtml(text)}</span>
  `
  document.body.appendChild(toast)

  requestAnimationFrame(() => requestAnimationFrame(() => toast?.classList.add('xf-ql-toast-show')))
  toastTimer = setTimeout(() => {
    toast?.classList.remove('xf-ql-toast-show')
    setTimeout(() => toast?.remove(), 250)
  }, 2600)
}

function closeQuickListMenu() {
  if (activeMenu) {
    activeMenu.remove()
    activeMenu = null
    activeMenuOwner = null
  }
  document.removeEventListener('click', onDocMenuClick, true)
}

function onDocMenuClick(e: MouseEvent) {
  if (activeMenu && !activeMenu.contains(e.target as Node) && e.target !== activeMenuOwner) {
    closeQuickListMenu()
  }
}

async function getSavedLists(): Promise<QuickListItem[]> {
  try {
    const raw = await getStorage(KeyQuickLists)
    return toPlainQuickLists(raw)
  } catch {}
  return []
}

async function toggleQuickListMenu(btn: HTMLElement, handle: string, userId: string | null) {
  if (activeMenu && activeMenuOwner === btn) {
    closeQuickListMenu()
    return
  }
  closeQuickListMenu()
  activeMenuOwner = btn

  ensureStyles()
  const panel = document.createElement('div')
  panel.className = 'xf-ql-panel'
  applyPanelTheme(panel)

  panel.innerHTML = `
    <div class="xf-ql-panel-title">
      <span>加入 @${escapeHtml(handle)} 到…</span>
    </div>
    <div class="xf-ql-panel-body">
      <div class="xf-ql-panel-loading">正在读取 Lists…</div>
    </div>
  `
  document.body.appendChild(panel)
  activeMenu = panel
  document.addEventListener('click', onDocMenuClick, true)

  const rect = btn.getBoundingClientRect()
  const pw = 268
  let left = Math.min(rect.left, window.innerWidth - pw - 12)
  if (left < 12) left = 12
  let top = rect.bottom + 8
  if (top + 220 > window.innerHeight) {
    top = Math.max(12, rect.top - 220)
  }
  panel.style.left = `${left}px`
  panel.style.top = `${top}px`

  const lists = await getSavedLists()
  const body = panel.querySelector('.xf-ql-panel-body') as HTMLElement | null
  if (!body) return

  if (!lists.length) {
    body.innerHTML = `
      <div class="xf-ql-panel-empty" style="color: var(--secondary-text-color, #71767b); text-align: center;">
        <div style="margin-bottom: 8px;">还没有配置 List</div>
        <button class="xf-ql-sync-btn" style="padding: 6px 14px; font-size: 12px; font-weight: 600; border-radius: 9999px; background-color: ${ACCENT}; color: ${ACCENT_TEXT}; border: none; cursor: pointer; transition: opacity 0.15s ease;">
          从 X 一键同步 Lists
        </button>
      </div>
    `
    const syncBtn = body.querySelector('.xf-ql-sync-btn') as HTMLButtonElement | null
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true
        syncBtn.innerHTML = '<span class="xf-ql-spinner" style="margin-right: 4px; vertical-align: middle;"></span> 同步中…'
        try {
          const res = await browser.runtime.sendMessage({ type: 'XF_FETCH_OWNED_LISTS' })
          if (res?.ok && Array.isArray(res.lists) && res.lists.length > 0) {
            const clean = toPlainQuickLists(res.lists)
            await setStorage({ [KeyQuickLists]: clean })
            showQuickListToast(`已成功同步 ${clean.length} 个 Lists`, true)
            closeQuickListMenu()
            toggleQuickListMenu(btn, handle, userId)
          } else {
            syncBtn.disabled = false
            syncBtn.textContent = '未找到 Lists，点击重试'
            showQuickListToast(res?.error || '未拉取到 Lists，请确认已在 X 登录且创建了 List', false)
          }
        } catch (e: any) {
          syncBtn.disabled = false
          syncBtn.textContent = '同步失败，点击重试'
          showQuickListToast('同步异常：' + (e?.message || '未知错误'), false)
        }
      })
    }
    return
  }

  const ownedLists = sortQuickLists(lists.filter((l) => l.isOwned !== false))
  if (!ownedLists.length) {
    body.innerHTML = `
      <div class="xf-ql-panel-empty" style="color: var(--secondary-text-color, #71767b); font-size: 13px; line-height: 1.5; text-align: center;">
        您目前仅同步了关注的 List。<br>
        X 限制只能向<strong>自己创建的 List</strong> 添加成员。<br>
        可在插件设置中创建或添加自己的 List。
      </div>
    `
    return
  }

  body.innerHTML = ''
  ownedLists.forEach((l) => {
    const item = document.createElement('div')
    item.className = 'xf-ql-item'
    item.innerHTML = `
      <div style="display:flex; align-items:center; min-width:0; flex:1; margin-right:8px;">
        ${l.isPinned ? '<span style="margin-right:4px; font-size:11px; flex:none;">📌</span>' : ''}
        <span class="xf-ql-item-name" title="${escapeHtml(l.name)}">${escapeHtml(l.name)}</span>
      </div>
      <span class="xf-ql-item-state"></span>
    `

    item.addEventListener('click', async () => {
      if (item.dataset.loading === '1') return
      item.dataset.loading = '1'
      const state = item.querySelector('.xf-ql-item-state') as HTMLElement | null
      if (state) state.innerHTML = '<span class="xf-ql-spinner"></span>'

      try {
        const res = await browser.runtime.sendMessage({
          type: 'XF_ADD_TO_LIST',
          listId: l.id,
          handle,
          userId,
        })
        if (res?.ok) {
          if (state) {
            state.innerHTML = '<span style="color: rgb(0, 186, 124)">✓</span>'
          }
          closeQuickListMenu()
          showQuickListToast(
            res.already ? `@${handle} 已在「${l.name}」中` : `已加入「${l.name}」`,
            true,
          )
        } else {
          item.dataset.loading = '0'
          if (state) {
            state.innerHTML = '<span style="color: rgb(244, 33, 46)">✗</span>'
          }
          showQuickListToast(`加入失败：${res?.error || '未知错误'}`, false)
        }
      } catch (e: any) {
        item.dataset.loading = '0'
        if (state) {
          state.innerHTML = '<span style="color: rgb(244, 33, 46)">✗</span>'
        }
        showQuickListToast(`加入失败：${e?.message || '未知错误'}`, false)
      }
    })

    body.appendChild(item)
  })

  const foot = document.createElement('div')
  foot.className = 'xf-ql-panel-foot'
  foot.style.color = 'var(--secondary-text-color, #71767b)'
  foot.textContent = lists.some((l) => l.isOwned === false)
    ? '已自动过滤关注列表（仅限自己创建的列表）'
    : '可在插件弹窗中增删或同步 Lists'
  panel.appendChild(foot)
}

function escapeHtml(str: string): string {
  return String(str || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c] || c))
}

export function scanAndInjectHoverCards(enabled = true) {
  if (!enabled) {
    document.querySelectorAll(`.${BTN_CLASS}`).forEach((el) => el.remove())
    return
  }

  ensureStyles()
  document.querySelectorAll('div[data-testid="HoverCard"]').forEach((card) => {
    if (card.querySelector(`.${BTN_CLASS}`)) return
    const handle = extractHandleFromCard(card)
    if (!handle) return

    const followBtn =
      card.querySelector('[data-testid$="-unfollow"]') ||
      card.querySelector('[data-testid$="-follow"]')
    if (!followBtn) return

    const btn = document.createElement('button')
    btn.className = BTN_CLASS
    btn.title = `加入 List (@${handle})`
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true">
        <path d="M12 5v14M5 12h14"/>
      </svg>
      <span>List</span>
    `

    btn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      const currentUserId = extractUserIdFromCard(card, followBtn)
      toggleQuickListMenu(btn, handle, currentUserId)
    })

    // X 的字体写在按钮内部的文字节点上，外层 button 只有浏览器默认字体
    const labelEl = followBtn.querySelector('span') || followBtn
    const cs = window.getComputedStyle(labelEl)
    const theme = getThemeColors()
    Object.assign(btn.style, {
      height: `${(followBtn as HTMLElement).offsetHeight || 32}px`,
      paddingLeft: '14px',
      paddingRight: '14px',
      fontFamily: cs.fontFamily || 'TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      borderColor: theme.isDark ? 'rgb(83, 100, 113)' : 'rgb(207, 217, 222)',
      color: theme.isDark ? 'rgb(239, 243, 244)' : 'rgb(15, 20, 25)',
    })
    btn.style.setProperty('--xf-ql-hover-bg', theme.hoverBg)

    const parent = followBtn.parentElement
    if (parent) {
      const pcs = window.getComputedStyle(parent)
      if (pcs.display !== 'flex') parent.style.display = 'flex'
      parent.style.flexDirection = 'row'
      parent.style.alignItems = 'center'
      parent.style.gap = '8px'
      parent.insertBefore(btn, followBtn.nextSibling)
    }
  })
}

// ---------- 侧边栏 Lists 入口 ----------
const NAV_PANEL_WIDTH = 300
const NAV_PANEL_GAP = 8
const VIEWPORT_MARGIN = 8

/**
 * 面板放在入口右侧、顶部和入口对齐；右侧放不下改放左侧，上下不超出视口。
 */
export function computeNavPanelPosition(
  anchor: { left: number; right: number; top: number },
  panel: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  let left = anchor.right + NAV_PANEL_GAP
  if (left + panel.width > viewport.width - VIEWPORT_MARGIN) {
    left = anchor.left - panel.width - NAV_PANEL_GAP
  }
  left = Math.max(VIEWPORT_MARGIN, left)
  const maxTop = viewport.height - panel.height - VIEWPORT_MARGIN
  const top = Math.max(VIEWPORT_MARGIN, Math.min(anchor.top, maxTop))
  return { left, top }
}

/**
 * 入口链接被设成占满左栏宽度，按它定位面板会落到左栏最右侧、离文字很远；
 * 改按链接里那块圆角高亮（图标 + 文字）定位。
 */
export function getNavAnchorRect(entry: HTMLElement): DOMRect {
  const pill = entry.firstElementChild as HTMLElement | null
  const rect = pill?.getBoundingClientRect()
  return rect && rect.width > 0 ? rect : entry.getBoundingClientRect()
}

/** 面板打开时入口保持高亮，看得出面板是从哪里弹出来的。 */
function setNavEntryActive(entry: HTMLElement | null, active: boolean) {
  if (!entry) return
  entry.setAttribute('aria-expanded', String(active))
  const pill = entry.firstElementChild as HTMLElement | null
  if (pill) pill.style.backgroundColor = active ? getThemeColors().hoverBg : ''
}

function onNavResize() {
  positionNavPanel()
}

function closeNavPanel() {
  if (navPanelEl) {
    navPanelEl.remove()
    navPanelEl = null
  }
  setNavEntryActive(navPanelAnchor, false)
  navPanelAnchor = null
  document.removeEventListener('click', onNavDocClick, true)
  window.removeEventListener('resize', onNavResize)
}

function onNavDocClick(e: MouseEvent) {
  const anchor = navPanelAnchor || navEntryEl
  if (
    navPanelEl &&
    !navPanelEl.contains(e.target as Node) &&
    !(anchor && anchor.contains(e.target as Node))
  ) {
    closeNavPanel()
  }
}

function positionNavPanel() {
  const anchor = navPanelAnchor || navEntryEl
  if (!navPanelEl || !anchor) return

  const { left, top } = computeNavPanelPosition(
    getNavAnchorRect(anchor),
    { width: navPanelEl.offsetWidth || NAV_PANEL_WIDTH, height: navPanelEl.offsetHeight },
    { width: window.innerWidth, height: window.innerHeight },
  )
  navPanelEl.style.left = `${left}px`
  navPanelEl.style.top = `${top}px`
}

async function toggleNavPanel(entryEl: HTMLElement) {
  if (navPanelEl) {
    closeNavPanel()
    return
  }

  ensureStyles()
  navPanelEl = document.createElement('div')
  navPanelEl.className = 'xf-ql-panel xf-ql-nav-panel'
  navPanelEl.style.width = `${NAV_PANEL_WIDTH}px`
  applyPanelTheme(navPanelEl)

  navPanelEl.innerHTML = `
    <div class="xf-ql-panel-title">我的 Lists</div>
    <div class="xf-ql-panel-filters-container"></div>
    <div class="xf-ql-panel-body"><div class="xf-ql-panel-loading">加载中…</div></div>
  `
  document.body.appendChild(navPanelEl)
  navPanelAnchor = entryEl
  setNavEntryActive(entryEl, true)
  positionNavPanel()
  document.addEventListener('click', onNavDocClick, true)
  window.addEventListener('resize', onNavResize)

  const lists = await getSavedLists()
  if (!navPanelEl) return

  const body = navPanelEl.querySelector('.xf-ql-panel-body') as HTMLElement | null
  const filtersContainer = navPanelEl.querySelector('.xf-ql-panel-filters-container') as HTMLElement | null
  if (!body) return

  if (!lists.length) {
    body.innerHTML = `
      <div class="xf-ql-panel-empty" style="color: var(--xf-ql-fg2); text-align: center;">
        <div style="margin-bottom: 8px;">还没有配置 List</div>
        <button class="xf-ql-sync-btn" style="padding: 6px 14px; font-size: 12px; font-weight: 600; border-radius: 9999px; background-color: ${ACCENT}; color: ${ACCENT_TEXT}; border: none; cursor: pointer; transition: opacity 0.15s ease;">
          从 X 一键同步 Lists
        </button>
      </div>
    `
    const syncBtn = body.querySelector('.xf-ql-sync-btn') as HTMLButtonElement | null
    if (syncBtn) {
      syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true
        syncBtn.innerHTML = '<span class="xf-ql-spinner" style="margin-right: 4px; vertical-align: middle;"></span> 同步中…'
        try {
          const res = await browser.runtime.sendMessage({ type: 'XF_FETCH_OWNED_LISTS' })
          if (res?.ok && Array.isArray(res.lists) && res.lists.length > 0) {
            const clean = toPlainQuickLists(res.lists)
            await setStorage({ [KeyQuickLists]: clean })
            showQuickListToast(`已成功同步 ${clean.length} 个 Lists`, true)
            closeNavPanel()
            void toggleNavPanel(entryEl)
          } else {
            syncBtn.disabled = false
            syncBtn.textContent = '未找到 Lists，点击重试'
            showQuickListToast(res?.error || '未拉取到 Lists，请确认已在 X 登录且创建或关注了 List', false)
          }
        } catch (e: any) {
          syncBtn.disabled = false
          syncBtn.textContent = '同步失败，点击重试'
          showQuickListToast('同步异常：' + (e?.message || '未知错误'), false)
        }
      })
    }
    positionNavPanel()
    return
  }

  let activeTab: 'all' | 'pinned' | 'owned' | 'followed' = 'all'

  const renderLists = () => {
    if (!body) return
    let filtered = lists
    if (activeTab === 'pinned') filtered = lists.filter((l) => l.isPinned)
    else if (activeTab === 'owned') filtered = lists.filter((l) => l.isOwned !== false)
    else if (activeTab === 'followed') filtered = lists.filter((l) => l.isOwned === false)

    const sorted = sortQuickLists(filtered)

    if (!sorted.length) {
      body.innerHTML = `
        <div class="xf-ql-panel-empty" style="color: var(--xf-ql-fg2); text-align: center;">
          暂无对应分类的 List
        </div>
      `
      positionNavPanel()
      return
    }

    body.innerHTML = ''
    sorted.forEach((l, i) => {
      // 置顶的和其余的之间加一条分隔线
      if (i > 0 && sorted[i - 1].isPinned && !l.isPinned) {
        const divider = document.createElement('div')
        divider.className = 'xf-ql-divider'
        body.appendChild(divider)
      }

      const a = document.createElement('a')
      a.className = 'xf-ql-item'
      a.href = `/i/lists/${l.id}`

      // 「关注」标签页里每行都是关注的，不再重复标
      const tagHtml = l.isOwned === false && activeTab !== 'followed'
        ? `<span class="xf-ql-tag" title="${l.ownerHandle ? '创建者：@' + escapeHtml(l.ownerHandle) : '关注的列表'}">关注</span>`
        : ''
      const pinLabel = l.isPinned ? '取消置顶' : '置顶'

      a.innerHTML = `
        <span class="xf-ql-item-main">
          <span class="xf-ql-item-name">${escapeHtml(l.name)}</span>
          ${tagHtml}
        </span>
        <button type="button" class="xf-ql-pin-btn${l.isPinned ? ' pinned' : ''}" aria-pressed="${Boolean(l.isPinned)}" aria-label="${pinLabel}「${escapeHtml(l.name)}」" title="${pinLabel}">
          ${pinIconSvg(Boolean(l.isPinned))}
        </button>
      `
      // 名称被截断时才给完整名称的悬停提示
      a.addEventListener('mouseenter', () => {
        const name = a.querySelector('.xf-ql-item-name') as HTMLElement | null
        if (!name) return
        if (name.scrollWidth > name.clientWidth) name.title = l.name
        else name.removeAttribute('title')
      })
      a.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.xf-ql-pin-btn')) return
        closeNavPanel()
      })

      const pinBtn = a.querySelector('.xf-ql-pin-btn') as HTMLButtonElement | null
      if (pinBtn) {
        pinBtn.addEventListener('click', async (e) => {
          e.preventDefault()
          e.stopPropagation()
          l.isPinned = !l.isPinned
          await setStorage({ [KeyQuickLists]: toPlainQuickLists(lists) })
          showQuickListToast(l.isPinned ? `已置顶「${l.name}」` : `已取消置顶「${l.name}」`, true)
          renderFilters()
          renderLists()
        })
      }

      body.appendChild(a)
    })
    positionNavPanel()
  }

  const renderFilters = () => {
    if (!filtersContainer) return
    const hasPinned = lists.some((l) => l.isPinned)
    const hasFollowed = lists.some((l) => l.isOwned === false)
    if (!hasPinned && !hasFollowed) {
      filtersContainer.innerHTML = ''
      return
    }

    const tabs: { id: 'all' | 'pinned' | 'owned' | 'followed'; label: string; count: number; show: boolean }[] = [
      { id: 'all', label: '全部', count: lists.length, show: true },
      { id: 'pinned', label: '置顶', count: lists.filter(l => l.isPinned).length, show: hasPinned },
      { id: 'owned', label: '创建', count: lists.filter(l => l.isOwned !== false).length, show: true },
      { id: 'followed', label: '关注', count: lists.filter(l => l.isOwned === false).length, show: hasFollowed },
    ]

    filtersContainer.innerHTML = `
      <div class="xf-ql-filters" role="tablist">
        ${tabs.filter(t => t.show).map(t => `
          <button type="button" role="tab" aria-selected="${activeTab === t.id}" class="xf-ql-filter-btn${activeTab === t.id ? ' active' : ''}" data-tab="${t.id}">
            ${t.label}<span class="xf-ql-filter-count">${t.count}</span>
          </button>
        `).join('')}
      </div>
    `

    filtersContainer.querySelectorAll('.xf-ql-filter-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        activeTab = (btn.getAttribute('data-tab') as any) || 'all'
        renderFilters()
        renderLists()
      })
    })
  }

  renderFilters()
  renderLists()
}

let navResizeListenerAttached = false

function findNavTextNode(entry: HTMLElement): { container: HTMLElement; textSpan: HTMLElement } | null {
  const spans = Array.from(entry.querySelectorAll('span')).filter(
    (s) => !s.closest('svg') && (s.textContent?.trim().length ?? 0) > 0,
  )
  if (spans.length > 0) {
    const textSpan = spans[spans.length - 1] as HTMLElement
    const pill = entry.firstElementChild as HTMLElement | null
    let container = textSpan.parentElement as HTMLElement | null
    if (pill) {
      let cur: HTMLElement | null = textSpan
      while (cur && cur.parentElement && cur.parentElement !== pill && cur.parentElement !== entry) {
        cur = cur.parentElement
      }
      if (cur && (cur.parentElement === pill || cur.parentElement === entry)) {
        container = cur
      }
    }
    return { container: container || textSpan, textSpan }
  }

  const pill = entry.firstElementChild as HTMLElement | null
  if (pill && pill.children.length >= 2) {
    const secondChild = pill.children[1] as HTMLElement
    const span = secondChild.querySelector('span') || secondChild
    return { container: secondChild, textSpan: span as HTMLElement }
  }

  return null
}

function isNavExpanded(refLink: HTMLElement): boolean {
  // 1. 检查原生参考项中的文字节点。如果原生项根本没有文本节点（只有图标），说明当前毫无疑问处于收起模式
  const textInfo = findNavTextNode(refLink)
  if (!textInfo) {
    return false
  }

  // 2. 检查侧边栏真实容器宽度（展开时约为 275px，收起时约为 68px ~ 88px）
  const banner = document.querySelector('header[role="banner"]') as HTMLElement | null
  const nav = (banner?.querySelector('nav[role="navigation"]') || document.querySelector('nav[role="navigation"]')) as HTMLElement | null
  const sidebarWidth =
    (banner ? banner.getBoundingClientRect().width || parseFloat(banner.style.width || '0') : 0) ||
    (nav ? nav.getBoundingClientRect().width || parseFloat(nav.style.width || '0') : 0)
  if (sidebarWidth > 0) {
    if (sidebarWidth < 150) return false
    if (sidebarWidth >= 200) return true
  }

  // 3. 检查原生参考项中的文字是否处于显示状态
  const cs = window.getComputedStyle(textInfo.container)
  if (cs.display === 'none' || cs.visibility === 'hidden') return false
  const ss = window.getComputedStyle(textInfo.textSpan)
  if (ss.display === 'none' || ss.visibility === 'hidden') return false
  const r = textInfo.container.getBoundingClientRect()
  if (r.width > 0 && r.height > 0) return true
  // 若尚未完成 layout 测量（width=0），只要未被样式隐藏且非移动端极窄屏幕即认定为展开
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280
  return w >= 988
}

/**
 * 入口的对齐方式照抄旁边的原生导航项（X 不同页面、不同宽度下不一样，例如只显示图标时是居中）。
 * 读不到时兜底：展开靠文字起始一侧，收起居中
 */
function resolveNavEntryAlign(refLink: HTMLElement | null, expanded: boolean): string {
  const nativeAlign = refLink ? window.getComputedStyle(refLink).alignItems : ''
  if (nativeAlign && nativeAlign !== 'normal') return nativeAlign
  if (!expanded) return 'center'
  const isRtl = document.dir === 'rtl' || document.documentElement.dir === 'rtl'
  return isRtl ? 'flex-end' : 'flex-start'
}

function syncNavEntryLayout(entry: HTMLElement, expanded: boolean, refLink: HTMLElement | null) {
  entry.style.display = 'flex'
  entry.style.flexDirection = 'column'
  entry.style.width = '100%'
  entry.style.alignItems = resolveNavEntryAlign(refLink, expanded)
  entry.setAttribute('data-xf-mode', expanded ? 'expanded' : 'collapsed')

  const pill = entry.firstElementChild as HTMLElement | null
  if (pill) {
    pill.style.margin = ''
  }

  const textInfo = findNavTextNode(entry)
  if (textInfo) {
    if (expanded) {
      textInfo.container.style.display = ''
      textInfo.container.style.visibility = ''
      textInfo.textSpan.textContent = '我的 Lists'
      textInfo.textSpan.style.fontWeight = '400'
    } else {
      textInfo.container.style.display = 'none'
    }
  } else if (expanded && pill) {
    const textContainer = document.createElement('div')
    textContainer.setAttribute('dir', 'ltr')
    textContainer.style.marginLeft = '16px'
    const span = document.createElement('span')
    span.textContent = '我的 Lists'
    span.style.fontWeight = '400'
    textContainer.appendChild(span)
    pill.appendChild(textContainer)
  }
}

function createQuickListNavNode(
  refNode: HTMLElement,
  expanded: boolean,
): HTMLAnchorElement {
  const newNode = refNode.cloneNode(true) as HTMLAnchorElement
  newNode.href = '/i/lists'
  newNode.setAttribute('aria-label', '我的 Lists')
  newNode.setAttribute('title', '我的 Lists')
  newNode.removeAttribute('data-testid')
  newNode.removeAttribute('aria-current')
  newNode.classList.add(NAV_CLASS)
  newNode.classList.add('xf-sidebar-button')
  newNode.setAttribute(
    'data-xf-cloned-with-span',
    Boolean(refNode.querySelector('span')) ? 'true' : 'false',
  )

  // 移除可能从 refNode 继承的未读蓝点或气泡
  newNode.querySelectorAll('svg + div, div[aria-label], div[data-testid]').forEach((badge) => {
    if (badge !== newNode && badge.parentElement !== newNode && !badge.querySelector('span')) {
      const label = badge.getAttribute('aria-label') || ''
      const tid = badge.getAttribute('data-testid') || ''
      if (
        label.includes('未读') ||
        label.includes('unread') ||
        label.includes('条') ||
        label.includes('新') ||
        tid.includes('badge') ||
        tid.includes('unread') ||
        window.getComputedStyle(badge).position === 'absolute'
      ) {
        badge.remove()
      }
    }
  })

  // 替换为标准的 List 图标（内部居中 viewBox 0 0 24 24）
  const svg = newNode.querySelector('svg')
  if (svg) {
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.innerHTML = LIST_ICON_SVG_INNER
  }

  // 同步排版与展开/收起模式
  syncNavEntryLayout(newNode, expanded, refNode)

  // 点击弹出 Lists 面板
  newNode.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    void toggleNavPanel(newNode)
  })

  return newNode
}

let currentNavEnabled = true
let currentNavPosition = 'top'

/**
 * 把 Lists 入口放到设置的位置：top 放在 Home 上方，sidebar 放在原生 Lists 等入口之后。
 * 已经在目标位置时不移动，避免与页面的 DOM 监听互相触发。
 */
export function placeNavEntry(nav: Element, homeLink: Element, entry: HTMLElement, position: string) {
  if (position === 'top') {
    if (entry.nextElementSibling !== homeLink) homeLink.insertAdjacentElement('beforebegin', entry)
    return
  }

  const notSelf = `:not(.${NAV_CLASS})`
  const target =
    nav.querySelector(`a[href*="/lists"][role="link"]${notSelf}`) ||
    nav.querySelector('a[data-testid="AppTabBar_DirectMessage_Link"]') ||
    nav.querySelector('a[href*="grok"]') ||
    nav.querySelector('a[href*="bookmarks"]') ||
    nav.querySelector('a[data-testid="AppTabBar_Profile_Link"]') ||
    (homeLink.nextElementSibling === entry ? entry.nextElementSibling : homeLink.nextElementSibling) ||
    homeLink

  if (target === entry || target.nextElementSibling === entry) return
  target.insertAdjacentElement('afterend', entry)
}

export function ensureQuickListNavEntry(enabled = true, position = 'top') {
  currentNavEnabled = enabled
  currentNavPosition = position

  const existing = document.querySelector(`.${NAV_CLASS}`) as HTMLElement | null
  if (!enabled) {
    existing?.remove()
    navEntryEl = null
    closeNavPanel()
    return
  }

  ensureStyles()

  const nav =
    document.querySelector('header[role="banner"] nav[role="navigation"]') ||
    document.querySelector('nav[role="navigation"]')
  if (!nav) return

  const homeLink = (nav.querySelector('a[data-testid="AppTabBar_Home_Link"]') ||
    nav.querySelector('a[role="link"][href="/home"]')) as HTMLAnchorElement | null
  if (!homeLink) return

  const isExpandedNow = isNavExpanded(homeLink)

  if (existing && document.contains(existing)) {
    navEntryEl = existing
    syncNavEntryLayout(existing, isExpandedNow, homeLink)
    // 位置设置可能刚改过：已有入口也按当前设置归位，不必刷新页面
    placeNavEntry(nav, homeLink, existing, position)
    return
  }

  const newNode = createQuickListNavNode(homeLink, isExpandedNow)
  navEntryEl = newNode
  placeNavEntry(nav, homeLink, newNode, position)

  if (!navResizeListenerAttached) {
    navResizeListenerAttached = true
    const handleSync = () => {
      ensureQuickListNavEntry(currentNavEnabled, currentNavPosition)
      setTimeout(() => {
        ensureQuickListNavEntry(currentNavEnabled, currentNavPosition)
      }, 50)
    }
    window.addEventListener('resize', handleSync)
    window.addEventListener('popstate', handleSync)
  }
}

export async function runQuickListFeature() {
  const data = await getStorage([
    KeyQuickListAdderEnabled,
    KeyQuickListNavEnabled,
    KeyQuickListNavPosition,
  ])
  const adderEnabled = data?.[KeyQuickListAdderEnabled] !== 'off'
  const navEnabled = data?.[KeyQuickListNavEnabled] !== 'off'
  const navPos = String(data?.[KeyQuickListNavPosition] || 'top')

  scanAndInjectHoverCards(adderEnabled)
  ensureQuickListNavEntry(navEnabled, navPos)
}
