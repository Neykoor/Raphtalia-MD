import { existsSync, readdirSync, statSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import * as baileys from 'baileys'
import {
  Browsers,
  DisconnectReason,
  jidNormalizedUser,
  makeCacheableSignalKeyStore,
  makeResilientSocket
} from 'baileys'
import config from '../../config.js'
import { useSafeAuthState } from '../utils/auth.js'
import { main, subs } from '../utils/bots.js'
import { makeCache, mediaCache } from '../utils/cache.js'
import { bindGroupCache, groupCache } from '../utils/groups.js'
import { jidNumber } from '../utils/jid.js'
import log, { silent } from '../utils/logger.js'
import { bindWelcome } from '../utils/welcome.js'
import { handleMessage } from './handler.js'

const maxDelayMs = 60000
const retryAfterStopMs = 60000
const pairingTimeoutMs = 180000
const maxPairingTries = 3
const maxLogoutStrikes = 4
const logoutRetryMs = 20000

const sessionPath = number => join(config.jadibotDir, number)

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const isRateLimited = error => typeof baileys.isRateLimitError === 'function' && baileys.isRateLimitError(error)

const readLinked = async number => {
  for (const name of ['creds.json', 'creds.json.bak']) {
    let raw

    try {
      raw = await readFile(join(sessionPath(number), name), 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw error
    }

    try {
      const creds = JSON.parse(raw)
      return Boolean(creds?.registered || creds?.me)
    } catch {}
  }

  return null
}

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
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    mediaCache,
    shouldIgnoreJid: jid => jid === 'status@broadcast' || jid?.endsWith('@newsletter'),
    cachedGroupMetadata: async jid => groupCache.get(jid),
    getMessage: async key => messageCache.get(key.id)
  }

  const pairing = { requested: false, tries: 0 }
  let openedAt = 0

  const requestCode = async sock => {
    if (pairing.requested || sub.stopped || !hooks.onCode) return
    pairing.requested = true

    try {
      const code = await sock.requestPairingCode(sub.number)
      if (sub.stopped) return

      clearTimeout(sub.pairTimer)
      sub.pairTimer = setTimeout(async () => {
        if (sub.stopped || sub.online) return
        await drop(sub)
        hooks.onFail?.('timeout')
      }, pairingTimeoutMs)

      await hooks.onCode(code.match(/.{1,4}/g).join('-'))
    } catch (error) {
      pairing.requested = false
      pairing.tries += 1
      log.error(`No se pudo generar el código del jadibot ${sub.number}:`, error?.message ?? error)

      if (isRateLimited(error) || pairing.tries >= maxPairingTries) {
        const reason = isRateLimited(error) ? 'ratelimit' : 'error'
        await drop(sub)
        hooks.onFail?.(reason)
      }
    }
  }

  const reject = async (sock, reason) => {
    const fresh = sub.fresh
    sub.stopped = true

    if (fresh) {
      try {
        await sock.logout()
      } catch {}
    }

    if (fresh) await drop(sub)
    else release(sub)

    hooks.onFail?.(reason)
  }

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

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (sub.stopped || sub.sock !== sock) return

      if (qr && !isLinked()) await requestCode(sock)

      if (connection === 'open') {
        const account = jidNumber(sock.user?.id)
        const mainAccount = jidNumber(main.sock?.user?.id)
        const duplicate = [...subs.values()].some(
          other => other !== sub && other.sock?.user && jidNumber(other.sock.user.id) === account
        )

        if (account && account === mainAccount) {
          log.warn(`Jadibot ${sub.number} corresponde a la cuenta del bot principal, se descarta`)
          await reject(sock, 'main')
          return
        }

        if (account && duplicate) {
          log.warn(`Jadibot ${sub.number} corresponde a una cuenta que ya tiene un sub-bot activo, se descarta`)
          await reject(sock, 'duplicate')
          return
        }

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

    const numbers = readdirSync(config.jadibotDir).filter(
      name => /^\d{8,15}$/.test(name) && statSync(join(config.jadibotDir, name)).isDirectory()
    )
    let restored = 0

    for (const number of numbers) {
      try {
        if (!(await readLinked(number))) {
          await rm(sessionPath(number), { recursive: true, force: true })
          continue
        }

        await startJadibot(number)
        restored += 1
      } catch (error) {
        log.error(`No se pudo restaurar el jadibot ${number}:`, error?.message ?? error)
      }

      await sleep(config.jadibotBootGapMs)
    }

    if (restored) log.success(`Jadibots restaurados: ${restored}`)
  } catch (error) {
    log.error('No se pudieron restaurar los jadibots:', error?.message ?? error)
  }
                                                                  }
