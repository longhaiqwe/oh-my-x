import { KeySpamKeywordList } from '../../../storage-keys'
import { getStorage, setStorage } from '../../utilities/storage'
import { parseKeywordList } from '../../../shared/spam-rules'
import { invalidateSpamConfig, runScan } from '../scanner'
import { segmentText, type SegmentInfo } from '../keyword-segment'
import { isDarkTheme } from './theme'
import { ACCENT, ACCENT_TEXT, accentAlpha } from '../../utilities/colors'

// ─── 状态 ──────────────────────────────────────────

let activePanelHost: HTMLElement | null = null

function getTweetText(article: HTMLElement): string {
  const el = article.querySelector('[data-testid="tweetText"]')
  if (!el) return ''
  return el.textContent?.replace(/\s+/g, ' ').trim() || ''
}

function getAuthorName(article: HTMLElement): string {
  const nameEl = article.querySelector<HTMLElement>('[data-testid="User-Name"]')
  if (!nameEl) return ''
  const displayEl = nameEl.querySelector('[dir="ltr"]')
  if (!displayEl) return nameEl.textContent?.replace(/\s+/g, ' ').trim() || ''
  return displayEl.textContent?.replace(/\s+/g, ' ').trim() || ''
}

function closePanel() {
  if (activePanelHost) {
    activePanelHost.remove()
    activePanelHost = null
  }
}

// ─── 关键词存储 ────────────────────────────────────

async function addKeywords(words: string[]): Promise<string[]> {
  const raw = await getStorage(KeySpamKeywordList)
  const existing = parseKeywordList(String(raw ?? ''))
  const existingSet = new Set(existing.map((w) => w.toLowerCase()))
  const newWords = words
    .map((w) => w.toLowerCase())
    .filter((w) => !existingSet.has(w.toLowerCase()))

  if (newWords.length === 0) return []

  const next = [...existing, ...newWords].join('\n')
  await setStorage({ [KeySpamKeywordList]: next })

  invalidateSpamConfig()
  void runScan(true)

  return newWords
}

// ─── 选词弹窗 ──────────────────────────────────────

