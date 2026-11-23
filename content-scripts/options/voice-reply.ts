import { t, type MessageKey } from '../../shared/i18n'
import addStyles, { stylesExist } from '../utilities/addStyles'
import { getThemeColors } from '../utilities/colors'
import { findComposerEditor, findComposerRoots, queryComposerElements } from '../utilities/composer-roots'
import { getXFontFamily } from '../utilities/xTypography'
import { MAX_VOICE_REPLY_MS, MIN_VOICE_REPLY_MS, startVoiceCapture, supportsVoiceCapture, type VoiceCapture } from './voice-reply-recorder'
import styles from './voice-reply.css?inline'

const STYLE_ID = 'voice-reply'
const ATTACHMENT = '[data-testid="attachments"]'
const ATTACH_TIMEOUT_MS = 12_000

interface ReplyTarget {
  root: HTMLElement
  editor: HTMLElement
  preview: HTMLElement | null
  route: string
}

interface ReplyContext extends ReplyTarget {
  toolbar: HTMLElement
  input: HTMLInputElement
}

interface MountedReply {
  group: HTMLDivElement
  button: HTMLButtonElement
  context: ReplyContext
}

interface Recording {
  composer: MountedReply
  controller: AbortController
  panel: HTMLDivElement
  capture?: VoiceCapture
  startedAt?: number
  clip?: Blob
  audio?: HTMLAudioElement
  url?: string
  timer?: ReturnType<typeof setInterval>
  attachmentObserver?: MutationObserver
  attachmentTimer?: ReturnType<typeof setTimeout>
}

const mounted = new Map<HTMLElement, MountedReply>()
let active: Recording | undefined
let lifecycleAttached = false

function findReplyTarget(root: HTMLElement): ReplyTarget | undefined {
  const editor = findComposerEditor(root)
  const { pathname, search } = window.location
  if (!editor) return
  const dialog = root.closest('[role="dialog"]')
  const preview = dialog ? queryComposerElements(root, 'article[data-testid="tweet"]')[0] : null
  if (dialog) {
    // X 的回复弹窗在编辑器前显示原帖。引用卡片在编辑器后面。
    if (pathname !== '/compose/post' || !preview || !(preview.compareDocumentPosition(editor) & Node.DOCUMENT_POSITION_FOLLOWING)) return
  } else if (!/\/status\/\d+\/?$/.test(pathname) || document.querySelector('[role="dialog"][aria-labelledby="modal-header"]')) {
    return
  }
  return { root, editor, preview: preview ?? null, route: pathname + search }
}

function findReply(root: HTMLElement, target = findReplyTarget(root)): ReplyContext | undefined {
  if (!target) return
  const toolBar = queryComposerElements(root, '[data-testid="toolBar"]')[0]
  const input = queryComposerElements(root, 'input[type="file"][data-testid="fileInput"]')[0] as HTMLInputElement | undefined
  if (!toolBar || !input || !input.accept.split(',').some(type => ['video/mp4', 'video/*'].includes(type.trim()))) return
  const toolbar = queryComposerElements(toolBar, '[data-testid="ScrollSnap-List"], [role="tablist"]')[0] ?? toolBar
  return { ...target, toolbar, input }
}

function sameReply(a: ReplyTarget, b: ReplyTarget): boolean {
  return a.route === b.route && a.editor === b.editor && a.preview === b.preview
}

function button(id: string, label: MessageKey, action: () => void): HTMLButtonElement {
  const element = document.createElement('button')
  element.type = 'button'
  element.dataset.testid = `xf-voice-reply-${id}`
  element.textContent = t(label)
  element.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    action()
  })
  return element
}

function mount(context: ReplyContext): MountedReply {
  const group = document.createElement('div')
  group.className = 'xf-voice-reply-toolbar'
  group.setAttribute('role', 'presentation')
  const record = button('record', 'voiceReply.record', () => openRecording(composer))
  record.className = 'xf-voice-reply-record'
  record.setAttribute('aria-expanded', 'false')
  record.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5.5 11v1a6.5 6.5 0 0 0 13 0v-1M12 18.5V22m-3 0h6"/></svg>'
  group.append(record)
  const composer = { group, button: record, context }
  return composer
}

function showStatus(recording: Recording, key: MessageKey, actions: HTMLElement[] = [], error = false) {
  const status = document.createElement('span')
  status.className = 'xf-voice-reply-status'
  status.role = error ? 'alert' : 'status'
  status.textContent = t(key)
  recording.panel.replaceChildren(status)
  if (actions.length) {
    const controls = document.createElement('div')
    controls.className = 'xf-voice-reply-actions'
    controls.append(...actions)
    recording.panel.append(controls)
  }
}

