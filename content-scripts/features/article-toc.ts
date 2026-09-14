import { extractHeadingsFromArticle, type TocHeadingItem } from '../../shared/toc-parser'
import { KeyArticleToc } from '../../storage-keys'
import { getStorage } from '../utilities/storage'
import addStyles from '../utilities/addStyles'
import debounce from '../utilities/debounce'

const TOC_STYLES = `
.xf-toc-container,
.xf-toc-container * {
  box-sizing: border-box !important;
}

.xf-toc-container {
  position: fixed !important;
  right: 20px !important;
  left: auto !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  z-index: 99999 !important;
  user-select: none !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif !important;
  pointer-events: auto !important;
  width: auto !important;
  max-width: fit-content !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-end !important;
}

.xf-toc-minimal {
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  align-items: flex-end !important;
  padding: 8px 6px !important;
  cursor: pointer !important;
  width: 32px !important;
  min-width: 32px !important;
  max-width: 32px !important;
  background: transparent !important;
  backdrop-filter: blur(16px) !important;
  -webkit-backdrop-filter: blur(16px) !important;
  border: none !important;
  box-shadow: none !important;
  transition: all 0.2s ease !important;
}

@media (prefers-color-scheme: dark) {
  .xf-toc-minimal {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
  }
}

body[style*="background-color: rgb(0, 0, 0)"] .xf-toc-minimal,
body[style*="background-color: rgb(21, 32, 43)"] .xf-toc-minimal {
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
}

.xf-toc-minimal:hover {
  transform: scale(1.05);
}

.xf-toc-lines {
  display: flex !important;
  flex-direction: column !important;
  gap: 7px !important;
  align-items: flex-end !important;
  width: 20px !important;
  min-width: 20px !important;
  max-width: 20px !important;
}

.xf-toc-line {
  cursor: pointer !important;
  padding: 2px 0 !important;
  transition: all 0.2s ease !important;
  display: flex !important;
  justify-content: flex-end !important;
  align-items: center !important;
}

.xf-toc-line:hover {
  transform: scale(1.2) !important;
}

.xf-toc-line-bar {
  background-color: #71767b !important;
  height: 2.5px !important;
  border-radius: 2px !important;
  opacity: 0.5 !important;
  transition: all 0.2s ease !important;
}

.xf-toc-line-bar.level-1 {
  width: 20px !important;
  height: 3px !important;
  opacity: 0.75 !important;
}

.xf-toc-line-bar.level-2 {
  width: 13px !important;
  height: 2.5px !important;
  opacity: 0.55 !important;
}

.xf-toc-line-bar.active {
  background-color: #1d9bf0 !important;
  opacity: 1 !important;
  box-shadow: 0 0 8px rgba(29, 155, 240, 0.95) !important;
  transform: scaleX(1.2);
}

.xf-toc-detailed-wrapper {
  position: absolute !important;
  top: 50% !important;
  right: 0 !important;
  transform: translateY(-50%) !important;
  border-radius: 14px !important;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.25) !important;
  z-index: 100000 !important;
  width: 280px !important;
}

.xf-toc-detailed {
  background-color: #ffffff !important;
  border: 1px solid rgba(0, 0, 0, 0.12) !important;
  border-radius: 14px !important;
  padding: 12px !important;
  width: 100% !important;
  max-height: min(720px, 82vh) !important;
  display: flex !important;
  flex-direction: column !important;
  box-sizing: border-box !important;
}

@media (prefers-color-scheme: dark) {
  .xf-toc-detailed {
    background-color: #15202b !important;
    border-color: rgba(255, 255, 255, 0.16) !important;
  }
}

body[style*="background-color: rgb(0, 0, 0)"] .xf-toc-detailed {
  background-color: #000000 !important;
  border-color: rgba(255, 255, 255, 0.2) !important;
}

body[style*="background-color: rgb(21, 32, 43)"] .xf-toc-detailed {
  background-color: #15202b !important;
  border-color: rgba(255, 255, 255, 0.16) !important;
}

.xf-toc-header {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding-bottom: 8px !important;
  margin-bottom: 8px !important;
  border-bottom: 1px solid rgba(128, 128, 128, 0.18) !important;
  font-size: 13px !important;
  font-weight: 700 !important;
  color: #0f1419 !important;
  width: 100% !important;
  flex-shrink: 0 !important;
}

@media (prefers-color-scheme: dark) {
  .xf-toc-header {
    color: #f7f9f9 !important;
  }
}
body[style*="background-color: rgb(0, 0, 0)"] .xf-toc-header,
body[style*="background-color: rgb(21, 32, 43)"] .xf-toc-header {
  color: #f7f9f9 !important;
}

.xf-toc-count {
  font-size: 11px !important;
  font-weight: 600 !important;
  color: #1d9bf0 !important;
  background: rgba(29, 155, 240, 0.12) !important;
  padding: 2px 7px !important;
  border-radius: 9999px !important;
}

.xf-toc-items {
  display: block !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  max-height: calc(min(720px, 82vh) - 52px) !important;
  padding-right: 4px !important;
  width: 100% !important;
}

.xf-toc-items::-webkit-scrollbar {
  width: 4px !important;
}
.xf-toc-items::-webkit-scrollbar-thumb {
  background: rgba(128, 128, 128, 0.35) !important;
  border-radius: 2px !important;
}

.xf-toc-item {
  display: flex !important;
  flex-direction: row !important;
  align-items: center !important;
  width: 100% !important;
  box-sizing: border-box !important;
  padding: 5px 8px !important;
  margin: 1px 0 !important;
  border-radius: 6px !important;
  cursor: pointer !important;
  text-decoration: none !important;
  transition: background 0.15s ease, color 0.15s ease !important;
  font-size: 12.5px !important;
  line-height: 1.45 !important;
  min-height: 28px !important;
  height: auto !important;
  color: #536471 !important;
  -webkit-font-smoothing: antialiased !important;
}

@media (prefers-color-scheme: dark) {
  .xf-toc-item {
    color: #8b98a5 !important;
  }
}
body[style*="background-color: rgb(0, 0, 0)"] .xf-toc-item,
body[style*="background-color: rgb(21, 32, 43)"] .xf-toc-item {
  color: #8b98a5 !important;
}

.xf-toc-item:hover {
  background-color: rgba(128, 128, 128, 0.12) !important;
  color: #1d9bf0 !important;
}

.xf-toc-item.active {
  background-color: rgba(29, 155, 240, 0.14) !important;
  color: #1d9bf0 !important;
  font-weight: 600 !important;
}

/* 层级标记徽章（仅 H1 标题与 H2 副标题） */
.xf-toc-level-tag {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 9.5px !important;
  font-weight: 700 !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
  line-height: 1 !important;
  padding: 1.5px 4.5px !important;
  border-radius: 4px !important;
  margin-right: 7px !important;
  flex-shrink: 0 !important;
  letter-spacing: 0.02em !important;
}

.xf-toc-level-tag.level-1 {
  background: rgba(29, 155, 240, 0.14) !important;
  color: #1d9bf0 !important;
  border: 1px solid rgba(29, 155, 240, 0.28) !important;
}

.xf-toc-level-tag.level-2 {
  background: rgba(113, 118, 123, 0.12) !important;
  color: #536471 !important;
  border: 1px solid rgba(113, 118, 123, 0.22) !important;
}

@media (prefers-color-scheme: dark) {
  .xf-toc-level-tag.level-2 {
    background: rgba(255, 255, 255, 0.08) !important;
    color: #8b98a5 !important;
    border-color: rgba(255, 255, 255, 0.14) !important;
  }
}
body[style*="background-color: rgb(0, 0, 0)"] .xf-toc-level-tag.level-2,
body[style*="background-color: rgb(21, 32, 43)"] .xf-toc-level-tag.level-2 {
  background: rgba(255, 255, 255, 0.08) !important;
  color: #8b98a5 !important;
  border-color: rgba(255, 255, 255, 0.14) !important;
}

.xf-toc-item-text {
  flex: 1 1 auto !important;
  min-width: 0 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.xf-toc-item.level-1 {
  font-weight: 600 !important;
  color: #0f1419 !important;
  font-size: 13px !important;
  padding-left: 6px !important;
}
@media (prefers-color-scheme: dark) {
  .xf-toc-item.level-1 {
    color: #e7e9ea !important;
  }
}
body[style*="background-color: rgb(0, 0, 0)"] .xf-toc-item.level-1,
body[style*="background-color: rgb(21, 32, 43)"] .xf-toc-item.level-1 {
  color: #e7e9ea !important;
}

.xf-toc-item.level-2 {
  font-size: 12px !important;
  padding-left: 16px !important;
}
`

