import config from '../../config.js'

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const timeoutMs = config.downloads?.timeoutMs ?? 30000

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export const apiBase = name => String(config.downloads?.[name] ?? '').replace(/\/+$/, '')

const request = async (url, { method = 'GET', headers = {}, body, timeout = timeoutMs } = {}) => {
  const response = await fetch(url, {
    method,
    body,
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT, ...headers },
    signal: AbortSignal.timeout(timeout)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response
}

export const getJson = async (url, options) => {
  const response = await request(url, { ...options, headers: { Accept: 'application/json', ...options?.headers } })
  return response.json()
}

export const postForm = async (url, fields, options) => {
  const response = await request(url, {
    ...options,
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      ...options?.headers
    },
    body: new URLSearchParams(fields).toString()
  })
  return response.json()
}

export const getText = async (url, options) => (await request(url, options)).text()

export const getFinal = async (url, options) => {
  const response = await request(url, options)
  return { url: response.url, body: await response.text() }
}

export const getBuffer = async (url, options) => Buffer.from(await (await request(url, options)).arrayBuffer())

export const headSize = async url => {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10000)
    })
    const length = Number(response.headers.get('content-length'))
    if (Number.isFinite(length) && length > 0) return length
  } catch {}

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Range: 'bytes=0-0' },
      signal: AbortSignal.timeout(10000)
    })
    const total = response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1]
    if (total) return Number(total)
  } catch {}

  return null
}

export const formatBytes = (bytes = 0) => {
  if (!bytes || Number.isNaN(bytes)) return 'Desconocido'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = Number(bytes)
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`
}

export const isHttp = value => typeof value === 'string' && /^https?:\/\//i.test(value)

export const firstUrl = (...values) => {
  for (const value of values.flat(Infinity)) {
    if (isHttp(value)) return value
  }
  return null
}

const walk = (node, visit, depth = 0, key = '') => {
  if (node == null || depth > 8) return
  if (typeof node === 'string') return visit(key, node)
  if (Array.isArray(node)) return node.forEach(item => walk(item, visit, depth + 1, key))
  if (typeof node === 'object') {
    for (const [childKey, value] of Object.entries(node)) walk(value, visit, depth + 1, childKey)
  }
}

export const deepUrl = (data, keys) => {
  const wanted = keys.map(item => item.toLowerCase())
  const found = new Map()
  walk(data, (key, value) => {
    const lower = key.toLowerCase()
    if (wanted.includes(lower) && isHttp(value) && !found.has(lower)) found.set(lower, value)
  })
  for (const key of wanted) {
    if (found.has(key)) return found.get(key)
  }
  return null
}

export const deepText = (data, keys) => {
  const wanted = keys.map(item => item.toLowerCase())
  const found = new Map()
  walk(data, (key, value) => {
    const lower = key.toLowerCase()
    if (wanted.includes(lower) && value && !isHttp(value) && !found.has(lower)) found.set(lower, value)
  })
  for (const key of wanted) {
    if (found.has(key)) return String(found.get(key))
  }
  return null
}

export const allUrls = (data, pattern) => {
  const urls = []
  walk(data, (_key, value) => {
    if (isHttp(value) && (!pattern || pattern.test(value)) && !urls.includes(value)) urls.push(value)
  })
  return urls
}

export const chain = async providers => {
  let lastError = null
  for (const provider of providers) {
    try {
      const result = await provider()
      if (result) return result
    } catch (error) {
      lastError = error
    }
    await sleep(300)
  }
  if (lastError) throw lastError
  return null
}

let btchModule = null

export const btch = async name => {
  try {
    btchModule ??= await import('btch-downloader')
    const fn = btchModule[name] ?? btchModule.default?.[name]
    return typeof fn === 'function' ? fn : null
  } catch {
    return null
  }
}

export const callBtch = async (name, input) => {
  const fn = await btch(name)
  if (!fn) throw new Error('btch-downloader no está instalado')
  const data = await fn(input)
  if (!data || data.error || data.status === false) throw new Error(data?.error || data?.message || 'Sin resultado')
  return data
}

export const sendAlbum = async (ctx, items) => {
  if (typeof ctx.sock.sendAlbumMessage === 'function') {
    return ctx.sock.sendAlbumMessage(ctx.chat, items, { quoted: ctx.raw })
  }
  for (const item of items) {
    await ctx.reply({ [item.type]: item.data, caption: item.caption })
    await sleep(500)
  }
}

export const failure = (ctx, error) =>
  ctx.reply(
    `> An unexpected error occurred while executing command *${ctx.prefix + ctx.command}*. Please try again or contact support if the issue persists.\n> [Error: *${error.message}*]`
  )

export const youtubeId = (text = '') => {
  const raw = String(text || '').trim()
  if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw
  return (
    raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/)|[?&]v=)([a-zA-Z0-9_-]{11})/)?.[1] ||
    null
  )
}

export const isYoutubeUrl = (url = '') => /^(https?:\/\/)?(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\/.+$/i.test(url)

export const decodeHtml = value =>
  String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim()
