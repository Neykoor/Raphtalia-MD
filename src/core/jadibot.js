import { existsSync, readdirSync, statSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import {
  Browsers,
  DisconnectReason,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  makeResilientSocket
} from 'baileys'
import config from '../../config.js'
import { useSafeAuthState } from '../utils/auth.js'
import { subs } from '../utils/bots.js'
import { makeCache, mediaCache } from '../utils/cache.js'
import { bindGroupCache, groupCache } from '../utils/groups.js'
import log, { silent } from '../utils/logger.js'
import { bindWelcome } from '../utils/welcome.js'
import { handleMessage } from './handler.js'

const maxDelayMs = 60000
const retryAfterStopMs = 60000
const pairingTimeoutMs = 180000
const pairingDelayMs = 3000
const maxLogoutStrikes = 4
const logoutRetryMs = 20000

const sessionPath = number => join(config.jadibotDir, number)

const stopSocket = sub => {
  try {
    sub.resilient?.stop()
  } catch {}
  try {
    sub.sock?.end(undefined)
  } catch {}
}

const release = sub => {
  sub.stopped = true
  clearTimeout(sub.timer)
  clearTimeout(sub.pairTimer)
  if (subs.get(sub.number) === sub) subs.delete(sub.number)
  stopSocket(sub)
}

const drop = async sub => {
  release(sub)
  await rm(sessionPath(sub.number), { recursive: true, force: true })
}

const schedule = (sub, hooks, delay) => {
  sub.timer = setTimeout(() => {
    if (sub.stopped) return
    open(sub, hooks).catch(error => {
      log.error(`Error al reconectar el jadibot ${sub.number}:`, error?.message ?? error)
      if (!sub.stopped) schedule(sub, hooks, retryAfterStopMs)
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
  const { state, saveCreds } = await useSafeAuthState(sessionPath(sub.number))
  const isLinked = () => Boolean(state.creds.registered || state.creds.me)
  const linked = isLinked()
  sub.fresh ??= !linked

  const messageCache = makeCache(config.messageCacheSize, config.messageCacheTtlMs)

  const socketConfig = {
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silent)
    },
    logger: silent,
    browser: Browsers.windows('Chrome'),
    markOnlineOnConnect: false,
    keepAliveIntervalMs: 25000,
    connectTimeoutMs: 60000,
    retryRequestDelayMs: 250,
    syncFullHistory: false,
    mediaCache,
    shouldIgnoreJid: jid => jid === 'status@broadcast' || jid?.endsWith('@newsletter'),
    cachedGroupMetadata: async jid => groupCache.get(jid),
    getMessage: async key => messageCache.get(key.id)
  }

  let openedAt = 0
  let firstSocket
  const ready = new Promise(resolve => {
    firstSocket = resolve
  })

  const giveUp = status => {
    if (sub.stopped) return

    if (status === DisconnectReason.loggedOut && isLinked()) {
      sub.strikes = (sub.strikes ?? 0) + 1

      if (sub.strikes < maxLogoutStrikes) {
        const delay = logoutRetryMs * sub.strikes
        log.warn(`Jadibot ${sub.number} recibió cierre de sesión (${status}), intento ${sub.strikes}/${maxLogoutStrikes - 1} de recuperarlo en ${delay / 1000}s`)
        sub.online = false
        clearTimeout(sub.timer)
        stopSocket(sub)
        schedule(sub, hooks, delay)
        return
      }
    }

    if (status === DisconnectReason.loggedOut || !isLinked()) {
      log.warn(`Jadibot ${sub.number} desvinculado (${status ?? 'desconocido'}), sesión eliminada`)
      const pairing = !isLinked()
      drop(sub).catch(() => {})
      if (pairing) hooks.onFail?.()
      return
    }

    log.warn(`Jadibot ${sub.number} detenido (${status ?? 'sin código'}). La sesión se conserva, se reintentará en ${retryAfterStopMs / 1000}s`)
    sub.online = false
    clearTimeout(sub.timer)
    stopSocket(sub)
    schedule(sub, hooks, retryAfterStopMs)
  }

  const bind = sock => {
    sock.isJadibot = true
    sock.jadibotNumber = sub.number
    sub.sock = sock

    sock.ev.on('creds.update', saveCreds)

    bindGroupCache(sock)
    bindWelcome(sock)

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
        sub.strikes = 0
        openedAt = Date.now()
        log.success(`Jadibot ${sub.number} conectado como ${sock.user?.name || sock.user?.id}`)
        if (sub.fresh) {
          sub.fresh = false
          await welcome(sock).catch(() => {})
          await hooks.onLinked?.()
        }
      }

      if (connection === 'close') {
        sub.online = false
        const status = lastDisconnect?.error?.output?.statusCode
        if (status === DisconnectReason.restartRequired) return

        const alive = openedAt ? ` tras ${Math.round((Date.now() - openedAt) / 1000)}s conectado` : ' sin llegar a conectar'
        openedAt = 0
        log.warn(`Jadibot ${sub.number} desconectado (${status ?? 'desconocido'})${alive}`)
      }
    })

    firstSocket(sock)
  }

  sub.resilient = makeResilientSocket({
    config: socketConfig,
    logger: silent,
    minDelayMs: config.reconnectDelayMs,
    maxDelayMs,
    shouldReconnect: status => status !== DisconnectReason.loggedOut,
    onSocket: bind,
    onStopped: giveUp,
    onMaxAttemptsReached: () => giveUp(undefined)
  })

  if (!linked && hooks.onCode) {
    const sock = await ready
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
  const sub = { number, sock: null, resilient: null, online: false, stopped: false, timer: null }
  subs.set(number, sub)

  try {
    await open(sub, hooks)
  } catch (error) {
    if (sub.fresh) await drop(sub)
    else release(sub)
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
