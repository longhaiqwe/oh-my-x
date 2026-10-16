/**
 * Markdown 转 X (Twitter) Post 格式排版转换器
 *
 * 针对 X 平台的阅读特性，将纯 Markdown 文本转换为结构清晰、无语法杂质的推文格式：
 * 1. 标题：剥离 # 标识符，保持段落间距与呼吸感
 * 2. 列表：
 *    - 一级无序列表 (*, -, +) 转换为清晰圆点项目符号 (• )
 *    - 二级嵌套列表转换为带缩进的项目符号 (  ▫ )
 *    - 有序列表保持编号规整
 * 3. 加粗/强调：
 *    - 中文文本剥离 ** 与 __ 标记，恢复自然阅读
 *    - 纯英文/数字转换为 Unicode 无衬线数学粗体 (如 𝗯𝗼𝗹𝗱, 𝟭𝟮𝟯)
 *    - 列表项开头的词条标签 (**例子**:) 规范为中文冒号 (• 例子：)
 * 4. 引用与代码：
 *    - 引用块 (>) 转换为推文通用引用符号 (▎)
 *    - 行内代码块 (`code`) 转换为纯文本
 * 5. 链接与标点：
 *    - Markdown 超链接 [text](url) 转换为 "text url"
 *    - 中文环境下的半角冒号规范化
 */

// Unicode 无衬线数学粗体映射 (Sans-serif Bold)
const BOLD_MAP: Record<string, string> = {
  // A-Z
  A: '𝗔', B: '𝗕', C: '𝗖', D: '𝗗', E: '𝗘', F: '𝗙', G: '𝗚', H: '𝗛', I: '𝗜',
  J: '𝗝', K: '𝗞', L: '𝗟', M: '𝗠', N: '𝗡', O: '𝗢', P: '𝗣', Q: '𝗤', R: '𝗥',
  S: '𝗦', T: '𝗧', U: '𝗨', V: '𝗩', W: '𝗪', X: '𝗫', Y: '𝗬', Z: '𝗭',
  // a-z
  a: '𝗮', b: '𝗯', c: '𝗰', d: '𝗱', e: '𝗲', f: '𝗳', g: '𝗴', h: '𝗵', i: '𝗶',
  j: '𝗷', k: '𝗸', l: '𝗹', m: '𝗺', n: '𝗻', o: '𝗼', p: '𝗽', q: '𝗾', r: '𝗿',
  s: '𝘀', t: '𝘁', u: '𝘂', v: '𝘃', w: '𝘄', x: '𝘅', y: '𝘆', z: '𝘇',
  // 0-9
  '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰',
  '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵',
}

/**
 * 将英文字母和数字转换为 Unicode 粗体；若包含中文等字符则去除粗体符号，保留原字符
 */
export function formatBoldText(text: string, convertAsciiToUnicode = true): string {
  // 若包含中文字符，统一剥离粗体标记，避免中英文混排产生不协调
  const hasCjk = /[\u4e00-\u9fa5]/.test(text)
  if (hasCjk || !convertAsciiToUnicode) {
    return text
  }

  // 纯 ASCII / 英文 / 数字：转换字母和数字为数学粗体，标点原样保留
  return text
    .split('')
    .map((char) => BOLD_MAP[char] || char)
    .join('')
}

/**
 * 检测一段文本是否具有 Markdown 语法特征
 */
export function isMarkdownContent(text: string): boolean {
  if (!text || typeof text !== 'string') return false
  const trimmed = text.trim()
  if (!trimmed) return false

  // 1. 标题语法：行首以 1~6 个 # 加空格开头
  if (/^#{1,6}\s+\S+/m.test(trimmed)) return true

  // 2. 粗体语法：**text** 或 __text__
  if (/(\*\*|__)[^\s*_\r\n]+.*?\1/.test(trimmed)) return true

  // 3. 无序列表语法：行首以 *、- 或 + 开头，后跟空格
  if (/^(\s*)[*+-]\s+\S+/m.test(trimmed)) return true

  // 4. 超链接语法：[text](url)
  if (/\[[^\]]+\]\(https?:\/\/[^\s)]+\)/.test(trimmed)) return true

  // 5. 引用块语法：行首以 > 开头
  if (/^\s*>\s+\S+/m.test(trimmed)) return true

  return false
}

export interface MarkdownToPostOptions {
  /** 是否将纯英文/数字加粗转换为 Unicode 数学粗体，默认为 true */
  unicodeBold?: boolean
  /** 一级列表项目符号，默认为 "• " */
  primaryBullet?: string
  /** 二级列表项目符号，默认为 "    ▫ " */
  secondaryBullet?: string
}

