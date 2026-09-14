/**
 * 推文、长文阅读与写作编辑器目录提取核心解析算法（支持 X 原生两级标题体系：H1 大标题 与 H2 副标题）
 */

export interface TocHeadingItem {
  id: string
  text: string
  level: 1 | 2
  element: HTMLElement
  index: number
}

/**
 * 常见序号模式
 * Level 1: 一、 二、 第一章 第1节 Part 1 【xxx】 # 标题
 * Level 2: 1. 2. 1.1 1/ 1️⃣ 2️⃣ (1) （一） a. b. 📌 🔥 💡 ## 标题 ### 标题
 */

const RE_MARKDOWN_H1 = /^#\s+(.+)$/
const RE_MARKDOWN_H2 = /^##\s+(.+)$/
const RE_MARKDOWN_H3_PLUS = /^#{3,6}\s+(.+)$/

const RE_CHINESE_NUM_L1 = /^(?:(?:第[0-9一二三四五六七八九十百]+[章节篇部分条集期部])|(?:其[次一二三]|首先|最后)[、:：\s]|Part\s*\d+|Chapter\s*\d+|[一二三四五六七八九十]+[、.．])\s*(.*)$/i
const RE_CHINESE_NUM_L2 = /^(?:(?:然后|接下来)?(?:第[0-9一二三四五六七八九十百]+[个点步阶段方面]))\s*(.*)$/i
const RE_CHINESE_PAREN_L2 = /^[（(][一二三四五六七八九十]+[）)]\s*(.*)$/
const RE_ARABIC_NUM_L2 = /^(\d+)[.、．/]\s*(.+)$/
const RE_ARABIC_PAREN_L2 = /^[（(](\d+)[）)]\s*(.+)$/
const RE_DECIMAL_L2 = /^(\d+\.\d+(?:\.\d+)?)\s*(.+)$/
const RE_LETTER_L2 = /^[a-zA-Z][.、）)]\s*(.+)$/
const RE_BRACKET_L1 = /^【([^】]+)】\s*(.*)$/
const RE_EMOJI_DIGIT_L2 = /^[0-9]\uFE0F?\u20E3\s*(.+)$/u
const RE_KEY_EMOJI_L2 = /^[📌🔥💡🚀🎯🌟✨📢⚡️👉🔑]\s*(.+)$/u

/**
 * 清理标题文本的首尾 Markdown 符号与标点符号（句号、逗号、冒号、分号等）
 */
