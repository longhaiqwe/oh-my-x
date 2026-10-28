#!/usr/bin/env node
// Chrome 应用商店发版：上传包、提交审核、查状态。用的是官方 Chrome Web Store API v2。
// 配置说明见 docs/chrome-web-store-submission.md「十一、用接口发版」。
//
//   node scripts/chrome-web-store.mjs auth                    拿 refresh token，存进配置文件
//   node scripts/chrome-web-store.mjs status                  查当前状态
//   node scripts/chrome-web-store.mjs upload [包路径]         只上传，不提交
//   node scripts/chrome-web-store.mjs publish [--staged]      提交审核
//   node scripts/chrome-web-store.mjs release [包路径] [--staged]   上传 + 提交审核
//   node scripts/chrome-web-store.mjs wait [--interval 秒]    每隔一段时间查一次，审核有结果后退出
//
// 包路径不写时用 build/oh-my-x-<package.json 版本>-chrome.zip。
// --staged：审核通过后先暂存，不上线；不写时审核通过就上线。

import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ITEM_ID = 'ehnedndgpdkclhddhgdkdadhbiafaend'
const SCOPE = 'https://www.googleapis.com/auth/chromewebstore'
const API = 'https://chromewebstore.googleapis.com'
const CONFIG_PATH = process.env.CWS_CONFIG || join(homedir(), '.config', 'oh-my-x', 'chrome-web-store.json')

// 审核结果出来后不再变的状态
const FINAL_STATES = new Set(['STAGED', 'PUBLISHED', 'PUBLISHED_TO_TESTERS', 'REJECTED', 'CANCELLED'])

function fail(message) {
  console.error(`出错：${message}`)
  process.exit(1)
}

function readConfigFile() {
  if (!existsSync(CONFIG_PATH)) return {}
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
  } catch {
    fail(`配置文件不是合法的 JSON：${CONFIG_PATH}`)
  }
}

// 环境变量优先，其次是配置文件
function loadConfig() {
  const file = readConfigFile()
  return {
    clientId: process.env.CWS_CLIENT_ID || file.clientId,
    clientSecret: process.env.CWS_CLIENT_SECRET || file.clientSecret,
    refreshToken: process.env.CWS_REFRESH_TOKEN || file.refreshToken,
    publisherId: process.env.CWS_PUBLISHER_ID || file.publisherId,
  }
}

function requireConfig(config, keys) {
  const missing = keys.filter((key) => !config[key])
  if (missing.length) fail(`缺少 ${missing.join('、')}。写进 ${CONFIG_PATH}，或用对应的 CWS_* 环境变量。`)
}

function saveConfigFile(patch) {
  const next = { ...readConfigFile(), ...patch }
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 })
  chmodSync(CONFIG_PATH, 0o600)
}

function parseArgs(argv) {
  const positional = []
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--staged') flags.staged = true
    else if (arg === '--interval') flags.interval = Number(argv[++i])
    else if (arg.startsWith('--')) fail(`不认识的参数 ${arg}`)
    else positional.push(arg)
  }
  return { positional, flags }
}

async function readBody(res) {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function getAccessToken(config) {
  requireConfig(config, ['clientId', 'clientSecret', 'refreshToken'])
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  const body = await readBody(res)
  if (!res.ok) {
    const reason = body?.error === 'invalid_grant' ? '（refresh token 失效，重新跑 auth）' : ''
    fail(`换取访问令牌失败 ${res.status}${reason}：${JSON.stringify(body)}`)
  }
  return body.access_token
}

async function callApi(token, method, url, options = {}) {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...options.headers },
    body: options.body,
  })
  const body = await readBody(res)
  if (!res.ok) fail(`${method} ${url} 返回 ${res.status}：${JSON.stringify(body, null, 2)}`)
  return body
}

function itemPath(config) {
  requireConfig(config, ['publisherId'])
  return `publishers/${config.publisherId}/items/${ITEM_ID}`
}

function fetchStatus(token, config) {
  return callApi(token, 'GET', `${API}/v2/${itemPath(config)}:fetchStatus`)
}

function describeRevision(revision) {
  if (!revision) return '无'
  const channels = (revision.distributionChannels || [])
    .map((c) => `${c.crxVersion ?? '?'}（放量 ${c.deployPercentage ?? '?'}%）`)
    .join('，')
  return `${revision.state}${channels ? ` · ${channels}` : ''}`
}

function printStatus(status) {
  console.log(`线上版本：${describeRevision(status.publishedItemRevisionStatus)}`)
  console.log(`已提交版本：${describeRevision(status.submittedItemRevisionStatus)}`)
  if (status.lastAsyncUploadState) console.log(`最近一次上传：${status.lastAsyncUploadState}`)
  if (status.warned) console.log('警告：商店对这个扩展发了政策警告，要进后台看原因。')
  if (status.takenDown) console.log('警告：扩展已因违反政策被下架，要进后台看原因。')
}

function packageVersion() {
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version
}

