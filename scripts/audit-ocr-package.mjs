import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2] ?? 'build/chrome-mv3'
const isZip = !statSync(root).isDirectory()
const entries = isZip
  ? execFileSync('unzip', ['-Z1', root], { encoding: 'utf8' }).trim().split('\n')
  : readdirSync(root, { recursive: true }).map(name => name.replaceAll('\\', '/'))
const read = (entry) => isZip
  ? execFileSync('unzip', ['-p', root, entry], { encoding: 'utf8' })
  : readFileSync(join(root, entry), 'utf8')
const page = entries.filter((entry) => /^chunks\/rewind-ocr-.*\.js$/.test(entry))
assert.equal(page.length, 1, 'expected one compiled OCR page')
for (const asset of ['ocr/worker.min.js', 'ocr/tesseract-core-simd.js', 'ocr/tesseract-core-simd.wasm']) {
  assert.ok(entries.includes(asset), `missing packaged asset: ${asset}`)
}
for (const entry of entries.filter((entry) => /\.(?:js|html)$/.test(entry))) {
  assert.ok(!/https?:[^"'\s]*\/tesseract\.js(?:-core)?@/i.test(read(entry)), `remote Tesseract executable path in ${entry}`)
}
console.log('Packaged OCR worker, core and WASM present; no Tesseract executable CDN default in build.')