/**
 * 核心转换函数：将 Markdown 文本转换为适合 X 发帖的排版文本
 */
export function convertMarkdownToPost(
  markdown: string,
  options: MarkdownToPostOptions = {}
): string {
  if (!markdown) return ''

  const {
    unicodeBold = true,
    primaryBullet = '• ',
    secondaryBullet = '    ▫ ',
  } = options

  // 1. 统一换行符
  let lines = markdown.replace(/\r\n/g, '\n').split('\n')

  const processedLines: string[] = []

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // 处理分割线 ---, ***, ___
    if (/^(\s*[-*_]\s*){3,}$/.test(line)) {
      processedLines.push('───')
      continue
    }

    // 处理标题：# 标题，## 标题，### 标题
    const headingMatch = line.match(/^(\s*)#{1,6}\s+(.+)$/)
    if (headingMatch) {
      const headingContent = headingMatch[2].trim()
      processedLines.push(headingContent)
      continue
    }

    // 处理引用块：> 引用内容
    const quoteMatch = line.match(/^(\s*)>\s?(.*)$/)
    if (quoteMatch) {
      const quoteContent = quoteMatch[2]
      processedLines.push(`▎${quoteContent}`)
      continue
    }

    // 处理二级/多级嵌套无序列表：4个空格或2个空格缩进
    const nestedListMatch = line.match(/^(\s{2,}|\t+)[*\-+]\s+(.+)$/)
    if (nestedListMatch) {
      let content = nestedListMatch[2]
      content = cleanLineFormatting(content, unicodeBold)
      processedLines.push(`${secondaryBullet}${content}`)
      continue
    }

    // 处理一级无序列表：* 列表，- 列表，+ 列表
    const primaryListMatch = line.match(/^(\s*)[*\-+]\s+(.+)$/)
    if (primaryListMatch) {
      let content = primaryListMatch[2]
      content = cleanLineFormatting(content, unicodeBold)
      processedLines.push(`${primaryBullet}${content}`)
      continue
    }

    // 处理有序列表：1. 内容，2. 内容
    const orderedListMatch = line.match(/^(\s*)(\d+\.)\s+(.+)$/)
    if (orderedListMatch) {
      const indent = orderedListMatch[1]
      const number = orderedListMatch[2]
      let content = orderedListMatch[3]
      content = cleanLineFormatting(content, unicodeBold)
      processedLines.push(`${indent}${number} ${content}`)
      continue
    }

    // 普通文本行
    const cleaned = cleanLineFormatting(line, unicodeBold)
    processedLines.push(cleaned)
  }

  // 2. 清理多余空行，最多保留 1 个连续空行
  const resultLines: string[] = []
  let previousWasEmpty = false

  for (let i = 0; i < processedLines.length; i++) {
    const line = processedLines[i]
    const isEmpty = line.trim() === ''

    if (isEmpty) {
      if (!previousWasEmpty && resultLines.length > 0) {
        resultLines.push('')
        previousWasEmpty = true
      }
    } else {
      resultLines.push(line)
      previousWasEmpty = false
    }
  }

  // 去除首尾空行
  return resultLines.join('\n').trim()
}

/**
 * 辅助清洗单行内的 Markdown 格式（链接、行内代码、粗体、标点规范）
 */
function cleanLineFormatting(line: string, unicodeBold: boolean): string {
  let res = line

  // 1. 处理超链接 [文字](url) -> 文字 url
  res = res.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 $2')

  // 2. 处理行内代码 `code` -> code
  res = res.replace(/`([^`]+)`/g, '$1')

  // 3. 处理行首或冒号前的标签加粗，例如 **例子**: 或 **为什么不彻底?** 或 **形而上彻底性：**
  // 兼顾中英文冒号与问号：**词条**: 或 **词条**：
  res = res.replace(/\*\*([^*]+)\*\*:\s*/g, (_, p1) => `${p1}：`)
  res = res.replace(/\*\*([^*]+)\*\*：\s*/g, (_, p1) => `${p1}：`)

  // 4. 处理正文内的加粗 **text** 与 __text__
  res = res.replace(/(\*\*|__)(.*?)\1/g, (_, __, innerText) => {
    return formatBoldText(innerText, unicodeBold)
  })

  // 5. 标点符号与间距微调：中文后的半角冒号与问号转为全角
  res = res.replace(/([\u4e00-\u9fa5])\s*:\s*/g, '$1：')
  res = res.replace(/([\u4e00-\u9fa5])\s*\?\s*/g, '$1？ ')

  return res
}
