import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../../config.js'
import { isLidJid, jidNumber, normalizeJid } from './jid.js'

const file = fileURLToPath(new URL('../../data/warns.json', import.meta.url))
const defaultLimit = 3

const load = () => {
  try {
    if (!existsSync(file)) return {}
    const data = JSON.parse(readFileSync(file, 'utf8'))
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

const chats = load()

const save = () => {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify(chats))
  renameSync(temp, file)
}

const ensure = chat => {
  chats[chat] ??= { limit: defaultLimit, kick: false, users: {} }
  chats[chat].users ??= {}
  return chats[chat]
}

const find = (users, keys) => keys.find(key => users[key]?.length) ?? keys[0]

const idsOf = participant => [participant.id, participant.lid, participant.phoneNumber].filter(Boolean)

export const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

export const formatDate = at =>
  new Date(at).toLocaleString('es-CO', {
    timeZone: config.timezone || 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

export const resolveTarget = async ctx => {
  const raw = ctx.mentions[0] || ctx.quoted?.sender
  if (!raw) return null

  const target = normalizeJid(raw)
  const group = await ctx.getGroup()
  const participant = group?.participants.find(item => idsOf(item).some(id => normalizeJid(id) === target)) ?? null
  const ids = participant ? idsOf(participant) : [target]
  const phone = ids.find(id => !isLidJid(normalizeJid(id)))
  const keys = [...new Set([...(phone ? [phone] : []), ...ids].map(jidNumber))]
  const mention = participant?.id || target

  return { participant, mention, keys, tag: `@${jidNumber(mention)}` }
}

export const authorOf = async ctx => {
  const group = await ctx.getGroup()
  const senderIds = new Set(ctx.senderIds)
  const author = group?.participants.find(item => idsOf(item).some(id => senderIds.has(normalizeJid(id))))
  return author?.id || ctx.sender
}

export const getSettings = chat => {
  const data = chats[chat]
  return { limit: data?.limit || defaultLimit, kick: Boolean(data?.kick) }
}

export const setSettings = (chat, limit, kick) => {
  const data = ensure(chat)
  data.limit = limit
  data.kick = kick
  save()
}

export const getWarns = (chat, keys) => {
  const users = chats[chat]?.users ?? {}
  return [...(users[find(users, keys)] ?? [])]
}

export const addWarn = (chat, keys, entry) => {
  const data = ensure(chat)
  const key = find(data.users, keys)
  const list = (data.users[key] ??= [])
  list.unshift(entry)
  save()
  return [...list]
}

export const removeWarn = (chat, keys, index) => {
  const data = ensure(chat)
  const key = find(data.users, keys)
  const list = data.users[key] ?? []

  if (index === 'all') list.length = 0
  else list.splice(list.length - index, 1)

  if (!list.length) delete data.users[key]
  save()
  return [...list]
}

export const clearWarns = (chat, keys) => removeWarn(chat, keys, 'all')
