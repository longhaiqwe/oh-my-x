import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// 设置界面（弹窗 + 完整设置页）的样式护栏：组件只用 theme.css 里的语义变量和刻度。
// 规则来源见 docs/design/DESIGN.md。
const ROOTS = ['entrypoints/popup', 'entrypoints/options']

function vueFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return vueFiles(path)
    return path.endsWith('.vue') ? [path] : []
  })
}

const files = ROOTS.flatMap((root) => vueFiles(join(process.cwd(), root)))

const RULES: { name: string; pattern: RegExp }[] = [
  {
    name: 'Tailwind 调色板颜色（应改用语义变量）',
    pattern: /\b(?:text|bg|border|ring|fill|stroke|divide|from|to|via|outline)-(?:red|rose|pink|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|slate|gray|zinc|neutral|stone|white|black)(?:-\d{2,3})?\b/g,
  },
  {
    name: '原始色阶（组件只能用语义变量）',
    pattern: /\b(?:text|bg|border|ring|fill|stroke|divide)-(?:primary|ink|paper|plum|danger|warning|success)-\d{2,3}\b/g,
  },
  { name: '十六进制或 rgb 颜色', pattern: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])|\brgba?\(/g },
  { name: '颜色透明度修饰（应改用对应的语义变量）', pattern: /\b(?:text|bg|border|ring|divide|fill)-[a-z-]+\/\d+\b/g },
  { name: '任意字号（应使用 text-xs / sm / base / lg / xl / 2xl）', pattern: /\btext-\[\d+(?:px|rem)\]/g },
  { name: '400 和 600 以外的字重', pattern: /\bfont-(?:thin|extralight|light|medium|bold|extrabold|black)\b/g },
]

describe('设置界面样式只使用设计系统', () => {
  it('找到了要检查的组件', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  for (const rule of RULES) {
    it(`不使用${rule.name}`, () => {
      const hits: string[] = []
      for (const file of files) {
        const template = readFileSync(file, 'utf8')
        for (const match of template.matchAll(rule.pattern)) {
          const line = template.slice(0, match.index).split('\n').length
          hits.push(`${relative(process.cwd(), file)}:${line} ${match[0]}`)
        }
      }
      expect(hits).toEqual([])
    })
  }
})
