import { normalizeMessageContent } from 'baileys'
import config from '../../config.js'
import { makeCache } from '../utils/cache.js'
import { getGroupMetadata } from '../utils/groups.js'
import { isGroupJid, isLidJid, jidNumber, normalizeJid } from '../utils/jid.js'

const bodyOf = content =>
  content.conversation ||
  content.extendedTextMessage?.text ||
  content.imageMessage?.caption ||
  content.videoMessage?.caption ||
  content.documentMessage?.caption ||
  content.buttonsResponseMessage?.selectedButtonId ||
  content.listResponseMessage?.singleSelectReply?.selectedRowId ||
  content.templateButtonReplyMessage?.selectedId ||
  ''

const contextOf = content => {
  const type = Object.keys(content).find(key => key.endsWith('Message') && content[key]?.contextInfo)
  return type ? content[type].contextInfo : undefined
}

const pnCache = makeCache(2000, 3600000)

const resolvePn = async (sock, jid) => {
  if (!isLidJid(jid)) return jid

  const cached = pnCache.get(jid)
  if (cached) return cached

  try {
    const mapping = sock.signalRepository?.lidMapping
    const found = (await mapping?.getPNForLID?.(jid)) || null
    if (!found) return jid
    const value = String(found)
    const pn = normalizeJid(value.includes('@') ? value : `${value}@s.whatsapp.net`)
    pnCache.set(jid, pn)
    return pn
  } catch {
    return jid
  }
}

export const serialize = async (sock, raw) => {
  const key = raw.key
  const chat = isGroupJid(key.remoteJid) ? key.remoteJid : key.remoteJidAlt || key.remoteJid
  const isGroup = isGroupJid(chat)
  const fromMe = Boolean(key.fromMe)
  const botJid = normalizeJid(sock.user?.id)

  const senderRaw = fromMe ? botJid : normalizeJid(isGroup ? key.participant : key.remoteJid)
  const senderAlt = fromMe ? botJid : normalizeJid(isGroup ? key.participantAlt : key.remoteJidAlt)
  const resolved = new Map()
  const resolve = jid => {
    const normalized = normalizeJid(jid)
    if (!normalized) return Promise.resolve('')
    if (!resolved.has(normalized)) resolved.set(normalized, resolvePn(sock, normalized))
    return resolved.get(normalized)
  }

  const sender = senderAlt || (await resolve(senderRaw))
  const botLid = fromMe ? normalizeJid(sock.user?.lid) : ''
  const senderIds = [...new Set([senderRaw, senderAlt, sender, botLid].filter(Boolean))]

  const content = normalizeMessageContent(raw.message) || {}
  const info = contextOf(content)
  const quotedContent = info?.quotedMessage ? normalizeMessageContent(info.quotedMessage) : undefined

  const quoted = quotedContent
    ? {
        id: info.stanzaId,
        sender: normalizeJid(info.participant),
        message: quotedContent,
        text: bodyOf(quotedContent)
      }
    : null

  const send = (payload, options) =>
    sock.sendMessage(chat, typeof payload === 'string' ? { text: payload } : payload, options)

  const reply = (payload, options) => send(payload, { quoted: raw, ...options })

  const react = text => sock.sendMessage(chat, { react: { text, key } })

  const getGroup = () => (isGroup ? getGroupMetadata(sock, chat) : Promise.resolve(null))

  const senderNumbers = senderIds.map(jidNumber)
  const isOwner = (fromMe && !sock.isJadibot) || senderNumbers.some(number => config.owners.includes(number))

  return {
    sock,
    raw,
    key,
    id: key.id,
    chat,
    isGroup,
    fromMe,
    sender,
    senderRaw,
    senderIds,
    senderNumber: jidNumber(sender),
    pushName: raw.pushName || '',
    body: bodyOf(content),
    content,
    quoted,
    mentions: (info?.mentionedJid || []).map(normalizeJid),
    timestamp: Number(raw.messageTimestamp?.toNumber?.() ?? raw.messageTimestamp) || 0,
    isOwner,
    isAdmin: false,
    isBotAdmin: false,
    send,
    reply,
    react,
    getGroup,
    resolve
  }
}
