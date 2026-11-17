import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../../config.js'
import { jidNumber } from './jid.js'
import { getUser as getProfile } from './profiles.js'

const file = fileURLToPath(new URL('../../data/gacha.json', import.meta.url))
const saveDelayMs = 3000

export const ROLL_COOLDOWN_MS = 15 * 60 * 1000
export const CLAIM_COOLDOWN_MS = 30 * 60 * 1000
export const VOTE_COOLDOWN_MS = 60 * 60 * 1000
export const SALE_TTL_MS = 3 * 24 * 60 * 60 * 1000
const VOTE_DAILY_CAP = 900
const ROLL_RESERVED_MS = 20000
const ROLL_EXPIRES_MS = 60000
const ROLL_KEEP_MS = 10 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const TAG_TTL_MS = { character: 30 * DAY_MS, other: 30 * DAY_MS, no_image: 3 * DAY_MS }

const SECTIONS = [
  'characters',
  'owned',
  'users',
  'market',
  'rolls',
  'votes',
  'voteCooldowns',
  'claimMessages',
  'tagCache',
  'seriesRuns',
  'haremRequests'
]

let store = null
let timer = null
let cache = null

const load = () => {
  if (store) return store
  try {
    store = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  } catch {
    store = {}
  }
  if (!store || typeof store !== 'object') store = {}
  for (const section of SECTIONS) {
    if (!store[section] || typeof store[section] !== 'object') store[section] = {}
  }
  return store
}

export const flush = () => {
  clearTimeout(timer)
  timer = null
  try {
    mkdirSync(dirname(file), { recursive: true })
    const temp = `${file}.tmp`
    writeFileSync(temp, JSON.stringify(load()))
    renameSync(temp, file)
  } catch (error) {
    console.error('No se pudo guardar gacha.json:', error.message)
  }
}

export const save = () => {
  if (timer) return
  timer = setTimeout(flush, saveDelayMs)
  timer.unref?.()
}

process.on('exit', () => {
  if (timer) flush()
})

const invalidate = () => {
  cache = null
}

export const currency = config.currency || 'Yenes'

export const money = amount => `¥${Math.floor(Number(amount) || 0).toLocaleString()} ${currency}`

export const formatTime = ms => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const parts = []
  if (d) parts.push(`${d} día${d !== 1 ? 's' : ''}`)
  if (h) parts.push(`${h} hora${h !== 1 ? 's' : ''}`)
  if (m) parts.push(`${m} minuto${m !== 1 ? 's' : ''}`)
  if (s || !parts.length) parts.push(`${s} segundo${s !== 1 ? 's' : ''}`)
  return parts.join(' ')
}

export const react = (ctx, emoji) => ctx.react(emoji).catch(() => null)