class ArticleTocManager {
  private container: HTMLElement | null = null
  private minimalView: HTMLElement | null = null
  private detailedWrapper: HTMLElement | null = null
  private detailedView: HTMLElement | null = null
  private linesContainer: HTMLElement | null = null
  private itemsContainer: HTMLElement | null = null

  private headings: TocHeadingItem[] = []
  private lineBars: HTMLElement[] = []
  private tocItems: HTMLElement[] = []
  private currentActiveIndex = -1
  private isManualScrolling = false
  private observer: IntersectionObserver | null = null
  private resizeHandler: (() => void) | null = null
  private stylesInjected = false

  // 写作界面实时编辑防抖监听
  private composerElement: HTMLElement | null = null
  private composerObserver: MutationObserver | null = null
  private composerInputListener: ((e: Event) => void) | null = null
  private titleTextareaElement: HTMLElement | null = null
  public debouncedUpdate: () => void = debounce(() => {
    void this.update()
  }, 350)

  public async update(forceEnabled?: boolean) {
    // 快速前置判断：普通短推文时间线（如 /home 首页）不包含长文阅读或写作编辑器；
    // 既无文章容器且无已挂载的目录面板时直接短路，避免主页高频滚动反复 IPC 读 storage 与遍历 DOM。
    const hasArticleOrComposer = Boolean(
      window.location.pathname.includes('/article') ||
      document.querySelector('[data-testid="composer"], [data-testid="composerRichTextInputContainer"], [data-testid="twitterArticleReadView"], [data-testid="twitterArticleRichTextView"], article[data-testid="article"]')
    )
    if (!hasArticleOrComposer && !this.container) {
      return
    }

    let isEnabled = forceEnabled
    if (typeof isEnabled === 'undefined') {
      const stored = await getStorage(KeyArticleToc)
      isEnabled = stored !== 'off' && stored !== 'hide'
    }

    if (!isEnabled) {
      this.destroy()
      return
    }

    const newHeadings = extractHeadingsFromArticle(document)
    // 少于 2 个标题则不展示目录，避免干扰普通短推文
    if (newHeadings.length < 2) {
      this.destroy()
      this.attachComposerListeners()
      return
    }

    this.ensureStyles()

    // 检查标题是否与当前渲染的一致
    if (this.isSameHeadings(newHeadings)) {
      this.updatePosition()
      this.attachComposerListeners()
      return
    }

    this.headings = newHeadings
    this.render()
    this.setupIntersectionObserver()
    this.updatePosition()
    this.attachComposerListeners()
  }

