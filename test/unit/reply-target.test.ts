import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CONVERSATION_ATTR,
  REPLY_OF_ATTR,
  REPLY_TARGET_EVENT,
  REPLY_TO_ATTR,
  REPLY_TO_USER_ATTR,
  annotateReplyTargets,
  findTweetLink,
  readConversationId,
  readReplyTarget,
} from '../../shared/reply-target'

// 页面内部的推文数据（2026-10-22 在真实页面看到的字段）
const inner = (id: string, replyTo?: string, user?: string, conversation = '100') => ({
  id_str: id,
  conversation_id_str: conversation,
  full_text: '正文',
  ...(replyTo ? { in_reply_to_status_id_str: replyTo, in_reply_to_screen_name: user } : {}),
})

function article(id: string, handle = 'bob') {
  const el = document.createElement('article')
  el.setAttribute('data-testid', 'tweet')
  el.innerHTML = `<a href="/${handle}/status/${id}"><time datetime="2026-10-22T01:00:00.000Z"></time></a>`
  document.body.appendChild(el)
  return el
}

/** 模拟 React 挂在元素上的组件链：推文数据在往上第 2 层 */
function attachFiber(el: HTMLElement, props: unknown) {
  ;(el as any).__reactFiber$test = { memoizedProps: { className: 'x' }, return: { memoizedProps: {}, return: { memoizedProps: props, return: null } } }
}

afterEach(() => {
  document.body.innerHTML = ''
  window.history.pushState({}, '', '/')
})

describe('从 React 数据里找推文在对话里的位置', () => {
  it('认得页面内部写法和接口原样写法；不是回复时 replyTo 为 null，没找到时返回 undefined', () => {
    expect(findTweetLink({ tweet: inner('201', '150', 'carl') }, '201')).toEqual({ conversationId: '100', replyTo: { id: '150', author: 'carl' } })
    expect(findTweetLink({ result: { rest_id: '201', legacy: inner('201', '150', 'carl') } }, '201')).toEqual({ conversationId: '100', replyTo: { id: '150', author: 'carl' } })
    expect(findTweetLink({ tweet: inner('100') }, '100')).toEqual({ conversationId: '100', replyTo: null })
    expect(findTweetLink({ tweet: inner('999', '150') }, '201')).toBeUndefined()
  })

  it('不会把引用的推文当成自己；对象互相引用时不会死循环', () => {
    // 201 回复 150，同时引用了 300（300 本身回复 299）
    const props = { tweet: { ...inner('201', '150', 'carl'), quoted_status: inner('300', '299', 'dan', '299') } }
    expect(findTweetLink(props, '201')?.replyTo).toEqual({ id: '150', author: 'carl' })
    expect(findTweetLink(props, '300')).toBeUndefined()
    const loop: any = { a: {} }
    loop.a.back = loop
    expect(findTweetLink(loop, '201')).toBeUndefined()
  })
})

describe('给推文元素写上对话 ID 和被回复推文', () => {
  it('只在对话页写；写好后触发一次事件，同一条推文不重复写', () => {
    const el = article('201')
    attachFiber(el, { tweet: inner('201', '150', 'carl') })
    const onEvent = vi.fn()
    window.addEventListener(REPLY_TARGET_EVENT, onEvent)

    window.history.pushState({}, '', '/home')
    annotateReplyTargets()
    expect(el.hasAttribute(REPLY_OF_ATTR)).toBe(false)

    window.history.pushState({}, '', '/alice/status/100')
    annotateReplyTargets()
    annotateReplyTargets()
    expect([el.getAttribute(REPLY_OF_ATTR), el.getAttribute(CONVERSATION_ATTR), el.getAttribute(REPLY_TO_ATTR), el.getAttribute(REPLY_TO_USER_ATTR)])
      .toEqual(['201', '100', '150', 'carl'])
    expect(onEvent).toHaveBeenCalledTimes(1)
    window.removeEventListener(REPLY_TARGET_EVENT, onEvent)
  })

  it('主帖的被回复推文写成空；X 把元素换给别的推文时重新写；找不到数据的不写', () => {
    window.history.pushState({}, '', '/alice/status/100')
    const main = article('100', 'alice')
    attachFiber(main, { tweet: inner('100') })
    const reused = article('201')
    attachFiber(reused, { tweet: inner('201', '100', 'alice') })
    const missing = article('202')
    annotateReplyTargets()
    expect([main.getAttribute(CONVERSATION_ATTR), main.getAttribute(REPLY_TO_ATTR)]).toEqual(['100', ''])
    expect(missing.hasAttribute(REPLY_OF_ATTR)).toBe(false)

    reused.querySelector('a')!.setAttribute('href', '/dan/status/203')
    attachFiber(reused, { tweet: inner('203', undefined, undefined, '203') })
    annotateReplyTargets()
    expect([reused.getAttribute(REPLY_OF_ATTR), reused.getAttribute(CONVERSATION_ATTR), reused.getAttribute(REPLY_TO_ATTR)]).toEqual(['203', '203', ''])
  })
})

describe('扫描器读属性', () => {
  it('属性对应的是这条推文才算；不是回复时被回复推文为 null', () => {
    const el = article('201')
    expect(readReplyTarget(el, '201')).toBeUndefined()
    expect(readConversationId(el, '201')).toBe('')
    el.setAttribute(REPLY_OF_ATTR, '201')
    el.setAttribute(CONVERSATION_ATTR, '100')
    el.setAttribute(REPLY_TO_ATTR, '150')
    el.setAttribute(REPLY_TO_USER_ATTR, 'carl')
    expect(readReplyTarget(el, '201')).toEqual({ id: '150', author: 'carl' })
    expect(readConversationId(el, '201')).toBe('100')
    expect(readReplyTarget(el, '203')).toBeUndefined()
    expect(readConversationId(el, '203')).toBe('')
    el.setAttribute(REPLY_TO_ATTR, '')
    expect(readReplyTarget(el, '201')).toBeNull()
  })
})