function stopWatchingAttachment(recording: Recording) {
  clearTimeout(recording.attachmentTimer)
  recording.attachmentObserver?.disconnect()
  recording.attachmentObserver = undefined
}

function closeRecording(recording: Recording, restoreFocus = false) {
  if (active !== recording) return
  active = undefined
  clearInterval(recording.timer)
  stopWatchingAttachment(recording)
  recording.controller.abort()
  recording.audio?.pause()
  if (recording.url) URL.revokeObjectURL(recording.url)
  recording.panel.remove()
  recording.composer.button.setAttribute('aria-expanded', 'false')
  if (restoreFocus) recording.composer.button.focus({ preventScroll: true })
}

function currentReply(recording: Recording): ReplyContext | undefined {
  if (active !== recording) return
  const previous = recording.composer.context
  const target = previous.root.isConnected ? findReplyTarget(previous.root) : undefined
  if (!target || !sameReply(previous, target) || !recording.panel.isConnected) {
    closeRecording(recording)
    return
  }
  // X 可能重建媒体工具栏。录音仍属于当前回复，待媒体入口恢复后再添加。
  const current = findReply(previous.root, target) ?? previous
  recording.composer.context = current
  return current
}

function showCaptureError(recording: Recording, key: MessageKey) {
  if (!currentReply(recording)) return
  clearInterval(recording.timer)
  recording.controller.abort()
  const close = button('cancel', 'voiceReply.dismiss', () => closeRecording(recording, true))
  showStatus(recording, key, [close], true)
  close.focus({ preventScroll: true })
}

async function openRecording(composer: MountedReply) {
  if (active?.composer === composer) return
  const current = findReply(composer.context.root)
  if (!current || !sameReply(composer.context, current)) return
  if (active) closeRecording(active)

  const panel = document.createElement('div')
  panel.className = 'xf-voice-reply-panel'
  panel.style.fontFamily = getXFontFamily(current.editor)
  const theme = getThemeColors()
  panel.style.setProperty('--xf-voice-fg', theme.fg)
  panel.style.setProperty('--xf-voice-border', theme.border)
  panel.style.setProperty('--xf-voice-hover', theme.hoverBg)
  const recording: Recording = { composer, panel, controller: new AbortController() }
  active = recording
  // 找到编辑器与工具栏分开的那一层，避免把录音控件挤进输入框的同一行。
  let toolbarRow = current.toolbar
  while (toolbarRow.parentElement && !toolbarRow.parentElement.contains(current.editor)) {
    toolbarRow = toolbarRow.parentElement
  }
  toolbarRow.before(panel)
  composer.button.setAttribute('aria-expanded', 'true')
  const cancel = button('cancel', 'voiceReply.cancel', () => closeRecording(recording, true))
  showStatus(recording, 'voiceReply.allowMic', [cancel])

  try {
    const capture = await startVoiceCapture({
      signal: recording.controller.signal,
      label: t('voiceReply.cover'),
      onInterrupted: () => showCaptureError(recording, 'voiceReply.failed'),
    })
    if (!currentReply(recording)) return
    recording.capture = capture
    const start = recording.startedAt = performance.now()
    const timer = document.createElement('time')
    timer.className = 'xf-voice-reply-time'
    const stop = button('stop', 'voiceReply.stop', () => void finishRecording(recording))
    showStatus(recording, 'voiceReply.recording', [timer, stop, cancel])
    const tick = () => {
      if (!currentReply(recording)) return
      const elapsed = performance.now() - start
      const seconds = Math.min(Math.floor(elapsed / 1000), MAX_VOICE_REPLY_MS / 1000)
      const time = `0:${String(seconds).padStart(2, '0')}`
      if (timer.textContent !== time) timer.textContent = time
      stop.disabled = elapsed < MIN_VOICE_REPLY_MS
      if (elapsed >= MAX_VOICE_REPLY_MS) void finishRecording(recording)
    }
    recording.timer = setInterval(tick, 150)
    tick()
  } catch (error) {
    const name = error instanceof Error ? error.name : ''
    showCaptureError(recording, name === 'NotAllowedError' || name === 'SecurityError' ? 'voiceReply.denied' : 'voiceReply.failed')
  }
}

async function finishRecording(recording: Recording) {
  if (!currentReply(recording) || !recording.capture) return
  const capture = recording.capture
  recording.capture = undefined
  clearInterval(recording.timer)
  showStatus(recording, 'voiceReply.preparing', [
    button('cancel', 'voiceReply.cancel', () => closeRecording(recording, true)),
  ])
  try {
    const clip = await capture.stop()
    if (!currentReply(recording)) return
    recording.clip = clip
    showPreview(recording, undefined, true)
  } catch {
    showCaptureError(recording, 'voiceReply.failed')
  }
}