  private attachComposerListeners() {
    const composer = document.querySelector<HTMLElement>('[data-testid="composer"], [data-testid="composerRichTextInputContainer"]')
    const titleTextarea = document.querySelector<HTMLElement>('textarea[placeholder*="标题"], textarea[placeholder*="title"], textarea[placeholder*="Title"]')

    if (composer && this.composerElement !== composer) {
      this.detachComposerListeners()
      this.composerElement = composer

      this.composerInputListener = () => {
        this.debouncedUpdate()
      }

      composer.addEventListener('input', this.composerInputListener, { passive: true })
      composer.addEventListener('keyup', this.composerInputListener, { passive: true })
      if (titleTextarea) {
        this.titleTextareaElement = titleTextarea
        titleTextarea.addEventListener('input', this.composerInputListener, { passive: true })
      }

      this.composerObserver = new MutationObserver(() => {
        this.debouncedUpdate()
      })
      this.composerObserver.observe(composer, { childList: true, subtree: true, characterData: true })
    }
  }

  private detachComposerListeners() {
    if (this.composerObserver) {
      this.composerObserver.disconnect()
      this.composerObserver = null
    }
    if (this.composerElement && this.composerInputListener) {
      this.composerElement.removeEventListener('input', this.composerInputListener)
      this.composerElement.removeEventListener('keyup', this.composerInputListener)
      this.titleTextareaElement?.removeEventListener('input', this.composerInputListener)
    }
    this.composerElement = null
    this.composerInputListener = null
    this.titleTextareaElement = null
  }

