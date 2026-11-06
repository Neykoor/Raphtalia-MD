import { getContentType } from 'baileys'
import config from '../../config.js'
import { main, subs } from '../utils/bots.js'
import { isBotOff } from '../utils/botstate.js'
import { jidNumber, normalizeJid } from '../utils/jid.js'
import log from '../utils/logger.js'
import { printMessage } from '../utils/print.js'
import { registry } from './loader.js'
import { serialize } from './serialize.js'

const parseCommand = body => {
  const text = body.trimStart()
  const prefix = config.prefixes.find(candidate => text.startsWith(candidate))
  if (!prefix) return null

  const rest = text.slice(prefix.length).trim()
  if (!rest) return null

  const [name, ...args] = rest.split(/\s+/)
  return {
    prefix,
    command: name.toLowerCase(),
    args,
    text: rest.slice(name.length).trim()
  }
}

const matches = (participant, ids) =>
  [participant.id, participant.lid, participant.phoneNumber].some(value => value && ids.has(normalizeJid(value)))

const adminFlags = async ctx => {
  const group = await ctx.getGroup()
  if (!group) return { isAdmin: false, isBotAdmin: false }

  const admins = group.participants.filter(item => item.admin || item.isAdmin || item.isSuperAdmin)
  const senderIds = new Set(ctx.senderIds)
  const botIds = new Set([normalizeJid(ctx.sock.user?.id), normalizeJid(ctx.sock.user?.lid)].filter(Boolean))

  return {
    isAdmin: admins.some(item => matches(item, senderIds)),
    isBotAdmin: admins.some(item => matches(item, botIds))
  }
}

const mainIsHere = async ctx => {
  const mainIds = new Set([normalizeJid(main.sock?.user?.id), normalizeJid(main.sock?.user?.lid)].filter(Boolean))
  if (!mainIds.size) return false

  const group = await ctx.getGroup()
  return Boolean(group?.participants.some(item => matches(item, mainIds)))
}

const chatIs = (ctx, ...ids) => ids.filter(Boolean).some(id => jidNumber(id) === jidNumber(ctx.chat))

const senderHasSub = ctx => ctx.senderIds.some(id => subs.get(jidNumber(id))?.online)

const runListeners = async ctx => {
  for (const plugin of registry.listeners) {
    try {
      await plugin.all(ctx)
    } catch (error) {
      log.error(`Error en listener ${plugin.file}:`, error?.message ?? error)
    }
  }
}

export const handleMessage = async (sock, raw) => {
  const jid = raw.key?.remoteJid
  if (!raw.message || !jid) return
  if (jid === 'status@broadcast' || jid.endsWith('@broadcast') || jid.endsWith('@newsletter')) return
  if (!getContentType(raw.message) || raw.message.protocolMessage) return

  const ctx = await serialize(sock, raw)

  if (sock.isJadibot) {
    if (ctx.isGroup && !ctx.fromMe && config.jadibotYieldToMain && (await mainIsHere(ctx))) return
    if (ctx.fromMe && !ctx.isGroup && chatIs(ctx, main.sock?.user?.id, main.sock?.user?.lid)) return
  }

  const silenced = ctx.isGroup && isBotOff(jidNumber(sock.user?.id), ctx.chat)

  if (!silenced) await runListeners(ctx)

  const parsed = ctx.body ? parseCommand(ctx.body) : null
  const plugin = parsed ? registry.commands.get(parsed.command) : null

  if (plugin && sock.isJadibot && ctx.fromMe && plugin.category === 'jadibot' && !chatIs(ctx, sock.user?.id, sock.user?.lid)) return
  if (plugin && !sock.isJadibot && ctx.isGroup && !ctx.fromMe && plugin.category !== 'jadibot' && senderHasSub(ctx)) return

  printMessage(ctx, Boolean(plugin))

  if (!parsed || !plugin) return

  Object.assign(ctx, parsed)

  if (silenced) {
    if (plugin.name !== 'bot') return
    Object.assign(ctx, await adminFlags(ctx))
    if (!ctx.isAdmin && !ctx.isOwner) return
  }

  const { messages } = config

  if (plugin.ownerOnly && !ctx.isOwner) return ctx.reply(messages.owner)
  if (plugin.groupOnly && !ctx.isGroup) return ctx.reply(messages.group)
  if (plugin.privateOnly && ctx.isGroup) return ctx.reply(messages.private)

  if (plugin.adminOnly || plugin.botAdmin) {
    if (!ctx.isGroup) return ctx.reply(messages.group)
    Object.assign(ctx, await adminFlags(ctx))
    if (plugin.adminOnly && !ctx.isAdmin && !ctx.isOwner) return ctx.reply(messages.admin)
    if (plugin.botAdmin && !ctx.isBotAdmin) return ctx.reply(messages.botAdmin)
  }

  try {
    await plugin.run(ctx)
  } catch (error) {
    log.error(`Error en el comando ${plugin.name}:`, error?.message ?? error)
    await ctx.reply(messages.error).catch(() => {})
  }
    }
