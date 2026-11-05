import config from '../../config.js'
import { makeCache } from './cache.js'

export const groupCache = makeCache(config.groupCacheSize, config.groupCacheTtlMs)

export const getGroupMetadata = async (sock, jid) => {
  const cached = groupCache.get(jid)
  if (cached) return cached

  try {
    const metadata = await sock.groupMetadata(jid)
    groupCache.set(jid, metadata)
    return metadata
  } catch {
    return null
  }
}

export const bindGroupCache = sock => {
  sock.ev.on('groups.upsert', groups => {
    for (const group of groups) groupCache.set(group.id, group)
  })

  sock.ev.on('groups.update', updates => {
    for (const update of updates) {
      const current = update.id && groupCache.get(update.id)
      if (current) groupCache.set(update.id, { ...current, ...update })
    }
  })

  sock.ev.on('group-participants.update', ({ id }) => {
    groupCache.del(id)
  })
}