function showPreview(recording: Recording, error?: MessageKey, focus = false) {
  const listen = button('listen', 'voiceReply.listen', async () => {
    if (!currentReply(recording) || !recording.clip) return
    try {
      if (!recording.audio) {
        // 不把试听地址放进 X 的页面元素。
        recording.url = URL.createObjectURL(recording.clip)
        recording.audio = new Audio(recording.url)
      }
      const audio = recording.audio
      audio.onplay = () => { listen.textContent = t('voiceReply.pause') }
      audio.onpause = audio.onended = () => { listen.textContent = t('voiceReply.listen') }
      if (audio.paused) await audio.play()
      else audio.pause()
    } catch {
      if (currentReply(recording)) showPreview(recording, 'voiceReply.playFailed', true)
    }
  })
  const attach = button('attach', 'voiceReply.attach', () => attachVoiceReply(recording))
  attach.title = t('voiceReply.uploadNotice')
  const discard = button('cancel', 'voiceReply.discard', () => closeRecording(recording, true))
  showStatus(recording, error ?? 'voiceReply.uploadNotice', [listen, attach, discard], Boolean(error))
  if (focus && !document.hidden) listen.focus({ preventScroll: true })
}

function hasAttachment(context: ReplyContext): boolean {
  return queryComposerElements(context.root, ATTACHMENT).some(element =>
    element.childElementCount > 0 && !context.preview?.contains(element),
  )
}

function attachVoiceReply(recording: Recording) {
  const context = currentReply(recording)
  if (!context || !recording.clip || recording.attachmentObserver) return
  recording.audio?.pause()
  const { input } = context
  if (!findReply(context.root)) {
    showPreview(recording, 'voiceReply.mediaUnavailable', true)
    return
  }
  if (hasAttachment(context) || input.files?.length || input.disabled) {
    showPreview(recording, 'voiceReply.existingMedia', true)
    return
  }
  const file = new File([recording.clip], 'ohmyx-voice-reply.mp4', { type: 'video/mp4' })
  const failed = () => {
    stopWatchingAttachment(recording)
    if (input.files?.[0] === file) input.value = ''
    if (currentReply(recording)) showPreview(recording, 'voiceReply.attachFailed', true)
  }
  const check = () => {
    const current = currentReply(recording)
    if (current && hasAttachment(current)) closeRecording(recording)
  }
  try {
    const data = new DataTransfer()
    data.items.add(file)
    recording.attachmentObserver = new MutationObserver(check)
    recording.attachmentObserver.observe(context.root, { childList: true, subtree: true })
    recording.attachmentTimer = setTimeout(failed, ATTACH_TIMEOUT_MS)
    showStatus(recording, 'voiceReply.attaching')
    input.files = data.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
    check()
  } catch {
    failed()
  }
}

export function updateVoiceReplyComposers() {
  const roots = new Set<HTMLElement>()
  if (supportsVoiceCapture()) {
    for (const root of findComposerRoots()) {
      const context = findReply(root)
      if (!context) continue
      roots.add(root)
      let composer = mounted.get(root)
      if (composer && !sameReply(composer.context, context)) {
        if (active && active.composer === composer) closeRecording(active)
        composer.group.remove()
        composer = undefined
      }
      composer ??= mount(context)
      composer.context = context
      const label = t('voiceReply.record')
      composer.button.ariaLabel = label
      composer.button.title = label
      if (composer.group.parentElement !== context.toolbar) context.toolbar.prepend(composer.group)
      mounted.set(root, composer)
    }
  }

  for (const [root, composer] of mounted) {
    if (roots.has(root)) continue
    if (active?.composer === composer && currentReply(active)) continue
    composer.group.remove()
    mounted.delete(root)
  }
  if (active) currentReply(active)
  if (!roots.size) return
  if (!stylesExist(STYLE_ID)) addStyles(STYLE_ID, styles)

  if (!lifecycleAttached) {
    lifecycleAttached = true
    window.addEventListener('pagehide', () => { if (active) closeRecording(active) })
    document.addEventListener('visibilitychange', () => {
      if (!active || !document.hidden) return
      if (active.clip) {
        active.audio?.pause()
      } else if (active.startedAt !== undefined && performance.now() - active.startedAt >= MIN_VOICE_REPLY_MS) {
        void finishRecording(active)
      } else {
        closeRecording(active)
      }
    })
  }
}
