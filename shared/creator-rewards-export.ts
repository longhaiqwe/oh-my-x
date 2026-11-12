import { chartGeometry, type RewardsBucket } from './creator-rewards-dashboard'

export interface RewardsImage {
  title: string
  signature: string
  range: string
  metrics: { label: string; value: string; coverage: string; comparison?: string }[]
  chartTitle: string
  buckets: RewardsBucket[]
  calendar?: { weekdays: string[]; cells: ({ date: string; value: number | null; active: boolean; high?: boolean; peak?: boolean; percent?: number } | null)[]; signed: boolean; peakLabel: string }
  notes: string[]
  filename: string
  format: (value: number | null) => string
}

/** 本地 Canvas 绘制 PNG；不上传账号数据，不依赖远程字体或截图服务。 */
export async function exportRewardsImage(data: RewardsImage): Promise<void> {
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  canvas.width = 2400
  canvas.height = 1800
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.scale(2, 2)
  const probe = document.createElement('span')
  document.body.append(probe)
  const color = (name: string) => {
    probe.style.color = `var(--color-${name})`
    return getComputedStyle(probe).color
  }
  const colors = { paper: color('body-bg'), card: color('card-bg'), text: color('text'), muted: color('muted-text'), accent: color('accent'), border: color('border'), negative: color('danger'), onAccent: color('on-accent'), bar: color('chart-muted'), track: color('accent-track') }
  probe.remove()
  ctx.fillStyle = colors.paper
  ctx.fillRect(0, 0, 1200, 900)
  ctx.fillStyle = colors.card
  ctx.beginPath(); ctx.roundRect(24, 24, 1152, 852, 24); ctx.fill()
  const font = getComputedStyle(document.body).fontFamily
  const text = (value: string, x: number, y: number, size: number, fill = colors.text, bold = false, max = 1080) => {
    ctx.fillStyle = fill
    ctx.font = `${bold ? 600 : 400} ${size}px ${font}`
    ctx.fillText(value, x, y, max)
  }
  text('oh-my-x', 64, 70, 17, colors.accent, true)
  text(data.signature, 760, 70, 17, colors.muted, false, 376)
  text(data.title, 64, 125, 32, colors.text, true)
  text(data.range, 64, 164, 21, colors.muted)
  // 与页面一致：奖励合计优先，两个曝光数字为辅助（Refactoring UI §2.1）。
  const primary = data.metrics[0]
  if (primary) {
    text(primary.label, 64, 218, 18, colors.muted)
    text(primary.value, 64, 285, 64, colors.text, true, 400)
    text(primary.comparison ?? '', 64, 320, 16, colors.muted, false, 560)
    if (primary.coverage) text(primary.coverage, 64, 344, 14, colors.muted, false, 560)
  }
  data.metrics.slice(1).forEach((metric, i) => {
    const x = 660 + i * 244
    text(metric.label, x, 218, 16, colors.muted, false, 220)
    text(metric.value, x, 265, 32, colors.text, true, 220)
    text(metric.comparison ?? '', x, 294, 13, colors.muted, false, 220)
    if (metric.coverage) text(metric.coverage, x, 320, 13, colors.muted, false, 220)
  })
  text(data.chartTitle, 64, 375, 20, colors.text, true)
  if (data.calendar) {
    const { cells, weekdays, signed, peakLabel } = data.calendar
    const x0 = 64, y0 = 414, gap = 6, width = (1072 - 6 * gap) / 7
    const rowCount = Math.max(1, cells.length / 7)
    const height = Math.min(90, (264 - (rowCount - 1) * gap) / rowCount)
    weekdays.forEach((day, i) => text(day, x0 + i * (width + gap) + 8, 401, 13, colors.muted))
    cells.forEach((cell, i) => {
      if (!cell) return
      const x = x0 + (i % 7) * (width + gap), y = y0 + Math.floor(i / 7) * (height + gap)
      ctx.fillStyle = cell.high ? colors.accent : cell.active ? colors.paper : colors.card
      ctx.strokeStyle = colors.border
      ctx.beginPath(); ctx.roundRect(x, y, width, height, 5); ctx.fill(); if (cell.active) ctx.stroke()
      text(`${Number(cell.date.slice(5,7))}/${Number(cell.date.slice(8))}`, x + 8, y + 14, 10, cell.high ? colors.onAccent : colors.muted, false, 36)
      const value = `${signed && cell.value !== null && cell.value > 0 ? '+' : ''}${data.format(cell.value)}`
      if (cell.peak) text(peakLabel, x + 46, y + 14, 10, cell.high ? colors.onAccent : colors.muted, true, 36)
      if (cell.active) text(value, x + 8, y + height - 10, 18, cell.high ? colors.onAccent : cell.value === null ? colors.muted : cell.value < 0 ? colors.negative : colors.text, true, width - 16)
      if (cell.active && cell.value !== null) {
        ctx.fillStyle = cell.high ? colors.onAccent : cell.value < 0 ? colors.negative : colors.bar
        ctx.fillRect(x + 8, y + height - 5, (width - 16) * (cell.percent ?? 0) / 100, 2)
      }
    })
  } else {
  const plotX = 100, plotY = 410, plotW = 1036, plotH = 220
  const geometry = chartGeometry(data.buckets, plotW, plotH)
  ctx.strokeStyle = colors.border
  ctx.beginPath(); ctx.moveTo(plotX, plotY + geometry.zero); ctx.lineTo(plotX + plotW, plotY + geometry.zero); ctx.stroke()
  text(data.format(geometry.max), 64, plotY + 12, 12, colors.muted, false, 38)
  if (geometry.min < 0) text(data.format(geometry.min), 64, plotY + plotH, 12, colors.muted, false, 38)
  data.buckets.forEach((bucket, i) => {
    const bar = geometry.bars[i]
    if (bucket.value === null) {
      text('—', plotX + bar.x, plotY + geometry.zero - 8, 12, colors.muted, false, bar.width)
    } else {
      ctx.fillStyle = bucket.value < 0 ? colors.negative : colors.accent
      ctx.fillRect(plotX + bar.x, plotY + bar.y, bar.width, bar.height)
    }
  })
  const first = data.buckets[0], last = data.buckets.at(-1)
  if (first && last) {
    text(first.start, plotX, 660, 15, colors.muted)
    text(last.end, 1030, 660, 15, colors.muted, false, 106)
  }
  }
  let lineY = 716
  for (const note of data.notes) {
    ctx.font = `14px ${font}`
    let line = ''
    for (const character of note) {
      if (ctx.measureText(line + character).width > 1060) { text(line, 64, lineY, 14, colors.muted); lineY += 22; line = '' }
      line += character
    }
    text(line, 64, lineY, 14, colors.muted); lineY += 24
  }
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG unavailable')), 'image/png'))
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = data.filename
  document.body.append(link)
  link.click()
  link.remove()
  // 浏览器需要先接管下载，再释放 URL。
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