export const slugify = tag =>
  String(tag || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

export const normalizeCharacterKey = name =>
  String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .sort()
    .join(' ')

export const randomValue = () => Math.floor(Math.random() * (8000 - 3000 + 1)) + 3000

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const catalog = () => {
  if (cache) return cache
  const list = Object.values(load().characters).sort((a, b) => b.createdAt - a.createdAt)
  const bySeries = new Map()
  for (const character of list) {
    if (!bySeries.has(character.series)) bySeries.set(character.series, [])
    bySeries.get(character.series).push(character)
  }
  for (const group of bySeries.values()) group.sort((a, b) => b.value - a.value)
  cache = { list, lowerNames: list.map(c => c.name.toLowerCase()), byValue: null, bySeries }
  return cache
}

export const addCharacter = data => {
  const id = slugify(data.tag)
  const db = load()
  if (!id || db.characters[id]) return { inserted: false, id }
  db.characters[id] = {
    id,
    name: data.name,
    series: data.series,
    gender: data.gender,
    tag: data.tag,
    value: data.value,
    createdAt: Date.now()
  }
  invalidate()
  save()
  return { inserted: true, id }
}

export const getCharacterById = id => load().characters[id] || null

export const getCharacterByTag = tag => load().characters[slugify(tag)] || null

export const characterExists = tag => Boolean(getCharacterByTag(tag))

export const countCharacters = () => catalog().list.length

export const getAllCharacters = () => catalog().list

export const getCharactersByValue = () => {
  const current = catalog()
  if (!current.byValue) current.byValue = [...current.list].sort((a, b) => b.value - a.value)
  return current.byValue
}

export const findCharacterByQuery = query => {
  const q = String(query || '').toLowerCase().trim()
  if (!q) return null

  const byId = load().characters[q] || load().characters[slugify(q)]
  if (byId) return byId

  const { list, lowerNames } = catalog()
  const words = q.split(/\s+/).filter(Boolean)
  let partial = null
  let byWord = null

  for (let i = 0; i < list.length; i++) {
    const name = lowerNames[i]
    if (name === q) return list[i]
    if (partial) continue
    if (name.includes(q)) {
      partial = list[i]
      continue
    }
    if (!byWord && words.some(word => name.includes(word))) byWord = list[i]
  }

  return partial || byWord
}

export const findCharacterExact = query => {
  const q = String(query || '').toLowerCase().trim()
  if (!q) return null
  const byId = load().characters[q] || load().characters[slugify(q)]
  if (byId) return byId
  const { list, lowerNames } = catalog()
  const index = lowerNames.indexOf(q)
  return index === -1 ? null : list[index]
}

export const getRandomCharacter = () => {
  const { list } = catalog()
  return list.length ? list[Math.floor(Math.random() * list.length)] : null
}

export const getSeriesList = () =>
  [...catalog().bySeries.entries()]
    .map(([series, characters]) => ({ series, total: characters.length }))
    .sort((a, b) => a.series.localeCompare(b.series, 'es', { sensitivity: 'base' }))

export const findSeries = query => {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return null
  const all = [...catalog().bySeries.keys()]
  const exact = all.find(series => series.toLowerCase() === q)
  if (exact) return exact
  const contains = all.find(series => series.toLowerCase().includes(q))
  if (contains) return contains
  const words = q.split(/\s+/).filter(Boolean)
  return all.find(series => words.some(word => series.toLowerCase().includes(word))) || null
}

export const getCharactersBySeries = series => catalog().bySeries.get(series) || []

export const getSeriesNameKeys = series => new Set(getCharactersBySeries(series).map(c => normalizeCharacterKey(c.name)))

export const getCachedTagKind = tag => {
  const entry = load().tagCache[tag]
  if (!entry) return null
  const ttl = TAG_TTL_MS[entry.kind]
  if (!ttl || Date.now() - entry.checkedAt > ttl) return null
  return entry.kind
}

export const setCachedTagKind = (tag, kind) => {
  load().tagCache[tag] = { kind, checkedAt: Date.now() }
  save()
}

export const pruneTagCache = () => {
  const db = load()
  const limit = Date.now() - TAG_TTL_MS.other
  let removed = false
  for (const [tag, entry] of Object.entries(db.tagCache)) {
    if (entry.checkedAt < limit) {
      delete db.tagCache[tag]
      removed = true
    }
  }
  if (removed) save()
}

export const recordSeriesRun = (seriesTag, seriesName, posts, added) => {
  load().seriesRuns[seriesTag] = { seriesTag, seriesName, posts, added, processedAt: Date.now() }
  save()
}

export const getSeriesRun = seriesTag => load().seriesRuns[seriesTag] || null

export const getRecentSeriesTags = withinMs => {
  const limit = Date.now() - withinMs
  return new Set(
    Object.values(load().seriesRuns)
      .filter(run => run.processedAt >= limit)
      .map(run => run.seriesTag)
  )
}

const gachaUser = id => {
  const { users } = load()
  if (!users[id]) users[id] = { jid: '', lastRoll: 0, lastClaim: 0, primary: null }
  return users[id]
}

export const touchUser = (id, jid) => {
  if (!id) return
  const user = gachaUser(id)
  if (jid && user.jid !== jid) {
    user.jid = jid
    save()
  }
}

export const mentionJid = id => load().users[id]?.jid || `${id}@s.whatsapp.net`

export const displayName = id => String(getProfile(id)?.name || '').trim() || String(id)

const remaining = (last, gap) => {
  const ms = last + gap - Date.now()
  return { ready: ms <= 0, remainingMs: Math.max(ms, 0) }
}

export const checkRollCooldown = id => remaining(gachaUser(id).lastRoll, ROLL_COOLDOWN_MS)

export const setRollCooldown = (id, timestamp) => {
  gachaUser(id).lastRoll = timestamp
  save()
}

export const checkClaimCooldown = id => remaining(gachaUser(id).lastClaim, CLAIM_COOLDOWN_MS)

export const setClaimCooldown = (id, timestamp) => {
  gachaUser(id).lastClaim = timestamp
  save()
}

export const getOwnership = characterId => load().owned[characterId] || null

export const getOwner = characterId => getOwnership(characterId)?.owner ?? null

export const claimCharacter = (characterId, id, timestamp) => {
  const db = load()
  if (db.owned[characterId]) return false
  db.owned[characterId] = { owner: id, claimedAt: timestamp }
  save()
  return true
}

const clearPrimaryByCharacter = characterId => {
  for (const user of Object.values(load().users)) {
    if (user.primary === characterId) user.primary = null
  }
}

export const transferCharacter = (characterId, id, timestamp) => {
  const db = load()
  clearPrimaryByCharacter(characterId)
  delete db.market[characterId]
  db.owned[characterId] = { owner: id, claimedAt: timestamp }
  save()
}

export const releaseCharacter = characterId => {
  const db = load()
  clearPrimaryByCharacter(characterId)
  delete db.market[characterId]
  delete db.owned[characterId]
  save()
}

export const getUserCharacters = id => {
  const db = load()
  const result = []
  for (const [characterId, entry] of Object.entries(db.owned)) {
    if (entry.owner !== id) continue
    const character = db.characters[characterId]
    if (character) result.push({ ...character, claimedAt: entry.claimedAt })
  }
  return result.sort((a, b) => b.value - a.value)
}

export const getPrimaryCharacter = id => gachaUser(id).primary || null

export const setPrimaryCharacter = (id, characterId) => {
  gachaUser(id).primary = characterId
  save()
}

export const clearPrimaryCharacter = id => {
  gachaUser(id).primary = null
  save()
}

export const getClaimedCount = () => Object.keys(load().owned).length

export const getPrimaryCounts = () => {
  const counts = new Map()
  for (const user of Object.values(load().users)) {
    if (user.primary) counts.set(user.primary, (counts.get(user.primary) || 0) + 1)
  }
  return [...counts.entries()].map(([characterId, total]) => ({ characterId, total })).sort((a, b) => b.total - a.total)
}

export const resetAllClaims = () => {
  const db = load()
  const summary = { claims: Object.keys(db.owned).length, sales: Object.keys(db.market).length }
  db.owned = {}
  db.market = {}
  for (const user of Object.values(db.users)) {
    user.primary = null
    user.lastRoll = 0
    user.lastClaim = 0
  }
  save()
  return summary
}

export const createBackup = () => {
  const dir = join(dirname(file), 'backups')
  mkdirSync(dir, { recursive: true })
  const target = join(dir, `gacha-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(target, JSON.stringify(load()))
  return target
}

export const collectHarem = ids => {
  const seen = new Map()
  for (const id of ids) {
    for (const character of getUserCharacters(id)) seen.set(character.id, character)
  }
  return [...seen.values()].sort((a, b) => b.value - a.value)
}

export const moveHarem = (oldIds, newId) => {
  const sources = oldIds.filter(id => id && id !== newId)
  const harem = collectHarem(sources)
  if (!harem.length) return { moved: [], totalValue: 0, favoriteKept: false }

  const db = load()
  const movedSet = new Set(harem.map(c => c.id))
  let oldFavorite = null
  for (const id of sources) {
    const user = db.users[id]
    if (!oldFavorite && user?.primary) oldFavorite = user.primary
  }
  const newHadFavorite = Boolean(db.users[newId]?.primary)

  const now = Date.now()
  for (const character of harem) transferCharacter(character.id, newId, character.claimedAt || now)

  let favoriteKept = false
  if (oldFavorite && movedSet.has(oldFavorite) && !newHadFavorite) {
    setPrimaryCharacter(newId, oldFavorite)
    favoriteKept = true
  }

  const totalValue = harem.reduce((sum, c) => sum + (Number(c.value) || 0), 0)
  return { moved: harem, totalValue, favoriteKept }
}

export const createHaremRequest = ({ oldJid, oldIds, newId, chatId }) => {
  const db = load()
  const id = Object.values(db.haremRequests).reduce((max, r) => Math.max(max, r.id), 0) + 1
  db.haremRequests[id] = {
    id,
    oldJid,
    oldIds,
    newId,
    chatId,
    status: 'pending',
    createdAt: Date.now(),
    resolvedAt: null,
    resolvedBy: null,
    movedCount: null,
    movedIds: null,
    note: null
  }
  save()
  return db.haremRequests[id]
}

export const getHaremRequest = id => load().haremRequests[id] || null

export const getPendingHaremRequests = (limit = 30) =>
  Object.values(load().haremRequests)
    .filter(r => r.status === 'pending')
    .sort((a, b) => a.id - b.id)
    .slice(0, limit)

export const getPendingHaremRequestByNew = newId =>
  Object.values(load().haremRequests).find(r => r.status === 'pending' && r.newId === newId) || null

export const resolveHaremRequest = (id, status, { resolvedBy, movedCount = null, movedIds = null, note = null }) => {
  const request = load().haremRequests[id]
  if (!request || request.status !== 'pending') return null
  Object.assign(request, { status, resolvedAt: Date.now(), resolvedBy, movedCount, movedIds, note })
  save()
  return request
}

export const recordRoll = ({ messageId, chatId, characterId, name, value, rolledBy }) => {
  const db = load()
  const now = Date.now()
  for (const [key, roll] of Object.entries(db.rolls)) {
    if (now - roll.expiresAt > ROLL_KEEP_MS) delete db.rolls[key]
  }
  db.rolls[messageId] = {
    messageId,
    chatId,
    characterId,
    name,
    value,
    rolledBy,
    reservedUntil: now + ROLL_RESERVED_MS,
    expiresAt: now + ROLL_EXPIRES_MS,
    createdAt: now
  }
  save()
}

export const getRoll = messageId => load().rolls[messageId] || null

const todayKey = timestamp => new Date(timestamp).toISOString().slice(0, 10)

const voteState = characterId => {
  const { votes } = load()
  if (!votes[characterId]) votes[characterId] = { votes: 0, lastVotedAt: 0, voteDay: '', dayIncrement: 0 }
  return votes[characterId]
}

export const getCharacterVoteStats = characterId => voteState(characterId)

export const checkVoteCooldown = id => remaining(load().voteCooldowns[id] || 0, VOTE_COOLDOWN_MS)

export const checkCharacterVoteCooldown = characterId => remaining(voteState(characterId).lastVotedAt, VOTE_COOLDOWN_MS)

export const voteForCharacter = (characterId, id, timestamp) => {
  const db = load()
  const character = db.characters[characterId]
  if (!character) return null

  const state = voteState(characterId)
  const today = todayKey(timestamp)
  const dayIncrement = state.voteDay === today ? state.dayIncrement : 0
  const remainingCap = Math.max(VOTE_DAILY_CAP - dayIncrement, 0)
  if (remainingCap <= 0) return null

  const increment = Math.min(remainingCap, randomInt(50, 250))
  character.value += increment
  invalidate()

  state.votes += 1
  state.lastVotedAt = timestamp
  state.voteDay = today
  state.dayIncrement = dayIncrement + increment
  db.voteCooldowns[id] = timestamp
  save()

  return { increment, newValue: character.value, votes: state.votes }
}

export const getClaimMessage = id => load().claimMessages[id] || null

export const setClaimMessage = (id, template) => {
  load().claimMessages[id] = template
  save()
}

export const deleteClaimMessage = id => {
  delete load().claimMessages[id]
  save()
}

export const renderClaimMessage = (template, params) =>
  template.split('€user').join(params.user).split('€character').join(params.character)

export const createSale = (characterId, seller, price, timestamp, chat = null) => {
  load().market[characterId] = { characterId, seller, price, listedAt: timestamp, chat }
  save()
}

export const getSale = characterId => load().market[characterId] || null

export const deleteSale = characterId => {
  if (load().market[characterId]) {
    delete load().market[characterId]
    save()
  }
}

const withCharacter = sale => {
  const character = load().characters[sale.characterId]
  return character
    ? { ...sale, name: character.name, series: character.series, gender: character.gender, tag: character.tag, value: character.value }
    : null
}

export const getSaleByQuery = query => {
  const character = findCharacterExact(query)
  if (!character) return null
  const sale = getSale(character.id)
  return sale ? withCharacter(sale) : null
}

export const getSales = () =>
  Object.values(load().market)
    .map(withCharacter)
    .filter(Boolean)
    .sort((a, b) => b.listedAt - a.listedAt)

export const findOwned = (id, query) => {
  const owned = getUserCharacters(id)
  const q = String(query || '').trim().toLowerCase()
  if (!q) return { owned, matches: [] }
  const byId = owned.filter(c => c.id === q)
  if (byId.length) return { owned, matches: byId }
  const exact = owned.filter(c => c.name.toLowerCase() === q)
  if (exact.length) return { owned, matches: exact }
  return { owned, matches: owned.filter(c => c.name.toLowerCase().includes(q)) }
}

export const ambiguousText = (matches, query, prefix, command) => {
  const list = matches.map(c => `» *${c.name}* \`${c.id}\``).join('\n')
  return `ꕥ Tienes *${matches.length}* personajes que coinciden con *${query}*. Usa el ID para elegir uno:\n\n${list}\n\n✐ Ejemplo: *${prefix}${command} ${matches[0].id}*`
}

export const target = async ctx => {
  const raw = ctx.mentions[0] || ctx.quoted?.sender
  if (!raw) return null
  const jid = await ctx.resolve(raw)
  return { jid, id: jidNumber(jid), raw }
}

export const define = plugin => {
  const { run } = plugin
  return {
    ...plugin,
    run: ctx => {
      touchUser(ctx.senderNumber, ctx.sender)
      return run(ctx)
    }
  }
}
