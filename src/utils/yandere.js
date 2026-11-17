const BASE = 'https://yande.re'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const MIN_INTERVAL_MS = Number(process.env.YANDERE_MIN_INTERVAL_MS) || 600
const MAX_CONCURRENT = Number(process.env.YANDERE_MAX_CONCURRENT) || 3
const DEFAULT_TIMEOUT_MS = Number(process.env.YANDERE_FETCH_TIMEOUT) || 12000
const MAX_ATTEMPTS = 3
const MAX_BLOCK_WAIT_MS = 20000
const BACKOFF_BASE_MS = 2000
const BACKOFF_CAP_MS = 5 * 60000
const THROTTLE_STATUS = new Set([403, 429, 503])
const POOL_TTL_MS = 5 * 60 * 1000
const POOL_LIMIT = 100
const POOL_MAX_ENTRIES = 400

export const BANNED_TAGS = /(loli|shota|child|toddler|infant)/
const EXPLICIT_TAGS =
  /(\bnude\b|nudity|topless|no_bra|no_panties|underwear_aside|clothes_aside|breasts_out|exposed_breasts|\bnipples\b|areola|\bpussy\b|\bvagina\b|\bpenis\b|testicles|\banus\b|pubic_hair|cameltoe|\bsex\b|sexual_intercourse|masturbation|fellatio|cunnilingus|paizuri|handjob|footjob|penetration|spread_pussy|spread_anus|see[-_]?through|\bnaked\b|erection|ejaculation|\bcum\b|bukkake|creampie|futanari|\bguro\b|\brape\b|bondage|tentacle)/
const ALLOWED_RATINGS = new Set(['s', 'q'])

export class YandereError extends Error {
  constructor(message, kind, status) {
    super(message)
    this.name = 'YandereError'
    this.kind = kind
    this.status = status
  }
}

const health = {
  ok: 0,
  failed: 0,
  consecutiveFails: 0,
  lastStatus: null,
  lastError: null,
  lastOkAt: 0,
  blockedUntil: 0,
  blockLevel: 0
}

let nextSlot = 0
let active = 0
const waiters = []

export const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new YandereError('aborted', 'aborted'))
    const onAbort = () => {
      clearTimeout(timer)
      reject(new YandereError('aborted', 'aborted'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })

const throwIfAborted = signal => {
  if (signal?.aborted) throw new YandereError('aborted', 'aborted')
}

const release = () => {
  const next = waiters.shift()
  if (next) next()
  else active--
}

const acquire = async signal => {
  if (active < MAX_CONCURRENT) {
    active++
    return
  }
  await new Promise(resolve => waiters.push(resolve))
  if (signal?.aborted) {
    release()
    throw new YandereError('aborted', 'aborted')
  }
}

const pace = async signal => {
  const now = Date.now()
  const start = Math.max(now, nextSlot)
  nextSlot = start + MIN_INTERVAL_MS
  if (start > now) await sleep(start - now, signal)
}

const waitForBlock = async signal => {
  const wait = health.blockedUntil - Date.now()
  if (wait <= 0) return
  if (wait > MAX_BLOCK_WAIT_MS) {
    throw new YandereError(`yande.re limitó las peticiones (reintenta en ~${Math.ceil(wait / 1000)}s)`, 'blocked')
  }
  await sleep(wait, signal)
}

const registerBlock = retryAfterHeader => {
  health.blockLevel = Math.min(health.blockLevel + 1, 8)
  const exponential = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** health.blockLevel)
  const retryAfter = Number(retryAfterHeader)
  const serverDelay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 0
  health.blockedUntil = Date.now() + Math.max(exponential, serverDelay)
}

const recordSuccess = () => {
  health.ok++
  health.consecutiveFails = 0
  health.lastStatus = 200
  health.lastError = null
  health.lastOkAt = Date.now()
  health.blockLevel = 0
}

const recordFailure = (status, error) => {
  health.failed++
  health.consecutiveFails++
  health.lastStatus = status || null
  health.lastError = error?.message ? error.message : String(error)
}

const timedFetch = async (url, { timeoutMs, signal, ...init }) => {
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  }
}

