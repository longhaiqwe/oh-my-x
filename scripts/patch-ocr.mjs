// Adapt the pinned Tesseract browser distribution for Chrome MV3. Tesseract
// recognition and trained-language data are unchanged. No executable may be
// fetched by a caller-supplied URL or by the upstream CDN fallback.
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const hash = (source) => createHash('sha256').update(source).digest('hex')

const LOCAL_ONLY = 'oh-my-x: bundled OCR only'
const HEADER = `// ${LOCAL_ONLY}\n`
const replacements = [
  {
    file: 'src/worker/browser/defaultOptions.js',
    sha256: '66a296b99446fdf1bc80004f601e17c2d1f77861874091923eb3d92c079c082f',
    patchedSha256: '084094afd9b2046426b9e604a9d593765709604c5c02f3617a656dbb00bc9f75',
    patch: () => `${HEADER}'use strict';
module.exports = { ...require('../../constants/defaultOptions'), workerBlobURL: false };
`,
  },
  {
    file: 'src/worker/browser/spawnWorker.js',
    sha256: '39a3b5dcb28a649111974ba97d14c6651ab4a48696034727cb8cc2706501b84f',
    patchedSha256: '2929522ec36185fd73b01beaa1694372bb47b32fa0452e2b49505ea2ea622c4d',
    patch: () => `${HEADER}'use strict';
module.exports = () => {
  if (globalThis.location.protocol !== 'chrome-extension:') {
    throw Error('OCR worker requires a Chrome extension page');
  }
  return new Worker(new URL('/ocr/worker.min.js', globalThis.location.href));
};
`,
  },
  {
    file: 'dist/worker.min.js',
    sha256: '576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d',
    patchedSha256: 'f6826c948b5ce9c26d84574a4a879daaf11ee96633ed0b7c86fbe19e03bd4069',
    patch(source) {
      // Replace the entire bundled getCore adapter in 7.0.0, preserving the
      // rest of the upstream worker and its license header.
      const moduleHeader = '976:(t,e,r)=>{"use strict";'
      const moduleStart = source.indexOf(moduleHeader)
      const start = moduleStart + moduleHeader.length
      const end = source.indexOf('},e={};function r(n)', start)
      if (moduleStart < 0 || end <= start || !source.slice(start, end).includes('tesseract.js-core@v')) {
        throw Error('Cannot find the pinned Tesseract browser getCore adapter')
      }
      return source.slice(0, start) + `
/* ${LOCAL_ONLY} */
t.exports = async function (_lstmOnly, _corePath, res) {
  if (self.location.protocol !== 'chrome-extension:') {
    throw Error('OCR core requires a Chrome extension worker');
  }
  if (typeof self.TesseractCore === 'undefined') {
    const status = 'loading tesseract core';
    res.progress({ status, progress: 0 });
    self.importScripts(new URL('/ocr/tesseract-core-simd.js', self.location.href).href);
    if (typeof self.TesseractCore !== 'function') throw Error('Failed to load bundled TesseractCore');
    res.progress({ status, progress: 1 });
  }
  return self.TesseractCore;
};
}` + source.slice(end).replace(/\n?\/\/# sourceMappingURL=worker\.min\.js\.map\s*$/, '')
    },
  },
]

export function prepareOcrDependencies({ check = false } = {}) {
  const manifest = require.resolve('tesseract.js/package.json')
  if (require(manifest).version !== '7.0.0') {
    throw Error('Review the local-only OCR adapters before upgrading Tesseract')
  }
  // Validate all inputs before writing any of them.
  const updates = []
  for (const { file, sha256, patchedSha256, patch } of replacements) {
    const path = join(dirname(manifest), file)
    const source = readFileSync(path, 'utf8')
    const digest = hash(source)
    if (digest === patchedSha256) continue
    if (check) throw Error(`Local-only adapter missing in ${file}; run npm ci`)
    if (digest !== sha256) throw Error(`Unexpected upstream Tesseract file: ${file}`)
    const output = patch(source)
    if (hash(output) !== patchedSha256) throw Error(`Unexpected patched Tesseract output: ${file}`)
    updates.push([path, output])
  }
  for (const [path, output] of updates) writeFileSync(path, output)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  prepareOcrDependencies({ check: process.argv.includes('--check') })
}