export function showPickerPanel(article: HTMLElement) {
  closePanel()

  const text = getTweetText(article)
  const name = getAuthorName(article)
  if (!text && !name) return

  const nameSegments = name ? segmentText(name) : []
  const textSegments = text ? segmentText(text) : []
  const nameOffset = nameSegments.length
  const totalSegments = [...nameSegments, ...textSegments]
  if (totalSegments.length === 0) return

  const selectedSet = new Set<number>()

  const dark = isDarkTheme()
  const c = {
    bg: dark ? '#000' : '#fff',
    fg: dark ? 'rgb(231,233,234)' : 'rgb(15,20,25)',
    fgSecondary: dark ? 'rgb(113,118,123)' : 'rgb(83,100,113)',
    border: dark ? 'rgb(47,51,54)' : 'rgb(207,217,222)',
    chipBg: dark ? 'rgba(239,243,244,0.05)' : 'rgba(15,20,25,0.05)',
    accent: ACCENT,
    accentBg: dark ? accentAlpha(0.2) : accentAlpha(0.15),
    danger: 'rgb(249,88,88)',
    dangerBg: dark ? 'rgba(249,88,88,0.2)' : 'rgba(249,88,88,0.1)',
    hoverBg: dark ? 'rgba(239,243,244,0.1)' : 'rgba(15,20,25,0.08)',
  }

  const host = document.createElement('div')
  host.style.cssText = [
    'position:fixed',
    'z-index:999999',
    'inset:0',
    'display:flex',
    'align-items:flex-start',
    'justify-content:center',
    'padding-top:60px',
  ].join(';')
  host.setAttribute('data-xf-kw-panel', '1')

  const shadow = host.attachShadow({ mode: 'open' })

  const backdrop = document.createElement('div')
  backdrop.style.cssText = `position:fixed;inset:0;background:${dark ? 'rgba(0,0,0,0.4)' : 'rgba(91,112,131,0.4)'};z-index:-1;`
  backdrop.addEventListener('click', closePanel)
  host.appendChild(backdrop)

  const panel = document.createElement('div')
  panel.setAttribute('role', 'dialog')
  panel.setAttribute('aria-label', '添加到垃圾词库')
  panel.style.cssText = [
    `background:${c.bg}`,
    `color:${c.fg}`,
    `border:1px solid ${c.border}`,
    'border-radius:16px',
    'padding:20px',
    'width:440px',
    'max-width:calc(100vw - 32px)',
    'max-height:calc(100vh - 120px)',
    'overflow-y:auto',
    'box-shadow:0 0 20px rgba(0,0,0,0.5)',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
    'font-size:14px',
    'line-height:1.5',
    'display:flex',
    'flex-direction:column',
    'gap:12px',
  ].join(';')
  shadow.appendChild(panel)

  // ── 标题 ──
  const header = document.createElement('div')
  header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;'
  const title = document.createElement('span')
  title.style.cssText = 'font-size:16px;font-weight:700;'
  title.textContent = '添加到垃圾词库'
  header.appendChild(title)
  const closeBtn = document.createElement('button')
  closeBtn.textContent = '✕'
  closeBtn.ariaLabel = '关闭'
  closeBtn.style.cssText = [
    'background:none',
    'border:none',
    `color:${c.fgSecondary}`,
    'cursor:pointer',
    'font-size:18px',
    'padding:4px 8px',
    'border-radius:9999px',
    'transition:background 0.15s',
  ].join(';')
  closeBtn.addEventListener('mouseenter', () => { closeBtn.style.background = c.hoverBg })
  closeBtn.addEventListener('mouseleave', () => { closeBtn.style.background = 'none' })
  closeBtn.addEventListener('click', closePanel)
  header.appendChild(closeBtn)
  panel.appendChild(header)

  // ── 提示 ──
  const hint = document.createElement('div')
  hint.style.cssText = `font-size:11px;color:${c.fgSecondary};margin-top:-4px;`
  hint.textContent = '点击词语选中；Ctrl/Cmd+点击拼接到输入框，Enter 添加组合词'
  panel.appendChild(hint)

  // 创建 chip
  const chipMap = new Map<number, HTMLElement>()

  function createChip(seg: SegmentInfo, idx: number): HTMLElement {
    const chip = document.createElement('span')
    chip.textContent = seg.text
    chip.style.cssText = [
      'display:inline-block',
      'padding:2px 6px',
      'border-radius:4px',
      'cursor:pointer',
      'transition:background 0.15s,color 0.15s',
      'font-size:14px',
      `color:${c.fg}`,
      'user-select:none',
      seg.useful ? '' : 'opacity:0.4;cursor:default;',
    ].join(';')

    chip.addEventListener('click', (e) => {
      if (!seg.useful) return
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        manualInput.value += seg.text
        manualInput.focus()
        chip.style.background = c.accentBg
        chip.style.color = c.accent
        setTimeout(() => {
          if (!selectedSet.has(idx)) {
            chip.style.background = 'transparent'
            chip.style.color = c.fg
          }
        }, 300)
        return
      }
      if (selectedSet.has(idx)) {
        selectedSet.delete(idx)
        chip.style.background = 'transparent'
        chip.style.color = c.fg
      } else {
        selectedSet.add(idx)
        chip.style.background = c.dangerBg
        chip.style.color = c.danger
      }
      updateSelectedDisplay()
    })

    chip.addEventListener('mouseenter', () => {
      if (seg.useful && !selectedSet.has(idx)) {
        chip.style.background = c.hoverBg
      }
    })
    chip.addEventListener('mouseleave', () => {
      if (!selectedSet.has(idx)) {
        chip.style.background = 'transparent'
      }
    })

    chipMap.set(idx, chip)
    return chip
  }

  // ── 昵称分词区 ──
  if (nameSegments.length > 0) {
    const nameLabel = document.createElement('div')
    nameLabel.style.cssText = `font-size:11px;font-weight:600;color:${c.fgSecondary};text-transform:uppercase;letter-spacing:0.5px;`
    nameLabel.textContent = '昵称'
    panel.appendChild(nameLabel)

    const nameChips = document.createElement('div')
    nameChips.style.cssText = [
      'display:flex',
      'flex-wrap:wrap',
      'gap:4px',
      'padding:8px 12px',
      `background:${c.chipBg}`,
      `border-radius:12px`,
      `border:1px solid ${c.border}`,
      'line-height:1.8',
    ].join(';')

    nameSegments.forEach((seg, idx) => {
      const chip = createChip(seg, idx)
      nameChips.appendChild(chip)
    })
    panel.appendChild(nameChips)
  }

  // ── 评论分词区 ──
  if (textSegments.length > 0) {
    const textLabel = document.createElement('div')
    textLabel.style.cssText = `font-size:11px;font-weight:600;color:${c.fgSecondary};text-transform:uppercase;letter-spacing:0.5px;margin-top:${nameSegments.length > 0 ? '4px' : '0'};`
    textLabel.textContent = '评论'
    panel.appendChild(textLabel)

    const textChips = document.createElement('div')
    textChips.style.cssText = [
      'display:flex',
      'flex-wrap:wrap',
      'gap:4px',
      'padding:8px 12px',
      `background:${c.chipBg}`,
      `border-radius:12px`,
      `border:1px solid ${c.border}`,
      'line-height:1.8',
    ].join(';')

    textSegments.forEach((seg, idx) => {
      const chip = createChip(seg, nameOffset + idx)
      textChips.appendChild(chip)
    })
    panel.appendChild(textChips)
  }

  // ── 手动输入 ──
  const manualLabel = document.createElement('div')
  manualLabel.style.cssText = `font-size:12px;color:${c.fgSecondary};`
  manualLabel.textContent = '手动输入（逗号分隔，回车添加）:'
  panel.appendChild(manualLabel)

  const manualInput = document.createElement('input')
  manualInput.type = 'text'
  manualInput.placeholder = '输入关键词后按 Enter 添加…'
  manualInput.style.cssText = [
    'width:100%',
    'padding:8px 12px',
    'border-radius:8px',
    `border:1px solid ${c.border}`,
    `background:${c.chipBg}`,
    `color:${c.fg}`,
    'font-size:13px',
    'outline:none',
    'box-sizing:border-box',
  ].join(';')
  manualInput.addEventListener('focus', () => {
    manualInput.style.borderColor = c.accent
  })
  manualInput.addEventListener('blur', () => {
    manualInput.style.borderColor = c.border
  })
  manualInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const words = manualInput.value
      .split(/[,，、\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    if (words.length === 0) return
    for (const w of words) {
      let dup = false
      for (const idx of selectedSet) {
        if (getTagText(idx).toLowerCase() === w) {
          dup = true
          break
        }
      }
      if (!dup) {
        manualWordMap.set(manualSeq, w)
        selectedSet.add(manualSeq)
        manualSeq--
      }
    }
    manualInput.value = ''
    updateSelectedDisplay()
  })
  panel.appendChild(manualInput)

  // ── 已选区域 ──
  const selectedLabel = document.createElement('div')
  selectedLabel.style.cssText = `font-size:12px;font-weight:600;color:${c.fgSecondary};margin-top:8px;`
  selectedLabel.textContent = '已选/输 0 词'
  panel.appendChild(selectedLabel)

  const selectedContainer = document.createElement('div')
  selectedContainer.style.cssText = [
    'display:flex',
    'flex-wrap:wrap',
    'gap:4px',
    'min-height:28px',
    'padding:0',
    `border:1px dashed ${c.border}`,
    'border-radius:12px',
  ].join(';')
  panel.appendChild(selectedContainer)

  const emptyState = document.createElement('span')
  emptyState.textContent = '暂无选词'
  emptyState.style.cssText = `font-size:12px;color:${c.fgSecondary};padding:4px;text-align:center;margin: 4px auto;display:block;`
  selectedContainer.appendChild(emptyState)

  const manualWordMap = new Map<number, string>()
  let manualSeq = -1

  const tagMap = new Map<number, HTMLElement>()

  function getTagText(idx: number): string {
    if (idx < 0) return manualWordMap.get(idx) || ''
    return totalSegments[idx]?.text || ''
  }

  function updateSelectedDisplay() {
    const count = selectedSet.size
    selectedLabel.textContent = `已选/输 ${count} 词`
    selectedContainer.style.padding = count ? '8px' : '0'
    emptyState.style.display = count ? 'none' : 'block'

    for (const [idx, tag] of tagMap) {
      if (!selectedSet.has(idx)) {
        tag.remove()
        tagMap.delete(idx)
      }
    }

    const existingIndices = new Set(tagMap.keys())
    for (const idx of selectedSet) {
      if (existingIndices.has(idx)) continue
      const text = getTagText(idx)
      if (!text) continue
      const tag = document.createElement('span')
      tag.textContent = text + ' ✕'
      tag.setAttribute('role', 'button')
      tag.setAttribute('tabindex', '0')
      tag.ariaLabel = `移除 "${text}"`
      tag.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'gap:2px',
        'padding:2px 8px',
        'border-radius:9999px',
        `background:${c.dangerBg}`,
        `color:${c.danger}`,
        'font-size:12px',
        'cursor:pointer',
        'transition:background 0.15s',
        'user-select:none',
      ].join(';')
      tag.addEventListener('click', () => {
        selectedSet.delete(idx)
        if (idx >= 0) {
          const chip = chipMap.get(idx)
          if (chip) {
            chip.style.background = 'transparent'
            chip.style.color = c.fg
          }
        } else {
          manualWordMap.delete(idx)
        }
        updateSelectedDisplay()
      })
      tag.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          tag.click()
        }
      })
      selectedContainer.appendChild(tag)
      tagMap.set(idx, tag)
    }
  }

  // ── 操作按钮 ──
  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:4px;'

  const cancelBtn = document.createElement('button')
  cancelBtn.textContent = '取消'
  cancelBtn.style.cssText = [
    'padding:8px 16px',
    'border-radius:9999px',
    `border:1px solid ${c.border}`,
    'background:transparent',
    `color:${c.fg}`,
    'font-size:13px',
    'font-weight:600',
    'cursor:pointer',
    'transition:background 0.15s',
    'outline:none',
  ].join(';')
  cancelBtn.addEventListener('mouseenter', () => { cancelBtn.style.background = c.hoverBg })
  cancelBtn.addEventListener('mouseleave', () => { cancelBtn.style.background = 'transparent' })
  cancelBtn.addEventListener('click', closePanel)
  actions.appendChild(cancelBtn)

  const addBtn = document.createElement('button')
  addBtn.textContent = '添加并扫描'
  addBtn.style.cssText = [
    'padding:8px 16px',
    'border-radius:9999px',
    'border:none',
    `background:${c.accent}`,
    `color:${ACCENT_TEXT}`,
    'font-size:13px',
    'font-weight:600',
    'cursor:pointer',
    'transition:opacity 0.15s',
    'outline:none',
  ].join(';')
  addBtn.addEventListener('mouseenter', () => { addBtn.style.opacity = '0.9' })
  addBtn.addEventListener('mouseleave', () => { addBtn.style.opacity = '1' })

  addBtn.addEventListener('click', async () => {
    const selectedWords = new Set<string>()
    for (const idx of selectedSet) {
      const text = getTagText(idx)
      if (text) selectedWords.add(text.toLowerCase())
    }
    const pendingInput = manualInput.value
      .split(/[,，、\s]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    for (const w of pendingInput) selectedWords.add(w)

    if (selectedWords.size === 0) return

    const added = await addKeywords([...selectedWords])
    if (added.length === 0) {
      addBtn.textContent = '词已在词库中'
      addBtn.style.background = 'rgb(83,100,113)'
    } else {
      addBtn.textContent = `✓ 已添加 ${added.length} 个词`
      addBtn.style.background = 'rgb(0,186,124)'
    }
    addBtn.disabled = true
    setTimeout(() => closePanel(), 1500)
  })
  actions.appendChild(addBtn)
  panel.appendChild(actions)

  // Escape 键关闭
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closePanel()
  }
  panel.addEventListener('keydown', escHandler)
  host.addEventListener('keydown', escHandler)
  host.setAttribute('tabindex', '0')
  host.focus()

  document.body.appendChild(host)
  activePanelHost = host
}