  private ensureStyles() {
    if (!this.stylesInjected) {
      addStyles('article-toc', TOC_STYLES)
      this.stylesInjected = true
    }
  }

  private isSameHeadings(newHeadings: TocHeadingItem[]): boolean {
    if (!this.container || this.headings.length !== newHeadings.length) return false
    for (let i = 0; i < this.headings.length; i++) {
      if (this.headings[i].text !== newHeadings[i].text || this.headings[i].level !== newHeadings[i].level) {
        return false
      }
    }
    return true
  }

  private render() {
    if (!this.container) {
      this.createContainer()
    }

    if (!this.linesContainer || !this.itemsContainer) return

    this.linesContainer.innerHTML = ''
    this.itemsContainer.innerHTML = ''
    this.lineBars = []
    this.tocItems = []

    const levelWidthMap: Record<number, number> = { 1: 20, 2: 13 }

    this.headings.forEach((header, index) => {
      // 1. 简约短线视图 (Minimal view)
      const line = document.createElement('div')
      line.className = 'xf-toc-line'
      line.setAttribute('data-index', String(index))
      line.setAttribute('title', header.text)

      const lineBar = document.createElement('div')
      lineBar.className = `xf-toc-line-bar level-${header.level}`
      lineBar.style.width = `${levelWidthMap[header.level] || 13}px`
      line.appendChild(lineBar)
      this.linesContainer!.appendChild(line)
      this.lineBars.push(lineBar)

      line.addEventListener('click', (e) => {
        e.stopPropagation()
        this.scrollToHeader(index)
      })

      // 2. 详细列表视图 (Detailed view)
      const item = document.createElement('a')
      item.className = `xf-toc-item level-${header.level}`
      item.setAttribute('data-index', String(index))
      item.setAttribute('title', header.text)
      item.href = `#${header.id}`

      // H1 / H2 标记徽章
      const tag = document.createElement('span')
      tag.className = `xf-toc-level-tag level-${header.level}`
      tag.textContent = `H${header.level}`

      const textSpan = document.createElement('span')
      textSpan.className = 'xf-toc-item-text'
      textSpan.textContent = header.text

      item.appendChild(tag)
      item.appendChild(textSpan)
      this.itemsContainer!.appendChild(item)
      this.tocItems.push(item)

      item.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        this.scrollToHeader(index)
      })
    })

    // 更新数量角标
    const countBadge = this.container?.querySelector('.xf-toc-count')
    if (countBadge) {
      countBadge.textContent = `${this.headings.length} 节`
    }

    this.updateActiveItem(0)
  }

  private createContainer() {
    this.container = document.createElement('div')
    this.container.className = 'xf-toc-container'
    this.container.innerHTML = `
      <div class="xf-toc-minimal">
        <div class="xf-toc-lines"></div>
      </div>
      <div class="xf-toc-detailed-wrapper" style="display: none;">
        <div class="xf-toc-detailed">
          <div class="xf-toc-header">
            <span class="xf-toc-title">📑 目录导航</span>
            <span class="xf-toc-count"></span>
          </div>
          <div class="xf-toc-items"></div>
        </div>
      </div>
    `

    document.body.appendChild(this.container)

    this.minimalView = this.container.querySelector('.xf-toc-minimal')
    this.detailedWrapper = this.container.querySelector('.xf-toc-detailed-wrapper')
    this.detailedView = this.container.querySelector('.xf-toc-detailed')
    this.linesContainer = this.container.querySelector('.xf-toc-lines')
    this.itemsContainer = this.container.querySelector('.xf-toc-items')

    // 绑定 Hover 悬停展示全貌
    this.container.addEventListener('mouseenter', () => this.showDetailed())
    this.container.addEventListener('mouseleave', () => this.hideDetailed())

    // 绑定窗口尺寸更新
    this.resizeHandler = () => this.updatePosition()
    window.addEventListener('resize', this.resizeHandler)
  }

  private showDetailed() {
    if (this.minimalView) this.minimalView.style.display = 'none'
    if (this.detailedWrapper) this.detailedWrapper.style.display = 'block'
  }

  private hideDetailed() {
    if (this.minimalView) this.minimalView.style.display = 'flex'
    if (this.detailedWrapper) this.detailedWrapper.style.display = 'none'
  }

  public scrollToHeader(index: number) {
    if (index >= 0 && index < this.headings.length) {
      const header = this.headings[index]
      this.isManualScrolling = true
      header.element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      this.updateActiveItem(index)

      setTimeout(() => {
        this.isManualScrolling = false
      }, 800)
    }
  }

  private setupIntersectionObserver() {
    if (this.observer) {
      this.observer.disconnect()
    }

    const options: IntersectionObserverInit = {
      rootMargin: '0px 0px -70% 0px',
      threshold: 0,
    }

    this.observer = new IntersectionObserver((entries) => {
      if (this.isManualScrolling) return

      const visibleHeaders = entries
        .filter((entry) => entry.isIntersecting)
        .map((entry) => this.headings.find((h) => h.element === entry.target))
        .filter(Boolean) as TocHeadingItem[]

      if (visibleHeaders.length > 0) {
        const firstVisible = visibleHeaders.sort((a, b) => a.index - b.index)[0]
        this.updateActiveItem(firstVisible.index)
      }
    }, options)

    this.headings.forEach((header) => {
      if (header.element && header.element.nodeType === Node.ELEMENT_NODE) {
        this.observer?.observe(header.element)
      }
    })
  }

  private updateActiveItem(index: number) {
    if (this.currentActiveIndex === index && index !== -1) return

    // 移除旧激活态
    if (this.currentActiveIndex !== -1) {
      this.lineBars[this.currentActiveIndex]?.classList.remove('active')
      this.tocItems[this.currentActiveIndex]?.classList.remove('active')
    }

    this.currentActiveIndex = index

    // 设置新激活态
    if (index !== -1) {
      this.lineBars[index]?.classList.add('active')
      this.tocItems[index]?.classList.add('active')
    }
  }

  public updatePosition() {
    if (!this.container) return
    this.container.style.left = 'auto'
    this.container.style.right = '20px'
  }

  public destroy() {
    this.detachComposerListeners()
    if (this.observer) {
      this.observer.disconnect()
      this.observer = null
    }
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler)
      this.resizeHandler = null
    }
    if (this.container) {
      this.container.remove()
      this.container = null
    }
    this.headings = []
    this.lineBars = []
    this.tocItems = []
    this.currentActiveIndex = -1
  }
}

export const articleTocManager = new ArticleTocManager()

export function updateArticleToc(forceEnabled?: boolean, debounced = false) {
  if (debounced) {
    articleTocManager.debouncedUpdate()
  } else {
    void articleTocManager.update(forceEnabled)
  }
}

export function destroyArticleToc() {
  articleTocManager.destroy()
}
