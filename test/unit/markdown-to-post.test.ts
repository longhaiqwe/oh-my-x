import { describe, expect, it } from 'vitest'
import { convertMarkdownToPost, formatBoldText, isMarkdownContent } from '../../shared/markdown-to-post'

describe('convertMarkdownToPost', () => {
  it('正确转换用户截图中的实际 Markdown 文本', () => {
    const input = `* **例子**: 大海上的一艘船上，**一个船员**绝望自杀了，跳进了大海。
* **为什么不彻底?** 因为他虽然死了，但整艘船还在航行，其他人还在活着；甚至在极端情况下，他自杀省下的口粮还“拯救了其他人”。在宏观的“生命存在”这个大局上，他的死没有颠覆大局，因此在哲学底层（形而上）来看，并不够彻底。
* **形而上彻底性（本质层面 / 存在论层面）：**
  * **例子**: 全船的人聚在一起，**全票通过决定把船底凿穿，让整艘船连同所有人一起沉入大海**。
  * **为什么彻底？** 这不是死了一个人，而是**“航行”这件事情本身被彻底终结了**。人类文明通过制造出可能毁灭自己的超级人工智能，走向“全人类自杀”，这就把自杀推到了极点——它直接抹杀了一切意义、一切后人、一切未来。

### 2. 结合原文：为什么作者说这叫“形而上彻底性”？

原文提到，存在的根本意图就是**“继续存在”**。

* **个人的自杀**: 只是一个局部零件损坏，宇宙中还有无数生命在“继续存在”。
* **人类/文明的自杀**（形而上彻底性）：是“智慧生命”**自己主动终结了自己存在的可能性**。存在者亲自消灭了存在本身，这就触碰到了哲学最根本、最极端的矛盾（作者称之为“彻底的悖论”）。`

    const output = convertMarkdownToPost(input)

    // 验证不再含有原始 markdown 标记
    expect(output).not.toContain('###')
    expect(output).not.toContain('**')
    expect(output).not.toContain('* **例子**')

    // 验证列表项目符号和缩进
    expect(output).toContain('• 例子：大海上的一艘船上，一个船员绝望自杀了，跳进了大海。')
    expect(output).toContain('• 为什么不彻底？ 因为他虽然死了')
    expect(output).toContain('• 形而上彻底性（本质层面 / 存在论层面）：')
    expect(output).toContain('    ▫ 例子：全船的人聚在一起，全票通过决定把船底凿穿，让整艘船连同所有人一起沉入大海。')
    expect(output).toContain('    ▫ 为什么彻底？ 这不是死了一个人')

    // 验证标题行
    expect(output).toContain('2. 结合原文：为什么作者说这叫“形而上彻底性”？')

    // 验证行内中文强调正确剥离
    expect(output).toContain('原文提到，存在的根本意图就是“继续存在”。')
    expect(output).toContain('• 个人的自杀：只是一个局部零件损坏')
  })

  it('支持纯英文字符转换为 Unicode 数学粗体', () => {
    const input = 'This is **important** and **100%** tested.'
    const output = convertMarkdownToPost(input, { unicodeBold: true })
    expect(output).toContain('𝗶𝗺𝗽𝗼𝗿𝘁𝗮𝗻𝘁')
    expect(output).toContain('𝟭𝟬𝟬%')
  })

  it('正确处理链接、引用和分割线', () => {
    const input = `
# 标题
> 这是一个引用块
请查看 [官方文档](https://x.com) 了解详情。
---
* 列表项目
`
    const output = convertMarkdownToPost(input)
    expect(output).toContain('标题')
    expect(output).toContain('▎这是一个引用块')
    expect(output).toContain('官方文档 https://x.com')
    expect(output).toContain('───')
    expect(output).toContain('• 列表项目')
  })

  it('正确检测文本是否属于 Markdown 格式 (isMarkdownContent)', () => {
    expect(isMarkdownContent('### 标题文本')).toBe(true)
    expect(isMarkdownContent('* 列表项内容')).toBe(true)
    expect(isMarkdownContent('这里有 **加粗重点** 内容')).toBe(true)
    expect(isMarkdownContent('> 引用一段话')).toBe(true)
    expect(isMarkdownContent('[点击这里](https://x.com)')).toBe(true)

    // 普通文本不误判
    expect(isMarkdownContent('这是一条普通的推特内容，没有任何语法标记。')).toBe(false)
    expect(isMarkdownContent('普通数字 123 和普通标点符号：你好！')).toBe(false)
    expect(isMarkdownContent('')).toBe(false)
  })

  it('正确转换用户提供的完整最新文本样例', () => {
    const input = `用最直白的话说：**“形而上彻底性”就是把一个问题追问到最底层的本质——触及“存在本身”，推到极端，不留任何退路、例外和回旋余地。**

在原文里，“形而上”指的不是具体的物质世界，而是**哲学的最底层逻辑（即“存在论”，关乎事物为什么活着、为什么存在）**。

为了让你更容易理解，我们可以结合作者的语境来对比：

### 1. 举个例子：船员跳海 vs. 凿沉整艘船

*   **不够彻底（经验层面 / 个体层面）：**
    *   **例子**：大海上的一艘船上，**一个船员**绝望自杀了，跳进了大海。
    *   **为什么不彻底？** 因为他虽然死了，但整艘船还在航行，其他人还在活着；甚至在极端情况下，他自杀省下的口粮还“拯救了其他人”。在宏观的“生命存在”这个大局上，他的死没有颠覆大局，因此在哲学底层（形而上）来看，并不够彻底。
*   **形而上彻底性（本质层面 / 存在论层面）：**
    *   **例子**：全船的人聚在一起，**全票通过决定把船底凿穿，让整艘船连同所有人一起沉入大海**。
    *   **为什么彻底？** 这不是死了一个人，而是**“航行”这件事情本身被彻底终结了**。人类文明通过制造出可能毁灭自己的超级人工智能，走向“全人类自杀”，这就把自杀推到了极点——它直接抹杀了一切意义、一切后人、一切未来。

### 2. 结合原文：为什么作者说这叫“形而上彻底性”？

原文提到，存在的根本意图就是**“继续存在”**。

*   **个人的自杀**：只是一个局部零件损坏，宇宙中还有无数生命在“继续存在”。
*   **人类/文明的自杀**（形而上彻底性）：是“智慧生命”**自己主动终结了自己存在的可能性**。存在者亲自消灭了存在本身，这就触碰到了哲学最根本、最极端的矛盾（作者称之为“彻底的悖论”）。

**一句话总结：**
普通的自杀只是**局部的、个体的退场**；而具有“形而上彻底性”的自杀，是**把“存在”的根基彻底连根拔起，让整个游戏规则彻底归零**。`

    const output = convertMarkdownToPost(input)

    expect(output).not.toContain('###')
    expect(output).not.toContain('**')
    expect(output).toContain('1. 举个例子：船员跳海 vs. 凿沉整艘船')
    expect(output).toContain('• 不够彻底（经验层面 / 个体层面）：')
    expect(output).toContain('    ▫ 例子：大海上的一艘船上，一个船员绝望自杀了，跳进了大海。')
    expect(output).toContain('• 形而上彻底性（本质层面 / 存在论层面）：')
    expect(output).toContain('    ▫ 例子：全船的人聚在一起，全票通过决定把船底凿穿，让整艘船连同所有人一起沉入大海。')
    expect(output).toContain('一句话总结：')
    expect(output).toContain('普通的自杀只是局部的、个体的退场；而具有“形而上彻底性”的自杀，是把“存在”的根基彻底连根拔起，让整个游戏规则彻底归零。')
  })
})
