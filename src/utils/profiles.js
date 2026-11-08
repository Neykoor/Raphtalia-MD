import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jidNumber } from './jid.js'

const file = fileURLToPath(new URL('../../data/profiles.json', import.meta.url))
const saveDelayMs = 5000
const MULTIPLIER = 2
const GROWTH = Math.pow(Math.PI / Math.E, 1.618) * Math.E * 1.5
const PROPOSAL_TTL_MS = 120000

export const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const load = () => {
  try {
    if (!existsSync(file)) return { users: {}, afk: {} }
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return {
      users: parsed?.users && typeof parsed.users === 'object' ? parsed.users : {},
      afk: parsed?.afk && typeof parsed.afk === 'object' ? parsed.afk : {}
    }
  } catch {
    return { users: {}, afk: {} }
  }
}

const data = load()
let timer = null

const flush = () => {
  clearTimeout(timer)
  timer = null
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify(data))
  renameSync(temp, file)
}

const schedule = () => {
  if (timer) return
  timer = setTimeout(() => {
    try {
      flush()
    } catch {
      timer = null
    }
  }, saveDelayMs)
  timer.unref?.()
}

process.on('exit', () => {
  if (!timer) return
  try {
    flush()
  } catch {}
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => process.exit(0))
}

export const normalizeText = value =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()

export const xpRange = level => {
  const base = Math.max(0, Math.floor(level))
  const min = base === 0 ? 0 : Math.round(Math.pow(base, GROWTH) * MULTIPLIER) + 1
  const max = Math.round(Math.pow(base + 1, GROWTH) * MULTIPLIER)
  return { min, max, xp: max - min }
}

export const levelFor = exp => {
  if (!(exp > 0)) return 0
  let level = 0
  while (xpRange(level + 1).min <= exp) level += 1
  return level
}

export const progressOf = user => {
  const { min, xp } = xpRange(user.level || 0)
  const progress = Math.max(0, (user.exp || 0) - min)
  return { progress, needed: xp, percent: xp > 0 ? Math.min(100, Math.floor((progress / xp) * 100)) : 0 }
}

const blank = name => ({
  name: name || '',
  birth: '',
  genre: '',
  hobby: '',
  desc: '',
  marry: '',
  exp: 0,
  level: 0,
  commands: 0
})

export const getUser = number => data.users[number] ?? null

export const ensureUser = (number, name) => {
  let user = data.users[number]

  if (!user) {
    user = blank(name)
    data.users[number] = user
    schedule()
  } else if (name && user.name !== name) {
    user.name = name
    schedule()
  }

  return user
}

export const setField = (number, field, value) => {
  const user = ensureUser(number)
  user[field] = value
  schedule()
}

export const addActivity = (number, name, exp) => {
  const user = ensureUser(number, name)
  user.exp += exp
  user.commands += 1
  const level = levelFor(user.exp)
  const leveled = level > user.level
  user.level = Math.max(user.level, level)
  schedule()
  return { user, leveled }
}

export const allUsers = () => Object.entries(data.users).map(([number, user]) => ({ number, ...user }))

export const rankOf = number => {
  const sorted = allUsers().sort((a, b) => b.exp - a.exp || b.commands - a.commands)
  const index = sorted.findIndex(user => user.number === number)
  return index === -1 ? 0 : index + 1
}

export const displayName = (user, number) => user?.name || number

export const inflect = (genre, female, male, neutral) => (genre === 'Mujer' ? female : genre === 'Hombre' ? male : neutral)

export const targetRaw = ctx => ctx.mentions[0] || ctx.quoted?.sender || null

export const whoIs = async (ctx, raw) => {
  if (!raw) return { jid: ctx.sender, number: ctx.senderNumber, own: true }
  const jid = await ctx.resolve(raw)
  return { jid, number: jidNumber(jid), own: jidNumber(jid) === ctx.senderNumber }
}

export const setAfk = (chat, number, reason) => {
  data.afk[chat] ??= {}
  data.afk[chat][number] = { since: Date.now(), reason: reason || '' }
  schedule()
}

export const getAfk = (chat, number) => data.afk[chat]?.[number] ?? null

export const clearAfk = (chat, number) => {
  const users = data.afk[chat]
  if (!users?.[number]) return
  delete users[number]
  if (!Object.keys(users).length) delete data.afk[chat]
  schedule()
}

const proposals = new Map()

const purgeProposals = () => {
  const now = Date.now()
  for (const [key, expires] of proposals) if (expires <= now) proposals.delete(key)
}

export const propose = (from, to) => {
  purgeProposals()
  proposals.set(`${from}>${to}`, Date.now() + PROPOSAL_TTL_MS)
}

export const takeProposal = (from, to) => {
  purgeProposals()
  return proposals.delete(`${from}>${to}`)
}

export const formatDuration = ms => {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return 'desconocido'
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  const seconds = Math.floor((ms % 60000) / 1000)
  const parts = []
  if (hours) parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`)
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`)
  if (seconds || (!hours && !minutes)) parts.push(`${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`)
  return parts.join(' ')
}
