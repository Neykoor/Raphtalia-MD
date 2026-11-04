import { jidNormalizedUser } from 'baileys'

export const normalizeJid = jid => (jid ? jidNormalizedUser(jid) : '')

export const jidNumber = jid => (jid ? jid.split('@')[0].split(':')[0] : '')

export const isGroupJid = jid => typeof jid === 'string' && jid.endsWith('@g.us')

export const isLidJid = jid => typeof jid === 'string' && jid.endsWith('@lid')
