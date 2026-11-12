import { notificationFingerprint, type NotificationActor, type NotificationEntry, type NotificationKind } from '../../shared/notification-cards'
import { normalizeOwnPostThumbnail } from '../../shared/own-posts'

function handleFromLink(link: HTMLAnchorElement): string | null {
  try {
    const url = new URL(link.href, location.origin)
    if (!['x.com', 'twitter.com', 'mobile.twitter.com'].includes(url.hostname)) return null
    const handle = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/?$/)?.[1]
    return handle && !/^(home|explore|notifications|settings|compose|search|i)$/i.test(handle) ? handle : null
  } catch { return null }
}

function cleanText(element: Element | null): string {
  if (!element) return ''
  const clone = element.cloneNode(true) as Element
  clone.querySelectorAll('time, svg, [aria-hidden="true"], [class^="xf-"], [id^="xf-"]').forEach(node => node.remove())
  return (clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 2000)
}

function getActor(article: Element, link: HTMLAnchorElement): NotificationActor | null {
  const handle = handleFromLink(link)
  if (!handle) return null
  const links = [...article.querySelectorAll<HTMLAnchorElement>('a[href]')].filter(a => handleFromLink(a)?.toLowerCase() === handle.toLowerCase())
  const named = links.find(a => cleanText(a) && !cleanText(a).startsWith('@'))
  const image = links.map(a => a.querySelector('img')).find(Boolean)
  return { handle, name: cleanText(named || link) || handle, avatar: normalizeOwnPostThumbnail(image?.src) || '', verified: Boolean(named?.querySelector('[data-testid="icon-verified"]')) }
}

/** 仅使用真实页面 DOM；不访问 React 私有状态，也不复制原生交互节点。 */
export function parseNotificationArticle(article: Element): NotificationEntry | null {
  const isTweet = article.getAttribute('data-testid') === 'tweet'
  const time = article.querySelector('time[datetime]')
  const timestamp = Date.parse(time?.getAttribute('datetime') || '') || 0
  const text = cleanText(article.querySelector('[data-testid="tweetText"]'))
  let actors: NotificationActor[] = [], summary = '', url = '', kind: NotificationKind = 'other'
  if (isTweet) {
    const name = article.querySelector('[data-testid="User-Name"], [data-testid="UserName"]')
    const link = name?.querySelector<HTMLAnchorElement>('a[href]')
    const actor = link && getActor(article, link)
    if (!actor) return null
    actors = [actor]
    const status = time?.closest('a')?.getAttribute('href') || ''
    let postUrl: URL
    try { postUrl = new URL(status, location.origin) } catch { return null }
    if (!['x.com', 'twitter.com', 'mobile.twitter.com'].includes(postUrl.hostname)) return null
    const match = postUrl.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)$/)
    if (!match) return null
    url = `https://x.com/${match[1]}/status/${match[2]}`
    kind = 'reply' // UI 称“回复 / 提及”，不把所有通知里的帖子断定为直接回复。
  } else {
    let header: Element | null = time?.parentElement || null
    while (header && header !== article && !header.querySelector('a[href]')) header = header.parentElement
    if (!header || header === article) {
      // 没有时间/标题的占位节点不入库，避免误记为互动。
      return null
    }
    summary = cleanText(header).replace(/[·•]\s*$/, '').trim()
    if (/新帖(?:子)?(?:通知|提醒)|(?:new (?:post|tweet)(?:s)? (?:notification|alert)(?:s)?|(?:post|tweet) notifications?)/i.test(summary)) kind = 'post'
    else if (/点赞|喜欢了|liked your/i.test(summary)) kind = 'like'
    else if (/转帖|转推|转发了|reposted|retweeted/i.test(summary)) kind = 'repost'
    else if (/关注了你|关注你了|关注了您|followed you|following you/i.test(summary)) kind = 'follow'
    const links = [...article.querySelectorAll<HTMLAnchorElement>('ul a[href]'), ...header.querySelectorAll<HTMLAnchorElement>('a[href]')]
    const seen = new Set<string>()
    for (const link of links) {
      const actor = getActor(article, link)
      if (!actor || seen.has(actor.handle.toLowerCase())) continue
      seen.add(actor.handle.toLowerCase()); actors.push(actor)
    }
    if (!summary) return null
  }
  const grouped = actors.length > 1 || /另外|others|\d+\s*个帖子|\d+\s*(?:posts|tweets)/i.test(summary)
  const id = notificationFingerprint(url || JSON.stringify([kind, timestamp, summary, text, actors.map(a => a.handle.toLowerCase()).sort()]))
  // 原始指纹保留用于原生节点定位和旧收据兼容。点赞／转帖按目标帖子与用户保存已读，
  // 合并通知的时间、昵称、摘要和头像名单更新不能撤销旧用户的已读状态。
  let readId: string | undefined
  if (kind === 'like' || kind === 'repost' || kind === 'follow') {
    const targets = [...new Set([...article.querySelectorAll<HTMLAnchorElement>('a[href]')].flatMap(link => {
      if (!['x.com', 'twitter.com', 'mobile.twitter.com'].includes(link.hostname)) return []
      return link.pathname.match(/^\/[A-Za-z0-9_]{1,15}\/status\/(\d+)\/?$/)?.[1] || []
    }))].sort()
    const target = targets.length ? ['posts', targets] : text ? ['text', text] : ['unknown', timestamp]
    // 关注事件可以重复发生；没有帖子地址和正文时，也不能推断不同时间的通知属于同一帖。
    readId = notificationFingerprint(JSON.stringify(['interaction', kind, kind === 'follow' ? timestamp : target]))
  }
  return { id, readId, actors, kind, summary, text, timestamp, url, grouped }
}

export function getNotificationAccount(): string | null {
  try {
    const raw = document.cookie.match(/(?:^|;\s*)twid=([^;]+)/)?.[1]
    const id = raw && decodeURIComponent(raw).replace(/"/g, '').match(/^u=(\d+)$/)?.[1]
    if (id) return `uid:${id}`
  } catch {}
  const link = document.querySelector<HTMLAnchorElement>('a[data-testid="AppTabBar_Profile_Link"]')
  const handle = link && handleFromLink(link)
  return handle ? `handle:${handle.toLowerCase()}` : null
}

export function findNotificationTimeline(): HTMLElement | null {
  const primary = document.querySelector('[data-testid="primaryColumn"]')
  const article = primary?.querySelector('article[data-testid="notification"], article[data-testid="tweet"]')
  const cell = article?.closest('[data-testid="cellInnerDiv"]')
  return cell?.parentElement || null
}