function resolveZip(arg) {
  const zip = resolve(arg || join(ROOT, 'build', `oh-my-x-${packageVersion()}-chrome.zip`))
  if (!existsSync(zip)) fail(`找不到包：${zip}。先在干净目录跑 npm run zip，或把包路径写在命令后面。`)
  return zip
}

// 从包里读 manifest 版本，上传前给人看一眼
function zipManifestVersion(zip) {
  try {
    const manifest = JSON.parse(execFileSync('unzip', ['-p', zip, 'manifest.json'], { encoding: 'utf8' }))
    return manifest.version
  } catch {
    return undefined
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function upload(token, config, zip) {
  const version = zipManifestVersion(zip)
  console.log(`上传 ${zip}${version ? `（manifest 版本 ${version}）` : ''}`)
  const result = await callApi(token, 'POST', `${API}/upload/v2/${itemPath(config)}:upload`, {
    headers: { 'content-type': 'application/zip' },
    body: readFileSync(zip),
  })

  let state = result.uploadState
  // 包大时上传转为后台处理，要用 fetchStatus 查结果
  for (let i = 0; /IN_PROGRESS/.test(state ?? '') && i < 24; i++) {
    await sleep(5000)
    state = (await fetchStatus(token, config)).lastAsyncUploadState
  }
  if (state !== 'SUCCEEDED') fail(`上传没成功，状态 ${state}：${JSON.stringify(result, null, 2)}`)
  console.log(`上传成功：版本 ${result.crxVersion ?? version ?? '?'}`)
}

async function publish(token, config, staged) {
  const publishType = staged ? 'STAGED_PUBLISH' : 'DEFAULT_PUBLISH'
  const result = await callApi(token, 'POST', `${API}/v2/${itemPath(config)}:publish`, {
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ publishType }),
  })
  console.log(`已提交审核（${staged ? '通过后暂存，不上线' : '通过后上线'}）`)
  if (result && typeof result === 'object' && Object.keys(result).length) console.log(JSON.stringify(result, null, 2))
}

async function wait(config, intervalSeconds) {
  const interval = Math.max(60, intervalSeconds || 600)
  for (;;) {
    // 访问令牌一小时过期，每轮重新换
    const status = await fetchStatus(await getAccessToken(config), config)
    const submitted = status.submittedItemRevisionStatus
    console.log(`[${new Date().toLocaleString('zh-CN')}] 已提交版本：${describeRevision(submitted)}`)
    // 审核通过并上线后，submittedItemRevisionStatus 会清空
    if (!submitted || FINAL_STATES.has(submitted.state)) {
      printStatus(status)
      if (submitted?.state === 'REJECTED') process.exit(2)
      return
    }
    await sleep(interval * 1000)
  }
}

// 用本机回环地址走一遍 Google 授权，拿 refresh token。OAuth 客户端要建成「桌面应用」类型。
async function auth(config) {
  requireConfig(config, ['clientId', 'clientSecret'])
  const server = createServer()
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  const redirectUri = `http://127.0.0.1:${server.address().port}`
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
  })}`

  console.log('在浏览器里打开下面的地址，用发布扩展的 Google 账号登录并同意：')
  console.log(authUrl)
  if (process.platform === 'darwin') {
    try {
      execFileSync('open', [authUrl])
    } catch {}
  }

  const code = await new Promise((resolveCode, rejectCode) => {
    server.on('request', (req, res) => {
      const params = new URL(req.url, redirectUri).searchParams
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      if (params.get('code')) {
        res.end('授权完成，可以关掉这个页面。')
        resolveCode(params.get('code'))
      } else {
        res.end(`授权没完成：${params.get('error') ?? '没有返回授权码'}`)
        if (params.get('error')) rejectCode(new Error(params.get('error')))
      }
    })
  }).finally(() => server.close())

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  const body = await readBody(res)
  if (!res.ok || !body.refresh_token) fail(`换取 refresh token 失败 ${res.status}：${JSON.stringify(body)}`)
  saveConfigFile({ refreshToken: body.refresh_token })
  console.log(`refresh token 已存进 ${CONFIG_PATH}`)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const { positional, flags } = parseArgs(rest)
  const config = loadConfig()

  switch (command) {
    case 'auth':
      return auth(config)
    case 'status':
      return printStatus(await fetchStatus(await getAccessToken(config), config))
    case 'upload': {
      const zip = resolveZip(positional[0])
      return upload(await getAccessToken(config), config, zip)
    }
    case 'publish':
      return publish(await getAccessToken(config), config, flags.staged)
    case 'release': {
      const zip = resolveZip(positional[0])
      const token = await getAccessToken(config)
      await upload(token, config, zip)
      await publish(token, config, flags.staged)
      return printStatus(await fetchStatus(token, config))
    }
    case 'wait':
      return wait(config, flags.interval)
    default:
      console.log(
        readFileSync(fileURLToPath(import.meta.url), 'utf8')
          .split('\n')
          .slice(1)
          .filter((line, i, lines) => lines.slice(0, i + 1).every((l) => l.startsWith('//')))
          .map((line) => line.replace(/^\/\/ ?/, ''))
          .join('\n'),
      )
      if (command && command !== 'help') process.exit(1)
  }
}

main().catch((error) => fail(error.message))
