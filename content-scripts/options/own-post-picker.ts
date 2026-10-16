import { normalizeOwnPostThumbnail, getOwnHandle, type OwnPost } from '../../shared/own-posts'
import addStyles, { stylesExist } from '../utilities/addStyles'
import { getPrecomposeUrl } from './precompose'
import { getThemeColors } from '../utilities/colors'
import { searchLibrary, syncLibrary, pauseLibrary } from './own-post-library-client'


function ensureStyles() {
  if (stylesExist('ownPostPicker')) return
  // Refactoring UI: hierarchy §2.1/2.8, grouped spacing §3.6, quieter borders §8.5.
  // Images §7.4.1/7.4.2: article covers stay uncropped; other thumbnails fill their frame. Text-only rows use the full width.
  // Content > metadata > utility actions. Use existing X theme tokens and a 4/8/12/16/24 spacing scale.
  addStyles('ownPostPicker', `
    .xf-own-post-picker{box-sizing:border-box;container-type:inline-size;min-width:0;margin:12px 0;padding:16px;border:1px solid var(--xf-own-border);border-radius:16px;color:var(--xf-own-fg);background:var(--xf-own-bg);font-family:inherit;font-size:14px;line-height:1.5}
    .xf-own-post-picker *{box-sizing:border-box}
    .xf-own-post-picker [hidden]{display:none!important}
    .xf-own-post-picker header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:16px}
    .xf-own-post-picker h3{font-size:16px;font-weight:700;line-height:1.5;margin:0}
    .xf-own-post-picker .xf-own-account{color:var(--xf-own-muted);font-size:12px;overflow-wrap:anywhere}
    .xf-own-post-picker button{font:inherit;font-weight:600;color:inherit;background:transparent;border:0;border-radius:999px;min-height:36px;padding:8px 12px;cursor:pointer;touch-action:manipulation}
    .xf-own-post-picker button:hover{background:var(--xf-own-hover)}
    .xf-own-post-picker button:focus-visible{outline:2px solid var(--xf-own-fg);outline-offset:2px}
    .xf-own-post-picker button:disabled{opacity:.5;cursor:wait}
    .xf-own-post-picker .xf-own-close{display:grid;place-items:center;min-width:36px;padding:8px;margin:-4px -4px 0 0;color:var(--xf-own-muted)}
    .xf-own-post-picker svg{width:20px;height:20px;flex-shrink:0;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
    .xf-own-post-picker form{display:flex;align-items:center;gap:8px;margin:0 0 12px}
    .xf-own-post-picker .xf-own-search-field{display:flex;align-items:center;gap:8px;flex:1;min-width:0;background:var(--xf-own-hover);border-radius:999px;padding:0 12px;color:var(--xf-own-muted)}
    .xf-own-post-picker .xf-own-search-field:focus-within{outline:2px solid var(--xf-own-fg);outline-offset:2px}
    .xf-own-post-picker input{width:100%;min-width:0;height:40px;font:inherit;color:var(--xf-own-fg);background:transparent;border:0;outline:0;padding:8px 0}
    .xf-own-post-picker input::placeholder{color:var(--xf-own-muted);opacity:1}
    .xf-own-post-picker [type="submit"]{min-height:40px;background:var(--xf-own-fg);color:var(--xf-own-bg);padding:8px 16px;flex-shrink:0}
    .xf-own-post-picker [type="submit"]:hover{background:var(--xf-own-fg);opacity:.85}
    .xf-own-post-picker .xf-own-summary{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}
    .xf-own-post-picker .xf-own-status{flex:1;min-width:0;font-size:12px;color:var(--xf-own-muted);white-space:pre-line;overflow-wrap:anywhere}
    .xf-own-post-picker [data-action="recent"]{font-size:12px;white-space:nowrap;padding:4px 8px;min-height:32px}
    .xf-own-post-picker .xf-own-results{max-height:280px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;padding:4px}
    .xf-own-post-picker .xf-own-post{display:grid;grid-template-columns:minmax(0,1fr);align-items:center;gap:12px;width:100%;text-align:left;border-radius:12px;padding:12px;font-weight:400}
    .xf-own-post-picker .xf-own-post.xf-own-has-cover{grid-template-columns:112px minmax(0,1fr)}
    .xf-own-post-picker .xf-own-post + .xf-own-post{margin-top:4px}
    .xf-own-post-picker .xf-own-cover{position:relative;display:grid;place-items:center;width:112px;height:84px;overflow:hidden;border-radius:8px;background:var(--xf-own-hover);color:var(--xf-own-muted);box-shadow:inset 0 0 0 1px var(--xf-own-border)}
    .xf-own-post-picker .xf-own-cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
    .xf-own-post-picker .xf-own-post:has(> .xf-own-cover[data-article="true"]){grid-template-columns:160px minmax(0,1fr)}
    .xf-own-post-picker .xf-own-cover[data-article="true"]{width:160px;height:auto;background:transparent;box-shadow:none}
    .xf-own-post-picker .xf-own-cover[data-article="true"] img{position:static;display:block;width:100%;height:auto;object-fit:contain}
    .xf-own-post-picker .xf-own-content{min-width:0;display:block}
    .xf-own-post-picker .xf-own-row-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px}
    .xf-own-post-picker .xf-own-meta{font-size:12px;color:var(--xf-own-muted);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    .xf-own-post-picker .xf-own-kind{font-weight:600}
    .xf-own-post-picker .xf-own-title{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin-bottom:4px;font-weight:700;overflow-wrap:anywhere}
    .xf-own-post-picker .xf-own-text{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-line;overflow-wrap:anywhere}
    .xf-own-post-picker .xf-own-quote{display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;color:var(--xf-own-muted)}
    .xf-own-post-picker .xf-own-post:hover .xf-own-quote,.xf-own-post-picker .xf-own-post:focus-visible .xf-own-quote{color:var(--xf-own-fg)}
    .xf-own-post-picker .xf-own-empty{padding:24px 12px;text-align:center;font-size:14px;color:var(--xf-own-muted)}
    .xf-own-post-picker .xf-own-skeleton{padding:16px 12px}
    .xf-own-post-picker .xf-own-skeleton span{display:block;height:12px;background:var(--xf-own-hover);border-radius:4px;margin-bottom:12px}
    .xf-own-post-picker .xf-own-skeleton span:first-child{width:32%}
    .xf-own-post-picker .xf-own-skeleton span:last-child{width:72%;margin:0}
    .xf-own-post-picker .xf-own-sync{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--xf-own-muted);padding:8px 0;border-top:1px solid var(--xf-own-border)}
    .xf-own-post-picker .xf-own-sync-text{flex:1;min-width:0;white-space:pre-line}
    .xf-own-post-picker .xf-own-sync button{font-size:12px;white-space:nowrap}
    .xf-own-post-picker footer{display:flex;align-items:center;gap:8px;flex-wrap:wrap;border-top:1px solid var(--xf-own-border);padding-top:8px;margin-top:8px}
    .xf-own-post-picker footer:empty{display:none}
    .xf-own-post-picker footer button{font-size:12px}
    .xf-own-post-picker [data-action="previous"]{color:var(--xf-own-muted);margin-left:auto;font-weight:400}
    @container (max-width:360px){.xf-own-post-picker .xf-own-post{padding:12px 4px;gap:12px}.xf-own-post-picker .xf-own-post.xf-own-has-cover{grid-template-columns:72px minmax(0,1fr)}.xf-own-post-picker .xf-own-cover{width:72px;height:72px}.xf-own-post-picker .xf-own-post:has(> .xf-own-cover[data-article="true"]){grid-template-columns:112px minmax(0,1fr)}.xf-own-post-picker .xf-own-cover[data-article="true"]{width:112px;height:auto}.xf-own-post-picker .xf-own-quote span{display:none}.xf-own-post-picker [data-action="previous"]{margin-left:0}.xf-own-post-picker .xf-own-search-field svg{display:none}.xf-own-post-picker .xf-own-summary{align-items:flex-start}}

  `)
}

