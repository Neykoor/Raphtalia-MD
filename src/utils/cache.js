import config from '../../config.js'

export const makeCache = (limit, ttlMs = 0) => {
  const map = new Map()

  const get = key => {
    const entry = map.get(key)
    if (!entry) return undefined
    if (entry.expires && entry.expires <= Date.now()) {
      map.delete(key)
      return undefined
    }
    return entry.value
  }

  const set = (key, value) => {
    map.delete(key)
    map.set(key, { value, expires: ttlMs ? Date.now() + ttlMs : 0 })
    if (map.size > limit) map.delete(map.keys().next().value)
    return true
  }

  return {
    get,
    set,
    del: key => map.delete(key),
    flushAll: () => map.clear()
  }
}

const remoteKey = /^[a-z]+:(https?|data):/i

const makeMediaCache = (limit, ttlMs) => {
  const cache = makeCache(limit, ttlMs)

  return {
    ...cache,
    get: key => (remoteKey.test(String(key)) ? undefined : cache.get(key)),
    set: (key, value) => (remoteKey.test(String(key)) ? false : cache.set(key, value))
  }
}

export const mediaCache = makeMediaCache(20, config.mediaCacheTtlMs)