export function cleanHeadingPunctuation(text: string): string {
  return text
    .replace(/^[#\s]+/, '')
    .replace(/[\s，。：:；;、……]+$/, '')
    .trim()
}

/**
 * 检查 DOM 元素内部的全部文字是否都是加粗显示（全段粗体）
 */
export function isElementFullyBold(el: HTMLElement): boolean {
  const tagName = el.tagName.toLowerCase()
  if (tagName === 'b' || tagName === 'strong') return true

  const totalText = el.textContent?.trim() || ''
  if (!totalText) return false

  const boldSpans = Array.from(
    el.querySelectorAll<HTMLElement>('strong, b, [style*="font-weight"]'),
  )
  if (boldSpans.length === 0) return false

  const boldText = boldSpans
    .filter((span) => {
      const tag = span.tagName.toLowerCase()
      if (tag === 'b' || tag === 'strong') return true
      const style = span.getAttribute('style') || ''
      return /font-weight\s*:\s*(bold|[6-9]00)/i.test(style)
    })
    .map((s) => s.textContent || '')
    .join('')
    .trim()

  return totalText === boldText
}

/**
 * 将单行文本分类为 Level 1, 2 标题或 null
 */
export function classifyHeading(
  rawText: string,
  options?: { hasNativeHeadings?: boolean },
): { level: 1 | 2; cleanText: string } | null {
  const text = rawText.trim()
  if (!text || text.length > 60) return null

  // 标题内部不应包含分号（分号通常表示排比或复合长句）
  if (text.includes('；') || text.includes(';')) return null
  // 标题内部不应包含两个及以上逗号（多逗号属于散文/长句描述）
  if ((text.match(/[，,]/g) || []).length >= 2) return null

  // 1. Markdown 标记判断（即使结尾带标点也允许修剪）
  const mH1 = text.match(RE_MARKDOWN_H1)
  if (mH1) return { level: 1, cleanText: cleanHeadingPunctuation(mH1[1]) }

  const mH2 = text.match(RE_MARKDOWN_H2)
  if (mH2) return { level: 2, cleanText: cleanHeadingPunctuation(mH2[1]) }

  const mH3Plus = text.match(RE_MARKDOWN_H3_PLUS)
  if (mH3Plus) return { level: 2, cleanText: cleanHeadingPunctuation(mH3Plus[1]) }

  // 2. 中文大纲模式（Level 1：第一章、一、首先：等强结构标识）
  const mCnL1 = text.match(RE_CHINESE_NUM_L1)
  if (mCnL1) {
    const clean = cleanHeadingPunctuation(text)
    return { level: 1, cleanText: clean }
  }

  const mBracket = text.match(RE_BRACKET_L1)
  if (mBracket) {
    const combined = mBracket[2] ? `${mBracket[1]} - ${mBracket[2]}` : mBracket[1]
    return { level: 1, cleanText: cleanHeadingPunctuation(combined) }
  }

  // 3. 中文序号模式（Level 2：第一个、第二步、第3点等）
  const mCnL2 = text.match(RE_CHINESE_NUM_L2)
  if (mCnL2) {
    const clean = cleanHeadingPunctuation(text.replace(/^(?:然后|接下来)/, ''))
    return { level: 2, cleanText: clean }
  }

  // 弱判断规则：普通行末尾带句子结束标点时不作为标题
  if (/(?:[。；;，,……]|\.\.\.)$/.test(text)) return null

  // 若文章正文中已存在明确的原生 H1/H2 标签，则不从普通段落中弱推断副标题（避免将正文第1条/Emoji段落误判为标题）
  if (options?.hasNativeHeadings) {
    return null
  }

  // 4. 多级小数（Level 2）
  const mDec = text.match(RE_DECIMAL_L2)
  if (mDec) {
    return { level: 2, cleanText: text }
  }

  // 5. 阿拉伯数字与括号序号、重点 Emoji（Level 2，要求不能是带逗号的叙述句）
  const mKeyEmoji = text.match(RE_KEY_EMOJI_L2)
  if (mKeyEmoji && text.length <= 35 && !/[，,]/.test(text)) {
    return { level: 2, cleanText: text }
  }

  const mNumL2 = text.match(RE_ARABIC_NUM_L2)
  if (mNumL2 && text.length <= 35 && !/[，,]/.test(text)) {
    return { level: 2, cleanText: text }
  }

  const mParenL2 = text.match(RE_CHINESE_PAREN_L2) || text.match(RE_ARABIC_PAREN_L2)
  if (mParenL2 && text.length <= 35) {
    return { level: 2, cleanText: text }
  }

  const mEmojiDigit = text.match(RE_EMOJI_DIGIT_L2)
  if (mEmojiDigit && text.length <= 35) {
    return { level: 2, cleanText: text }
  }

  // 6. 字母序号（Level 2）
  const mLetter = text.match(RE_LETTER_L2)
  if (mLetter && text.length <= 35) {
    return { level: 2, cleanText: text }
  }

  return null
}

interface BlockInfo {
  element: HTMLElement
  text: string
  isBold?: boolean
}

/**
 * 从 HTML 节点递归提取文本块
 */
function extractBlockTexts(element: HTMLElement): BlockInfo[] {
  const blocks: BlockInfo[] = []

  // 匹配所有可能的标题和文本块节点（原生标题、段落、Draft.js 块、推文文本块等）
  const candidateElements = element.querySelectorAll<HTMLElement>(
    'h1, h2, h3, h4, [role="heading"], p, [data-testid="twitter-article-title"], [data-block="true"], .longform-unstyled',
  )

  if (candidateElements.length > 0) {
    candidateElements.forEach((el) => {
      const tagName = el.tagName.toLowerCase()
      const isNativeHeading =
        tagName === 'h1' ||
        tagName === 'h2' ||
        tagName === 'h3' ||
        tagName === 'h4' ||
        el.getAttribute('role') === 'heading' ||
        el.classList.contains('longform-header-one') ||
        el.classList.contains('longform-header-two')

      // 列表项、引用块、代码块绝对不作为目录标题候选
      if (!isNativeHeading) {
        const isListItem =
          tagName === 'li' ||
          el.closest('li, ul, ol') !== null ||
          el.classList.contains('longform-unordered-list-item') ||
          el.classList.contains('longform-ordered-list-item') ||
          el.getAttribute('role') === 'listitem'

        const isBlockquote =
          tagName === 'blockquote' ||
          el.closest('blockquote') !== null ||
          el.classList.contains('longform-blockquote')

        const isCode =
          tagName === 'pre' ||
          el.closest('pre, code') !== null ||
          el.classList.contains('longform-code-block')

        if (isListItem || isBlockquote || isCode) {
          return
        }
      }

      // 避免父子元素重复（例如父元素是 [data-block="true"]，子元素是 h1）
      if (!isNativeHeading && el.querySelector('h1, h2, h3, h4, [role="heading"], .longform-header-one, .longform-header-two')) {
        return
      }
      const text = el.textContent?.trim() || ''
      if (text) {
        const isBold = isElementFullyBold(el)
        blocks.push({ element: el, text, isBold })
      }
    })
    return blocks
  }

  // 普通 tweetText 处理：可能由多个 span 或包含 \n 的文本组成
  const text = element.innerText || element.textContent || ''
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  lines.forEach((line) => {
    blocks.push({ element, text: line })
  })

  return blocks
}

/**
 * 从页面或指定的 Article/Composer 节点解析所有目录标题项
 */
export function extractHeadingsFromArticle(
  doc: Document,
  rootElement?: HTMLElement | null,
): TocHeadingItem[] {
  let target = rootElement

  if (!target) {
    // 优先寻找长文写作编辑器容器，其次寻找包含整个文章/推文的容器
    target =
      doc.querySelector<HTMLElement>('[data-testid="composer"]') ||
      doc.querySelector<HTMLElement>('[data-testid="composerRichTextInputContainer"]') ||
      doc.querySelector<HTMLElement>('article[data-testid="article"]') ||
      doc.querySelector<HTMLElement>('[data-testid="primaryColumn"] article[data-testid="tweet"]') ||
      doc.querySelector<HTMLElement>('article[data-testid="tweet"]') ||
      doc.querySelector<HTMLElement>('[data-testid="twitterArticleReadView"]') ||
      doc.querySelector<HTMLElement>('[data-testid="twitterArticleRichTextView"]')
  }

  if (!target) return []

  const headings: TocHeadingItem[] = []
  const seenElements = new Set<HTMLElement>()
  let articleTitleText = ''

  // 1. 优先提取文章显式大标题 (Article Title / Composer Title Textarea)
  const titleEl =
    doc.querySelector<HTMLElement>('textarea[placeholder*="标题"], textarea[placeholder*="title"], textarea[placeholder*="Title"]') ||
    target.querySelector<HTMLElement>('[data-testid="twitter-article-title"]') ||
    target.querySelector<HTMLElement>('h1[role="heading"]') ||
    target.querySelector<HTMLElement>('h1:not([data-block="true"])')

  if (titleEl) {
    const titleText = (titleEl instanceof HTMLTextAreaElement || titleEl instanceof HTMLInputElement)
      ? titleEl.value.trim()
      : (titleEl.textContent?.trim() || '')

    if (titleText && titleText.length >= 2) {
      articleTitleText = titleText
      const id = titleEl.id || `xf-toc-header-title`
      if (!titleEl.id) titleEl.id = id
      headings.push({
        id,
        text: titleText,
        level: 1,
        element: titleEl,
        index: 0,
      })
      seenElements.add(titleEl)
    }
  }

  // 2. 查找正文区域（支持长文阅读与写作编辑器）
  const bodyEl =
    target.querySelector<HTMLElement>('[data-testid="composer"]') ||
    target.querySelector<HTMLElement>('[data-testid="composerRichTextInputContainer"]') ||
    target.querySelector<HTMLElement>('[data-testid="twitterArticleRichTextView"]') ||
    target.querySelector<HTMLElement>('[data-testid="twitterArticleReadView"]') ||
    target.querySelector<HTMLElement>('[data-testid="tweetText"]') ||
    target

  // 检查正文区域内是否已存在原生 H1/H2 标题标签
  const hasNativeHeadings = !!bodyEl.querySelector(
    '.longform-header-one, .longform-header-two, h1, h2, [role="heading"]',
  )

  // 3. 提取所有段落/行块
  const blocks = extractBlockTexts(bodyEl)

  for (const block of blocks) {
    const el = block.element
    const text = block.text.trim()
    if (!text || el === titleEl || (el !== bodyEl && seenElements.has(el))) continue

    // 若与顶部大标题完全一致且紧跟在其后，避免重复生成两遍标题
    if (headings.length === 1 && text === articleTitleText) {
      continue
    }

    // 检查是否是原生 HTML 标题标签或 Draft.js 标题（X 原生只有 标题 H1 和 副标题 H2）
    const tagName = el.tagName.toLowerCase()
    let level: 1 | 2 | null = null
    let cleanText = text

    if (
      tagName === 'h1' ||
      el.classList.contains('longform-header-one') ||
      (el.getAttribute('role') === 'heading' && el.getAttribute('aria-level') === '1')
    ) {
      level = 1
      cleanText = text
    } else if (
      tagName === 'h2' ||
      tagName === 'h3' ||
      tagName === 'h4' ||
      el.classList.contains('longform-header-two') ||
      (el.getAttribute('role') === 'heading')
    ) {
      level = 2
      cleanText = text
    } else {
      // 文本模式分类（支持 # 一、xxx, ## 1. xxx, 一、xxx, 1. xxx 等）
      const classified = classifyHeading(text, { hasNativeHeadings })
      if (classified) {
        level = classified.level
        cleanText = classified.cleanText
      } else if (
        !hasNativeHeadings &&
        block.isBold &&
        cleanHeadingPunctuation(text).length >= 2 &&
        cleanHeadingPunctuation(text).length <= 40 &&
        !text.includes('\n') &&
        (cleanHeadingPunctuation(text).match(/[，,]/g) || []).length < 2
      ) {
        // 当文章没有原生 H1/H2 富文本标题时，作者通常使用整段全加粗的短行来作为章节小标题
        level = 2
        cleanText = cleanHeadingPunctuation(text)
      }
    }

    if (level !== null) {
      const index = headings.length
      const id = el.id || `xf-toc-header-${index}`
      if (!el.id) el.id = id

      headings.push({
        id,
        text: cleanText,
        level,
        element: el,
        index,
      })
      if (el !== bodyEl) {
        seenElements.add(el)
      }
    }
  }

  return headings
}
