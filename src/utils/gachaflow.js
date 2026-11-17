import config from '../../config.js'
import { isLidJid, jidNumber } from './jid.js'

const TRADE_TTL_MS = 60000
const GIVEAWAY_TTL_MS = 60000

const trades = new Map()
const giveaways = new Map()

const flowKey = (chatId, id) => `${chatId}:${id}`

export const idOf = jidNumber

export const findTradeByChat = chatId => {
  for (const trade of trades.values()) {
    if (trade.chatId === chatId) return trade
  }
  return null
}

export const addTrade = trade => {
  const key = flowKey(trade.chatId, trade.to)
  const timeout = setTimeout(() => trades.delete(key), TRADE_TTL_MS)
  timeout.unref?.()
  trades.set(key, { ...trade, key, timeout })
}

export const removeTrade = trade => {
  clearTimeout(trade.timeout)
  trades.delete(trade.key)
}

export const getGiveaway = (chatId, id) => giveaways.get(flowKey(chatId, id)) || null

export const addGiveaway = entry => {
  const key = flowKey(entry.chatId, entry.from)
  const timeout = setTimeout(() => giveaways.delete(key), GIVEAWAY_TTL_MS)
  timeout.unref?.()
  giveaways.set(key, { ...entry, key, timeout })
}

export const removeGiveaway = entry => {
  clearTimeout(entry.timeout)
  giveaways.delete(entry.key)
}

export const parseAccount = args => {
  for (const raw of args) {
    const token = String(raw).trim()
    const lidMatch = token.match(/^(\d{5,})(?::\d+)?@lid$/i)
    if (lidMatch) return `${lidMatch[1]}@lid`
    const pnMatch = token.match(/^(\d{7,15})(?::\d+)?@s\.whatsapp\.net$/i)
    if (pnMatch) return `${pnMatch[1]}@s.whatsapp.net`
  }
  const digits = args.join('').replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return null
  return `${digits}@s.whatsapp.net`
}

const toJid = (value, server) => {
  if (!value) return null
  const text = String(value)
  return text.includes('@') ? text : `${text}@${server}`
}

export const accountIds = async (sock, ...jids) => {
  const mapping = sock.signalRepository?.lidMapping
  const ids = new Set()
  for (const jid of jids.filter(Boolean)) {
    const base = jidNumber(jid)
    if (base) ids.add(base)
    try {
      if (isLidJid(jid)) {
        const pn = toJid(await mapping?.getPNForLID?.(jid), 's.whatsapp.net')
        if (pn) ids.add(jidNumber(pn))
      } else if (jid.endsWith('@s.whatsapp.net')) {
        const lid = toJid(await mapping?.getLIDForPN?.(jid), 'lid')
        if (lid) ids.add(jidNumber(lid))
      }
    } catch {}
  }
  return [...ids]
}

export const unique = list => [...new Set(list.filter(Boolean))]

const ownerTargets = () =>
  unique(config.owners.map(owner => String(owner).replace(/\D/g, ''))).map(digits =>
    digits.length >= 14 ? `${digits}@lid` : `${digits}@s.whatsapp.net`
  )

export const notifyOwners = async (sock, text, mentions = []) => {
  let delivered = 0
  for (const jid of ownerTargets()) {
    try {
      await sock.sendMessage(jid, { text, mentions })
      delivered++
    } catch (error) {
      console.error('No pude avisar al owner de la solicitud de harem:', error.message)
    }
  }
  return delivered
}

export const sumValue = list => list.reduce((sum, c) => sum + (Number(c.value) || 0), 0)

export const fmtDate = ms => new Date(ms).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })

export const parseId = raw => {
  if (!raw) return null
  const n = Number(String(raw).replace(/^#/, ''))
  return Number.isInteger(n) && n > 0 ? n : null
}
