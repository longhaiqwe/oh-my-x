// 插件克隆到左侧导航栏的入口（「我的列表」、Radar、灵感）共用：照着旁边的原生项排版，导航收起 / 展开时跟着切换

export function findNavTextNode(entry: HTMLElement): { container: HTMLElement; textSpan: HTMLElement } | null {
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

export function isNavExpanded(refLink: HTMLElement): boolean {
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
export function resolveNavEntryAlign(refLink: HTMLElement | null, expanded: boolean): string {
  const nativeAlign = refLink ? window.getComputedStyle(refLink).alignItems : ''
  if (nativeAlign && nativeAlign !== 'normal') return nativeAlign
  if (!expanded) return 'center'
  const isRtl = document.dir === 'rtl' || document.documentElement.dir === 'rtl'
  return isRtl ? 'flex-end' : 'flex-start'
}

/** 移除从参考项克隆来的未读蓝点或数字气泡 */
export function stripNavBadges(entry: HTMLElement) {
  entry.querySelectorAll('svg + div, div[aria-label], div[data-testid]').forEach((badge) => {
    if (badge !== entry && badge.parentElement !== entry && !badge.querySelector('span')) {
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
}

export function syncNavEntryLayout(
  entry: HTMLElement,
  expanded: boolean,
  refLink: HTMLElement | null,
  label: string,
  active = false,
) {
  entry.style.display = 'flex'
  entry.style.flexDirection = 'column'
  entry.style.width = '100%'
  entry.style.alignItems = resolveNavEntryAlign(refLink, expanded)
  entry.setAttribute('data-xf-mode', expanded ? 'expanded' : 'collapsed')

  const pill = entry.firstElementChild as HTMLElement | null
  if (pill) {
    pill.style.margin = ''
  }

  let textInfo = findNavTextNode(entry)
  if (!textInfo && expanded && pill && refLink) {
    // 入口在导航只显示图标时克隆（如私信页、窄窗口），X 那时不渲染文字节点。
    // 展开后照抄参考项的文字节点，带上 X 的字号、颜色类；自己新建的节点没有这些类，会显示成浏览器默认链接色
    const refText = findNavTextNode(refLink)
    if (refText) {
      pill.appendChild(refText.container.cloneNode(true))
      textInfo = findNavTextNode(entry)
    }
  }
  if (textInfo) {
    if (expanded) {
      textInfo.container.style.display = ''
      textInfo.container.style.visibility = ''
      // 文字相同时不重写：重写会换掉文字节点，触发页面变化监听再跑一轮
      if (textInfo.textSpan.textContent !== label) textInfo.textSpan.textContent = label
      textInfo.textSpan.style.fontWeight = active ? '700' : '400'
    } else {
      textInfo.container.style.display = 'none'
    }
  }
}