export function openOwnPostPicker(modal: HTMLElement, trigger: HTMLButtonElement, insert: (url: string) => void) {
  const existing = modal.querySelector<HTMLElement>('[data-testid="xf-own-post-picker"]')
  if (existing) { existing.querySelector<HTMLInputElement>('input')?.focus(); return }
  ensureStyles()
  const handle = getOwnHandle()
  const panel = document.createElement('section')
  panel.className = 'xf-own-post-picker'
  panel.dataset.testid = 'xf-own-post-picker'
  panel.setAttribute('aria-label', '引用我的帖子')
  const theme = getThemeColors()
  for (const [key, value] of Object.entries({ bg: theme.bg, fg: theme.fg, muted: theme.fgSecondary, border: theme.border, hover: theme.hoverBg })) {
    panel.style.setProperty(`--xf-own-${key}`, value)
  }
  panel.innerHTML = `<header><div><h3>引用我的帖子</h3><div class="xf-own-account"></div></div><button class="xf-own-close" type="button" aria-label="关闭帖子选择器" title="关闭 · Esc"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button></header>
    <form><div class="xf-own-search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input type="search" aria-label="搜索我的帖子" placeholder="搜索旧帖或文章" maxlength="200"></div><button type="submit">搜索</button></form>
    <div class="xf-own-summary"><div class="xf-own-status" role="status" aria-live="polite"></div><button type="button" data-action="recent" hidden>返回最近发布</button></div>
    <div class="xf-own-results" aria-label="我的帖子列表"></div>
    <div class="xf-own-sync"><span class="xf-own-sync-text"></span><button type="button" data-action="sync">同步旧帖</button></div>
    <footer><button type="button" data-action="more" hidden>显示更多结果</button><button type="button" data-action="retry" hidden>重试</button></footer>`
  panel.querySelector('.xf-own-account')!.textContent = handle ? `@${handle} · 选择一条插入当前编辑框` : '选择一条插入当前编辑框'
  const input = panel.querySelector('input')!
  const status = panel.querySelector<HTMLElement>('.xf-own-status')!
  const results = panel.querySelector<HTMLElement>('.xf-own-results')!
  const more = panel.querySelector<HTMLButtonElement>('[data-action="more"]')!
  const retry = panel.querySelector<HTMLButtonElement>('[data-action="retry"]')!
  const recent = panel.querySelector<HTMLButtonElement>('[data-action="recent"]')!
  const submit = panel.querySelector<HTMLButtonElement>('[type="submit"]')!
  const controller = new AbortController()
  const syncText = panel.querySelector<HTMLElement>('.xf-own-sync-text')!
  const syncButton = panel.querySelector<HTMLButtonElement>('[data-action="sync"]')!
  let syncing = false
  let limit = 30
  let sequence = 0
  let rendered = ''
  let debounce: ReturnType<typeof setTimeout> | undefined
  let polling: ReturnType<typeof setInterval> | undefined
  let query = ''

  const posts = new Map<string, OwnPost>()
  const close = (focus = true) => {
    observer.disconnect()
    clearTimeout(debounce)
    clearInterval(polling)
    window.removeEventListener('xf-own-library-updated', refresh)
    controller.abort()
    panel.remove()
    trigger.setAttribute('aria-expanded', 'false')
    if (focus && trigger.isConnected) trigger.focus()
  }
  const observer = new MutationObserver(() => { if (!panel.isConnected) close(false) })
  panel.querySelector<HTMLButtonElement>('[aria-label="关闭帖子选择器"]')!.onclick = () => close()
  panel.addEventListener('keydown', event => {
    event.stopPropagation()
    if (event.key === 'Escape') { event.preventDefault(); close() }
  })
  panel.addEventListener('click', event => event.stopPropagation())
  const select = (url: string) => {
    if (!modal.isConnected || (handle && getOwnHandle()?.toLowerCase() !== handle.toLowerCase())) {
      status.textContent = '当前账号已变化，请重新打开选择器'
      return
    }
    close(false)
    insert(url)
  }
  const render = () => {
    const scrollTop = results.scrollTop
    results.replaceChildren()
    for (const post of posts.values()) {
      // Never accept arbitrary URLs from the page bridge.
      if (post.handle?.toLowerCase() !== handle?.toLowerCase() || !/^\d+$/.test(post.id)) continue
      const row = document.createElement('button')
      row.type = 'button'
      row.className = 'xf-own-post'
      row.dataset.postId = post.id
      const thumbnailUrl = normalizeOwnPostThumbnail(post.thumbnailUrl)
      if (thumbnailUrl) {
        const cover = document.createElement('span')
        cover.className = 'xf-own-cover'
        if (post.title) cover.dataset.article = 'true'
        cover.setAttribute('aria-hidden', 'true')
        row.classList.add('xf-own-has-cover')
        row.append(cover)
        const image = document.createElement('img')
        image.alt = ''
        image.setAttribute('loading', 'lazy')
        image.decoding = 'async'
        image.referrerPolicy = 'no-referrer'
        image.width = post.title ? 160 : 112
        if (!post.title) image.height = 84
        image.addEventListener('error', () => {
          cover.remove()
          row.classList.remove('xf-own-has-cover')
        }, { once: true })
        image.src = thumbnailUrl
        cover.append(image)
      }
      const meta = document.createElement('span')
      meta.className = 'xf-own-meta'
      const kind = document.createElement('span')
      kind.className = 'xf-own-kind'
      kind.textContent = post.title ? '文章' : '帖子'
      const date = document.createElement('span')
      date.textContent = post.timestamp ? new Date(post.timestamp).toLocaleDateString('zh-CN') : '日期未知'
      meta.append(kind, date)
      const content = document.createElement('span')
      content.className = 'xf-own-content'
      const heading = document.createElement('span')
      heading.className = 'xf-own-row-heading'
      heading.append(meta)
      content.append(heading)
      if (post.title) {
        const title = document.createElement('span')
        title.className = 'xf-own-title'
        title.textContent = post.title
        content.append(title)
      }
      const text = document.createElement('span')
      text.className = 'xf-own-text'
      text.textContent = post.text || '查看并引用这条帖子'
      content.append(text)
      const action = document.createElement('span')
      action.className = 'xf-own-quote'
      action.innerHTML = '<span>引用</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>'
      heading.append(action)
      row.append(content)
      row.setAttribute('aria-label', `引用${post.title ? '文章' : '帖子'}：${post.title || post.text || '无文字内容'}`)
      row.onclick = () => select(`https://x.com/${handle}/status/${post.id}`)
      results.append(row)
    }
    results.scrollTop = scrollTop
  }
  async function load() {
    if (!handle || controller.signal.aborted) return
    const version = ++sequence
    results.setAttribute('aria-busy', 'true')
    retry.hidden = true
    recent.hidden = !query
    try {
      const page = await searchLibrary(handle, query, limit)
      if (version !== sequence || controller.signal.aborted) return
      posts.clear()
      for (const post of page.posts) posts.set(post.id, post)
      const signature = JSON.stringify(page.posts)
      if (signature !== rendered) { render(); rendered = signature }
      const meta = page.meta
      const autoSync = page.autoSync !== false
      syncing = meta.syncing
      syncButton.textContent = syncing ? '暂停同步' : !autoSync ? '手动同步' : meta.paused ? '继续同步' : meta.historyDone ? '立即更新' : '继续同步旧帖'
      const updated = meta.lastRefresh ? new Date(meta.lastRefresh).toLocaleString('zh-CN', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : ''
      syncText.textContent = `已缓存 ${page.count} 条 · ${syncing ? (page.count ? '正在后台同步…' : '正在建立本地帖子库…') : !autoSync ? '自动同步已关闭' : meta.paused ? '同步已暂停' : meta.historyDone ? '已读至 X 可提供的末尾' : '历史记录尚未同步完'}${updated ? `\n最近更新 ${updated}` : ''}`
      if (meta.error) syncText.textContent += `\n${meta.error}${meta.retryAt > Date.now() ? (autoSync && !meta.paused ? '，稍后自动重试' : '，请稍后手动重试') : ''}`
      more.hidden = posts.size >= page.total
      more.textContent = `显示更多结果（${posts.size}/${page.total}）`
      status.textContent = query ? `本地搜索 · 找到 ${page.total} 条` : `最近发布 · ${page.count} 条已缓存`
      if (!posts.size) {
        results.replaceChildren()
        const empty = document.createElement('div')
        empty.className = 'xf-own-empty'
        empty.textContent = !page.count ? (syncing ? '首次同步中，帖子会陆续出现在这里' : '同步你的帖子后，即可快速搜索')
          : !meta.historyDone ? '缓存中暂未找到，继续同步可查找更早的内容' : '缓存中未找到匹配内容，试试其他关键词'
        results.append(empty)
      }
    } catch (error) {
      if (version !== sequence || controller.signal.aborted) return
      status.textContent = error instanceof Error ? error.message : '本地搜索失败，请重试'
      retry.hidden = false
    } finally {
      if (version === sequence) results.setAttribute('aria-busy', 'false')
    }
  }
  const refresh = () => { void load() }
  const search = () => { clearTimeout(debounce); query=input.value.trim();limit=30;results.scrollTop=0;void load() }
  panel.querySelector('form')!.onsubmit = event => { event.preventDefault();search() }
  input.addEventListener('input', () => { clearTimeout(debounce);debounce=setTimeout(search,150) })
  recent.onclick = () => { input.value='';search() }
  more.onclick = () => { limit+=30;void load() }
  retry.onclick = refresh
  syncButton.onclick = async () => {
    syncButton.disabled=true
    try {
      if(syncing) await pauseLibrary()
      else { void syncLibrary(true).then(refresh).catch(refresh) }
      await load()
    } catch(error) { status.textContent=error instanceof Error?error.message:'同步失败，请重试' }
    finally { syncButton.disabled=false }
  }
  const previousUrl = getPrecomposeUrl()
  if (previousUrl && /^https:\/\/(?:x\.com|twitter\.com)\/(?:[A-Za-z0-9_]+\/status\/\d+|i\/article\/\d+)(?:[/?#]|$)/.test(previousUrl)) {
    const previous = document.createElement('button')
    previous.type = 'button'
    previous.dataset.action = 'previous'
    previous.textContent = '引用最近浏览'
    previous.setAttribute('aria-label', '插入最近浏览的链接')
    previous.title = previousUrl
    previous.onclick = () => select(previousUrl)
    panel.querySelector('footer')!.append(previous)
  }
  // Keep the picker inside X's existing dialog and focus trap, outside its toolbar.
  const publish = modal.querySelector('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]')
  let toolbar: HTMLElement | null = trigger.parentElement
  while (toolbar && toolbar !== modal && (!publish || !toolbar.contains(publish))) toolbar = toolbar.parentElement
  if (toolbar && toolbar !== modal) toolbar.insertAdjacentElement('beforebegin', panel)
  else modal.append(panel)
  observer.observe(document.body, { childList: true, subtree: true })
  trigger.setAttribute('aria-expanded', 'true')
  input.focus()
  if (handle) {
    void load()
    window.addEventListener('xf-own-library-updated', refresh)
    polling=setInterval(refresh,3000)
    void syncLibrary().then(refresh).catch(refresh)
  }
  else {
    status.textContent = '未识别到当前登录账号，请刷新 X 后重试。'
    submit.disabled = recent.disabled = syncButton.disabled = true
  }
}
