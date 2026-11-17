import config from '../../config.js'
import log from './logger.js'

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const timeoutMs = config.downloads?.timeoutMs ?? 30000

const DEFAULT_APIS = {
  vreden: 'https://api.vreden.web.id',
  ootaizumi: 'https://api.ootaizumi.web.id',
  delirius: 'https://api.delirius.online',
  zenzxz: 'https://api.zenzxz.my.id',
  siputzx: 'https://api.siputzx.my.id',
  lempi: 'https://api.lempi.lat',
  fare: 'https://fare.ink',
  tikwm: 'https://www.tikwm.com'
}

const DEFAULT_KEYS = { lempi: 'montekey28', anabot: 'freeApikey' }

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

export const apiBase = name => String(config.downloads?.[name] ?? '').replace(/\/+$/, '')

export const api = name => ({
  url: apiBase(name) || DEFAULT_APIS[name] || '',
  key: config.downloads?.keys?.[name] ?? DEFAULT_KEYS[name] ?? null
})

export const fetchRaw = (url, { method = 'GET', headers = {}, body, timeout = timeoutMs } = {}) =>
  fetch(url, {
    method,
    body,
    redirect: 'follow',
    headers: { 'User-Agent': USER_AGENT, ...headers },
    signal: AbortSignal.timeout(timeout)
  })

const request = async (url, options = {}) => {
  const response = await fetchRaw(url, options)
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`)
    error.status = response.status
    throw error
  }
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

export const getBuffer = async (url, { max, ...options } = {}) => {
  const response = await request(url, options)
  const declared = Number(response.headers.get('content-length'))
  if (max && Number.isFinite(declared) && declared > max) {
    await response.body?.cancel?.().catch(() => {})
    throw new Error(`Archivo demasiado grande (${formatBytes(declared)})`)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (max && buffer.length > max) throw new Error(`Archivo demasiado grande (${formatBytes(buffer.length)})`)
  return buffer
}

export const headSize = async url => {
  try {
    const response = await fetchRaw(url, { method: 'HEAD', timeout: 10000 })
    const length = Number(response.headers.get('content-length'))
    if (Number.isFinite(length) && length > 0) return length
  } catch {}

  try {
    const response = await fetchRaw(url, { headers: { Range: 'bytes=0-0' }, timeout: 10000 })
    await response.body?.cancel?.().catch(() => {})
    const total = response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1]
    if (total) return Number(total)
  } catch {}

  return null
}

export const headType = async url => {
  try {
    const response = await fetchRaw(url, { method: 'HEAD', timeout: 15000 })
    if (response.ok) return response.headers.get('content-type') || null
  } catch {}
  return null
}

export const formatBytes = (bytes = 0) => {
  if (!bytes || Number.isNaN(Number(bytes))) return 'Desconocido'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = Number(bytes)
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`
}

export const parseSize = text => {
  const match = String(text || '')
    .trim()
    .match(/([\d.,]+)\s*(bytes?|b|kb|kib|mb|mib|gb|gib)/i)
  if (!match) return 0
  const multipliers = { b: 1, byte: 1, bytes: 1, kb: 1024, kib: 1024, mb: 1048576, mib: 1048576, gb: 1073741824, gib: 1073741824 }
  return Math.round(Number(match[1].replace(',', '.')) * (multipliers[match[2].toLowerCase()] || 1))
}

export const cleanName = (name, fallback = 'archivo') =>
  String(name || fallback)
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || fallback

export const cap = (title, rows) =>
  `✦ ${title}\n\n${rows
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `❖ *${key} ›* ${value}`)
    .join('\n')}`

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

export const urlsByKey = (data, keys) => {
  const wanted = keys.map(item => item.toLowerCase())
  const buckets = new Map(wanted.map(key => [key, []]))
  walk(data, (key, value) => {
    const bucket = buckets.get(key.toLowerCase())
    if (bucket && isHttp(value) && !bucket.includes(value)) bucket.push(value)
  })
  return [...new Set(wanted.flatMap(key => buckets.get(key)))]
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

export const mark = (ctx, emoji) => ctx.react(emoji).catch(() => {})

export const usage = (ctx, text, example) =>
  ctx.reply(`❀ ${text}\n> Ejemplo » *${ctx.prefix}${ctx.command} ${example}*`)

export const sendAlbum = async (ctx, items) => {
  if (items.length > 1 && typeof ctx.sock.sendAlbumMessage === 'function') {
    return ctx.sock.sendAlbumMessage(ctx.chat, items, { quoted: ctx.raw })
  }
  for (const item of items) {
    await ctx.reply({ [item.type]: item.data, caption: item.caption })
    await sleep(500)
  }
}

export const sendWithRetry = async (ctx, content, attempts = 3) => {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await ctx.reply(content)
    } catch (error) {
      const retryable = String(error?.message).includes('Media upload failed on all hosts')
      if (!retryable || attempt === attempts) throw error
      await sleep(1500 * attempt)
    }
  }
}

export const sendVideo = async (ctx, { url, caption, fileName = 'video.mp4', bytes = null }) => {
  const limit = (config.downloads?.maxVideoMb ?? 50) * 1024 * 1024
  const asDocument = () => sendWithRetry(ctx, { document: { url }, mimetype: 'video/mp4', fileName, caption })
  if (bytes && bytes > limit) return asDocument()
  try {
    return await sendWithRetry(ctx, { video: { url }, mimetype: 'video/mp4', fileName, caption })
  } catch {
    return asDocument()
  }
}

export const failure = (ctx, error) =>
  ctx.reply(
    `> An unexpected error occurred while executing command *${ctx.prefix + ctx.command}*. Please try again or contact support if the issue persists.\n> [Error: *${error?.message ?? error}*]`
  )

export const define = plugin => ({
  ...plugin,
  run: async ctx => {
    try {
      await plugin.run(ctx)
    } catch (error) {
      log.warn(`${plugin.name}: ${error?.message ?? error}`)
      await mark(ctx, '✖️')
      await failure(ctx, error).catch(() => {})
    }
  }
})

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
  
