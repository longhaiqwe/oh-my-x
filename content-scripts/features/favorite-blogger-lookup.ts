import { t } from '../../shared/i18n'
import { errorText } from '../../shared/errors'
import { parseBloggerHandle, toFavoriteBloggers, type FavoriteBlogger } from '../../shared/favorite-bloggers'
import { MENTION_QUERY_MAX_LENGTH, MENTION_SEARCH_MESSAGE, type MentionUser } from '../../shared/mention-search'

/** 明确的 @用户名和链接继续直接添加；中文、英文昵称都可查询。 */
function nameQuery(value: string): string | null {
  const text = value.trim()
  if (/^(?:https?:\/\/|(?:www\.|mobile\.)?(?:x|twitter)\.com\/)/i.test(text)) return null
  if (text.startsWith('@') && parseBloggerHandle(text)) return null
  const query = text.replace(/^[@＠]/, '').trim()
  return query && query.length <= MENTION_QUERY_MAX_LENGTH ? query : null
}

export function createFavoriteBloggerLookup(
  input: HTMLInputElement,
  onSelect: (blogger: FavoriteBlogger) => Promise<boolean>,
  onResize: () => void,
) {
  const element = document.createElement('div')
  element.className = 'xf-favorites-lookup'
  element.hidden = true
  const message = document.createElement('div')
  message.className = 'xf-favorites-lookup-message'
  message.setAttribute('role', 'status')
  const list = document.createElement('div')
  list.id = 'xf-favorites-candidates'
  list.setAttribute('role', 'listbox')
  list.setAttribute('aria-label', t('favorites.candidates'))
  const direct = document.createElement('button')
  direct.type = 'button'
  direct.className = 'xf-favorites-direct'
  direct.hidden = true
  direct.addEventListener('click', () => {
    const handle = parseBloggerHandle(input.value)
    if (handle) void choose({ handle, name: handle })
  })
  element.append(message, list, direct)
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-autocomplete', 'list')
  input.setAttribute('aria-controls', list.id)
  input.setAttribute('aria-expanded', 'false')
  let sequence = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let users: MentionUser[] = []
  let active = -1
  let composing = false
  let disposed = false
  let saving = false

  function clear() {
    clearTimeout(timer)
    sequence++
    users = []
    active = -1
    list.replaceChildren()
    direct.hidden = true
    element.hidden = true
    input.setAttribute('aria-expanded', 'false')
    input.removeAttribute('aria-activedescendant')
    if (!disposed) onResize()
  }

  function setActive(index: number) {
    active = index
    const options = [...list.children]
    options.forEach((option, i) => option.setAttribute('aria-selected', String(i === index)))
    if (options[index]) {
      input.setAttribute('aria-activedescendant', options[index].id)
      options[index].scrollIntoView?.({ block: 'nearest' })
    }
  }

  async function choose(user: FavoriteBlogger) {
    if (saving || disposed) return
    saving = true
    input.disabled = true
    direct.disabled = true
    list.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = true })
    try {
      const added = await onSelect(toFavoriteBloggers([user])[0])
      if (!disposed && added) { input.value = ''; clear() }
    } finally {
      saving = false
      input.disabled = false
      direct.disabled = false
      if (!disposed) {
        list.querySelectorAll<HTMLButtonElement>('button').forEach(button => { button.disabled = false })
        input.focus()
      }
    }
  }

  function render() {
    list.replaceChildren()
    for (const [index, user] of users.entries()) {
      const option = document.createElement('button')
      option.type = 'button'
      option.className = 'xf-favorites-candidate'
      option.id = `${list.id}-${index}`
      option.setAttribute('role', 'option')
      option.setAttribute('aria-selected', 'false')
      const avatar = document.createElement(user.avatar ? 'img' : 'span')
      avatar.className = 'xf-favorites-candidate-avatar'
      if (avatar instanceof HTMLImageElement) { avatar.src = user.avatar; avatar.alt = '' }
      const text = document.createElement('span')
      text.className = 'xf-favorites-candidate-text'
      const name = document.createElement('span')
      name.textContent = user.name
      const handle = document.createElement('span')
      handle.className = 'xf-favorites-handle'
      handle.textContent = `@${user.handle}${user.following ? ` · ${t('mention.following')}` : ''}`
      text.append(name, handle)
      option.append(avatar, text)
      option.addEventListener('mousedown', event => event.preventDefault())
      option.addEventListener('click', () => { void choose(user) })
      list.append(option)
    }
    onResize()
  }

  function searchNow(): boolean {
    clear()
    const query = nameQuery(input.value)
    if (!query || composing || disposed) return false
    const id = sequence
    element.hidden = false
    input.setAttribute('aria-expanded', 'true')
    message.textContent = t('favorites.finding')
    const handle = parseBloggerHandle(input.value)
    if (handle) {
      direct.textContent = t('favorites.saveUsername', { handle })
      direct.hidden = false
    }
    onResize()
    void (async () => {
      try {
        const response = await browser.runtime.sendMessage({ type: MENTION_SEARCH_MESSAGE, query })
        if (disposed || id !== sequence) return
        if (!response?.ok) throw response?.error
        users = Array.isArray(response.users) ? response.users : []
        message.textContent = t(users.length ? 'favorites.choose' : 'favorites.noCandidates')
        render()
      } catch (error) {
        if (disposed || id !== sequence) return
        message.textContent = errorText(error, 'error.mentionSearchFailed')
        onResize()
      }
    })()
    return true
  }

  function onInput() {
    clear()
    if (!composing && nameQuery(input.value)) timer = setTimeout(searchNow, 200)
  }
  function onCompositionStart() { composing = true; clear() }
  function onCompositionEnd() { composing = false; onInput() }
  function onKeydown(event: KeyboardEvent) {
    if (event.isComposing || composing || element.hidden) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      clear()
    } else if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && users.length) {
      event.preventDefault()
      setActive(active < 0 ? (event.key === 'ArrowDown' ? 0 : users.length - 1) :
        (active + (event.key === 'ArrowDown' ? 1 : -1) + users.length) % users.length)
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault()
      void choose(users[active])
    }
  }
  input.addEventListener('input', onInput)
  input.addEventListener('compositionstart', onCompositionStart)
  input.addEventListener('compositionend', onCompositionEnd)
  input.addEventListener('keydown', onKeydown)
  return {
    element, searchNow, clear,
    isComposing: () => composing,
    dispose() {
      disposed = true
      clear()
      input.removeEventListener('input', onInput)
      input.removeEventListener('compositionstart', onCompositionStart)
      input.removeEventListener('compositionend', onCompositionEnd)
      input.removeEventListener('keydown', onKeydown)
    },
  }
}
