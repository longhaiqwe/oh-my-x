export const COMPOSER_FORMATS = ['bullet', 'number'] as const
export type ComposerFormat = typeof COMPOSER_FORMATS[number]
export type TextPoint = { block: number; offset: number }
export type TextEdit = { block: number; start: number; end: number; text: string }
export type SelectedBlock = {
  block: number
  text: string
  start: number
  end: number
}
export type FormatPlan = {
  active: boolean
  available: boolean
  edits: TextEdit[]
  start: TextPoint
  end: TextPoint
}

/** 只生成列表前缀变更计划，并映射切换后的选区。 */
export function planComposerFormat(blocks: SelectedBlock[], format: ComposerFormat): FormatPlan | null {
  if (!blocks.length) return null
  const first = blocks[0]
  const last = blocks[blocks.length - 1]
  const plan: FormatPlan = {
    active: false, available: false, edits: [],
    start: { block: first.block, offset: first.start },
    end: { block: last.block, offset: last.end },
  }
  const lines: { block: number; start: number; end: number; prefix: string }[] = []
  for (const block of blocks) {
    let offset = 0
    for (const text of block.text.split('\n')) {
      const end = offset + text.length
      if (end >= block.start && (block.start === block.end ? offset <= block.end : offset < block.end) && text.trim()) {
        const indent = text.match(/^[\t \u00a0]*/)?.[0].length ?? 0
        const prefix = text.slice(indent).match(/^(?:•[\t \u00a0]?|\d{1,4}[.)、][\t \u00a0]+)/)?.[0] ?? ''
        lines.push({ block: block.block, start: offset + indent, end, prefix })
      }
      offset = end + 1
    }
  }
  if (!lines.length) return plan
  plan.available = true
  plan.active = lines.every(line => format === 'bullet' ? line.prefix.startsWith('•') : /^\d/.test(line.prefix))
  plan.start = { block: lines[0].block, offset: lines[0].start }
  plan.end = { block: lines[lines.length - 1].block, offset: lines[lines.length - 1].end }
  lines.forEach((line, index) => {
    const old = line.prefix
    const text = plan.active ? '' : format === 'bullet' ? '• ' : `${index + 1}. `
    if (old === text) return
    const start = line.start
    plan.edits.push({ block: line.block, start, end: start + old.length, text })
  })
  return plan
}

export function mapFormatPoint(point: TextPoint, edits: TextEdit[], side: 'start' | 'end'): TextPoint {
  let delta = 0
  for (const edit of edits) {
    if (edit.block !== point.block) continue
    if (edit.end < point.offset || edit.end === point.offset && (edit.start !== edit.end || side === 'end')) {
      delta += edit.text.length - (edit.end - edit.start)
    }
  }
  return { block: point.block, offset: point.offset + delta }
}