export const getJson = async (path, options = {}) => {
  const url = path.startsWith('http') ? path : `${BASE}${path}`
  let lastError = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    throwIfAborted(options.signal)
    await waitForBlock(options.signal)
    await pace(options.signal)
    await acquire(options.signal)

    try {
      const response = await timedFetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
        signal: options.signal
      })

      if (!response.ok) {
        const { status } = response
        recordFailure(status, new Error(`HTTP ${status}`))

        if (THROTTLE_STATUS.has(status)) {
          registerBlock(response.headers.get('retry-after'))
          lastError = new YandereError(`HTTP ${status}`, 'blocked', status)
          continue
        }
        if (status < 500) throw new YandereError(`HTTP ${status}`, 'http', status)

        lastError = new YandereError(`HTTP ${status}`, 'network', status)
        await sleep(500 * attempt, options.signal)
        continue
      }

      const data = await response.json()
      recordSuccess()
      return data
    } catch (error) {
      if (error instanceof YandereError) throw error
      if (options.signal?.aborted) throw new YandereError('aborted', 'aborted')

      recordFailure(undefined, error)
      lastError = new YandereError(error?.message || 'Error de red', 'network')
      await sleep(500 * attempt, options.signal)
    } finally {
      release()
    }
  }

  throw lastError || new YandereError('Error desconocido', 'network')
}

export const getHealth = () => ({
  ok: health.ok,
  failed: health.failed,
  consecutiveFails: health.consecutiveFails,
  lastStatus: health.lastStatus,
  lastError: health.lastError,
  lastOkAt: health.lastOkAt,
  blockedForMs: Math.max(0, health.blockedUntil - Date.now()),
  blockLevel: health.blockLevel,
  inFlight: active,
  queued: waiters.length
})

export const isSafePost = post => {
  if (!post || !ALLOWED_RATINGS.has(post.rating)) return false
  const tags = String(post.tags || '').toLowerCase()
  if (BANNED_TAGS.test(tags)) return false
  if (EXPLICIT_TAGS.test(tags)) return false
  return true
}

const poolCache = new Map()
const poolInflight = new Map()

const prunePools = () => {
  const now = Date.now()
  for (const [key, entry] of poolCache) {
    if (now - entry.at >= POOL_TTL_MS) poolCache.delete(key)
  }
  while (poolCache.size > POOL_MAX_ENTRIES) poolCache.delete(poolCache.keys().next().value)
}

const fetchPool = key => {
  const cached = poolCache.get(key)
  if (cached && Date.now() - cached.at < POOL_TTL_MS) return Promise.resolve(cached.data)

  const pending = poolInflight.get(key)
  if (pending) return pending

  const promise = (async () => {
    try {
      const posts = await getJson(`/post.json?limit=${POOL_LIMIT}&page=1&tags=${encodeURIComponent(key)}`)
      if (!Array.isArray(posts) || !posts.length) return null
      const filtered = posts.filter(isSafePost)
      prunePools()
      poolCache.set(key, { data: filtered, at: Date.now() })
      return filtered.length ? filtered : null
    } catch {
      return null
    } finally {
      poolInflight.delete(key)
    }
  })()

  poolInflight.set(key, promise)
  return promise
}

const resolvePool = async tag => {
  const clean = tag.trim().toLowerCase().replace(/\s+/g, '_')
  const base = clean.includes('_(') ? clean.split('_(')[0] : null

  const [exact, fallback] = await Promise.all([fetchPool(clean), base ? fetchPool(base) : Promise.resolve(null)])

  if (exact && exact.length >= 3) return exact
  if (exact && exact.length) {
    if (!fallback || !fallback.length) return exact
    const seen = new Set(exact.map(post => post.id))
    return [...exact, ...fallback.filter(post => !seen.has(post.id))]
  }
  return fallback || null
}

export const getRandomPost = async (tag, filter) => {
  try {
    if (!tag || typeof tag !== 'string') return null
    const pool = await resolvePool(tag)
    if (!pool || !pool.length) return null

    const usable = pool.filter(post => {
      if (!(post.sample_url || post.jpeg_url || post.file_url)) return false
      if (!filter) return true
      return (post.width || 0) >= (filter.minWidth || 0) && (post.height || 0) >= (filter.minHeight || 0)
    })
    if (!usable.length) return null

    const post = usable[Math.floor(Math.random() * usable.length)]
    return {
      id: post.id,
      url: post.sample_url || post.jpeg_url || post.file_url,
      tags: post.tags || '',
      rating: post.rating || 's',
      width: post.width || 0,
      height: post.height || 0
    }
  } catch {
    return null
  }
}

export const getRandomUrl = async (tag, filter) => (await getRandomPost(tag, filter))?.url ?? null

export const isImageUrl = async (url, signal) => {
  const response = await timedFetch(url, { method: 'HEAD', timeoutMs: 4000, signal })
  const type = response.headers.get('content-type')
  return Boolean(type && type.startsWith('image/'))
}

export const clearCache = () => {
  poolCache.clear()
  poolInflight.clear()
}
