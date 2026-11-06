import { existsSync, readdirSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState
} from 'baileys'
import config from '../../config.js'
import { makeCache, mediaCache } from '../utils/cache.js'
import { bindGroupCache, groupCache } from '../utils/groups.js'
import log, { silent } from '../utils/logger.js'
import { handleMessage } from './handler.js'

const subs = new Map()

const maxDelayMs = 30000
const stableAfterMs = 60000
const pairingTimeoutMs = 180000
const pairingDelayMs = 3000

const sessionPath = number => join(config.jadibotDir, number)

const nextDelay = sub => {
  const delay = Math.min(config.reconnectDelayMs * 2 ** sub.reconnects, maxDelayMs)
  sub.reconnects += 1
  return delay
}

const drop = async sub => {
  sub.stopped = true
  clearTimeout(sub.timer)
  clearTimeout(sub.pairTimer)
  if (subs.get(sub.number) === sub) subs.delete(sub.number)
  try {
    sub.sock?.end(undefined)
  } catch {}
  await rm(sessionPath(sub.number), { recursive: true, force: true })
}

const schedule = (sub, hooks, delay) => {
  sub.timer = setTimeout(() => {
    if (sub.stopped) return
    open(sub, hooks).catch(error => {
      log.error(`Error al reconectar el jadibot ${sub.number}:`, error?.message ?? error)
      if (!sub.stopped) schedule(sub, hooks, nextDelay(sub))
    })
  }, delay)
}

const welcome = sock => {
  const prefix = config.prefixes[0]
  const text = [
    `*${config.botName} - Jadibot*`,
    'Tu sub-bot ya está conectado ✓',
    `Usa ${prefix}menu para ver los comandos`,
    `Usa ${prefix}stopjadibot para desvincularlo`
  ].join('\n')
  return sock.sendMessage(jidNormalizedUser(sock.user.id), { text })
}

const open = async (sub, hooks) => {
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath(sub.number))
  const linked = Boolean(state.creds.registered || state.creds.me)
  sub.fresh ??= !linked

  const messageCache = makeCache(config.messageCacheSize, config.messageCacheTtlMs)

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silent)
    },
    logger: silent,
    browser: Browsers.windows('Chrome'),
    markOnlineOnConnect: false,
    keepAliveIntervalMs: 20000,
    retryRequestDelayMs: 5000,
    syncFullHistory: false,
    mediaCache,
    shouldIgnoreJid: jid => jid === 'status@broadcast' || jid?.endsWith('@newsletter'),
    cachedGroupMetadata: async jid => groupCache.get(jid),
    getMessage: async key => messageCache.get(key.id)
  })

  sock.isJadibot = true
  sock.jadibotNumber = sub.number
  sub.sock = sock

  let closed = false
  let openedAt = 0

  sock.ev.on('creds.update', saveCreds)

  bindGroupCache(sock)

  sock.ev.on('messages.upsert', ({ messages, type }) => {
    for (const message of messages) {
      if (message.key?.fromMe && message.key.id && message.message) messageCache.set(message.key.id, message.message)
    }

    if (type !== 'notify') return

    for (const message of messages) {
      handleMessage(sock, message).catch(error => {
        log.error(`Error al procesar un mensaje del jadibot ${sub.number}:`, error?.message ?? error)
      })
    }
  })

  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (sub.stopped || sub.sock !== sock) return

    if (connection === 'open') {
      clearTimeout(sub.pairTimer)
      sub.online = true
      openedAt = Date.now()
      log.success(`Jadibot ${sub.number} conectado como ${sock.user?.name || sock.user?.id}`)
      if (sub.fresh) {
        sub.fresh = false
        await welcome(sock).catch(() => {})
        await hooks.onLinked?.()
      }
    }

    if (connection !== 'close' || closed) return
    closed = true
    sub.online = false

    const status = lastDisconnect?.error?.output?.statusCode
    const uptimeMs = openedAt ? Date.now() - openedAt : 0
    if (uptimeMs >= stableAfterMs) sub.reconnects = 0

    if (status === DisconnectReason.restartRequired) return schedule(sub, hooks, 0)

    const pairing = !state.creds.registered && !state.creds.me

    if (pairing || status === DisconnectReason.loggedOut || status === DisconnectReason.forbidden) {
      log.warn(`Jadibot ${sub.number} desvinculado (${status ?? 'desconocido'}), sesión eliminada`)
      await drop(sub)
      if (pairing) hooks.onFail?.()
      return
    }

    if (status === DisconnectReason.badSession) {
      sub.badSessions += 1
      if (sub.badSessions >= 3) {
        log.warn(`Jadibot ${sub.number} con sesión inválida, sesión eliminada`)
        return drop(sub)
      }
      return schedule(sub, hooks, config.reconnectDelayMs)
    }

    if (status === DisconnectReason.connectionReplaced) {
      log.warn(`Jadibot ${sub.number} abierto en otro lugar, se detiene`)
      sub.stopped = true
      subs.delete(sub.number)
      return
    }

    const delay = nextDelay(sub)
    log.warn(`Jadibot ${sub.number} desconectado (${status ?? 'desconocido'}). Reconectando en ${delay / 1000}s...`)
    schedule(sub, hooks, delay)
  })

  if (!linked && hooks.onCode) {
    await new Promise(resolve => setTimeout(resolve, pairingDelayMs))
    if (sub.stopped) return
    const code = await sock.requestPairingCode(sub.number)
    sub.pairTimer = setTimeout(async () => {
      if (sub.stopped || sub.online) return
      await drop(sub)
      hooks.onFail?.()
    }, pairingTimeoutMs)
    await hooks.onCode(code.match(/.{1,4}/g).join('-'))
  }
}

export const startJadibot = async (number, hooks = {}) => {
  const sub = { number, sock: null, online: false, stopped: false, reconnects: 0, badSessions: 0, timer: null }
  subs.set(number, sub)

  try {
    await open(sub, hooks)
  } catch (error) {
    await drop(sub)
    throw error
  }

  return sub
}

export const isJadibotActive = number => subs.has(number)

export const listJadibots = () => [...subs.values()].map(sub => ({ number: sub.number, online: sub.online }))

export const stopJadibot = async number => {
  const sub = subs.get(number)
  if (!sub) return false

  try {
    await sub.sock?.logout()
  } catch {}

  await drop(sub)
  return true
}

export const restoreJadibots = async () => {
  try {
    if (!existsSync(config.jadibotDir)) return

    const numbers = readdirSync(config.jadibotDir).filter(name => statSync(join(config.jadibotDir, name)).isDirectory())
    let restored = 0

    for (const number of numbers) {
      if (!existsSync(join(sessionPath(number), 'creds.json'))) {
        await rm(sessionPath(number), { recursive: true, force: true })
        continue
      }

      try {
        await startJadibot(number)
        restored += 1
      } catch (error) {
        log.error(`No se pudo restaurar el jadibot ${number}:`, error?.message ?? error)
      }

      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    if (restored) log.success(`Jadibots restaurados: ${restored}`)
  } catch (error) {
    log.error('No se pudieron restaurar los jadibots:', error?.message ?? error)
  }
      }
