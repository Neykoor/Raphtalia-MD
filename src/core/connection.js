import qrcode from 'qrcode-terminal'
import {
  Browsers,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  makeResilientSocket
} from 'baileys'
import config from '../../config.js'
import { useSafeAuthState } from '../utils/auth.js'
import { main } from '../utils/bots.js'
import { makeCache, mediaCache } from '../utils/cache.js'
import { bindGroupCache, groupCache } from '../utils/groups.js'
import log, { silent } from '../utils/logger.js'
import { acquireLock } from '../utils/lock.js'
import { ask } from '../utils/prompt.js'
import { bindWelcome } from '../utils/welcome.js'
import { handleMessage } from './handler.js'
import { loadPlugins } from './loader.js'

const messageCache = makeCache(config.messageCacheSize, config.messageCacheTtlMs)

const maxReconnectDelayMs = 60000
const retryAfterStopMs = 60000
const maxPairingTries = 3
const maxLogoutStrikes = 4
const logoutRetryMs = 20000
const replacedRetryMs = 30000

let logoutStrikes = 0

let loginChoice = null
let pluginsReady = false
let resilient = null
let hooks = {}

const resolveLogin = async registered => {
  if (registered) return null
  if (loginChoice) return loginChoice

  let method = config.loginMethod

  if (method !== 'qr' && method !== 'code') {
    log.info('Elige cómo vincular el bot:')
    log.info('1. Código QR')
    log.info('2. Código de emparejamiento')
    method = (await ask('Opción (1/2): ')) === '2' ? 'code' : 'qr'
  }

  let number = ''

  if (method === 'code') {
    number = (config.pairingNumber || (await ask('Número del bot con código de país, sin + ni espacios: '))).replace(/\D/g, '')
    if (!number) {
      log.warn('Número inválido, se usará el código QR')
      method = 'qr'
    }
  }

  loginChoice = { method, number }
  return loginChoice
}

const requestCode = async (sock, login, pairing) => {
  if (pairing.requested || pairing.tries >= maxPairingTries) return
  pairing.requested = true

  try {
    const code = await sock.requestPairingCode(login.number)
    log.info(`Código de emparejamiento: ${code.match(/.{1,4}/g).join('-')}`)
    log.info('Ingrésalo en WhatsApp > Dispositivos vinculados > Vincular con el número de teléfono')
  } catch (error) {
    pairing.requested = false
    pairing.tries += 1
    log.error('No se pudo generar el código de emparejamiento:', error?.message ?? error)
  }
}

const stopResilient = () => {
  try {
    resilient?.stop()
  } catch {}
  resilient = null
}

const retryLater = (delay = retryAfterStopMs) => {
  setTimeout(() => {
    connect().catch(error => {
      log.error('Error al reconectar:', error?.message ?? error)
      retryLater()
    })
  }, delay)
}

const giveUp = status => {
  stopResilient()

  if (status === DisconnectReason.loggedOut) {
    logoutStrikes += 1

    if (logoutStrikes < maxLogoutStrikes) {
      const delay = logoutRetryMs * logoutStrikes
      log.warn(`WhatsApp devolvió cierre de sesión (${status}), intento ${logoutStrikes}/${maxLogoutStrikes - 1} de recuperarla en ${delay / 1000}s. La sesión no se borró`)
      retryLater(delay)
      return
    }

    log.error(
      `WhatsApp cerró la sesión (${status}) ${logoutStrikes} veces seguidas. La carpeta "${config.sessionDir}" NO se borró. Si realmente fue desvinculado, bórrala y vuelve a iniciar para vincular de nuevo`
    )
    return
  }

  if (status === DisconnectReason.connectionReplaced) {
    log.error(`La sesión fue abierta en otro lugar. Se reintentará en ${replacedRetryMs / 1000}s`)
    retryLater(replacedRetryMs)
    return
  }

  log.error(`Reconexión detenida (${status ?? 'sin código'}). La sesión se conserva, se reintentará en ${retryAfterStopMs / 1000}s`)
  retryLater()
}

const connect = async () => {
  const { state, saveCreds } = await useSafeAuthState(config.sessionDir)
  const registered = Boolean(state.creds.registered || state.creds.me)
  const login = await resolveLogin(registered)
  const pairing = { requested: false, tries: 0 }
  let openedAt = 0

  if (registered) hooks.onRegistered?.()

  const socketConfig = {
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silent)
    },
    logger: silent,
    browser: login?.method === 'code' ? Browsers.ubuntu('Chrome') : Browsers.macOS('Safari'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    mediaCache,
    shouldIgnoreJid: jid => jid === 'status@broadcast' || jid?.endsWith('@newsletter'),
    cachedGroupMetadata: async jid => groupCache.get(jid),
    getMessage: async key => messageCache.get(key.id)
  }

  const bind = sock => {
    main.sock = sock

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
          log.error('Error al procesar un mensaje:', error?.message ?? error)
        })
      }
    })

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr && !state.creds.registered) {
        if (login?.method === 'qr') {
          log.info('Escanea el QR desde WhatsApp > Dispositivos vinculados > Vincular un dispositivo')
          qrcode.generate(qr, { small: true })
        } else if (login?.method === 'code') {
          await requestCode(sock, login, pairing)
        }
      }

      if (connection === 'connecting') log.info('Conectando...')

      if (connection === 'open') {
        openedAt = Date.now()
        logoutStrikes = 0
        log.success(`${config.botName} conectado como ${sock.user?.name || sock.user?.id}`)
        hooks.onOpen?.()
      }

      if (connection === 'close') {
        const status = lastDisconnect?.error?.output?.statusCode
        if (status === DisconnectReason.restartRequired) return

        const detail = lastDisconnect?.error?.message ?? 'sin detalle'
        const alive = openedAt ? ` tras ${Math.round((Date.now() - openedAt) / 1000)}s conectado` : ' sin llegar a conectar'
        openedAt = 0
        log.warn(`Conexión cerrada (${status ?? 'desconocido'})${alive}: ${detail}`)
      }
    })
  }

  stopResilient()

  resilient = makeResilientSocket({
    config: socketConfig,
    logger: silent,
    minDelayMs: config.reconnectDelayMs,
    maxDelayMs: maxReconnectDelayMs,
    shouldReconnect: status => status !== DisconnectReason.loggedOut && status !== DisconnectReason.connectionReplaced,
    onSocket: bind,
    onStopped: giveUp,
    onMaxAttemptsReached: () => giveUp(undefined)
  })
}

export const start = async (options = {}) => {
  hooks = options

  if (!pluginsReady) {
    const result = await loadPlugins()
    log.success(`Plugins cargados: ${result.commands} comandos en ${result.files} archivos`)
    pluginsReady = true
  }

  if (!(await acquireLock(config.sessionDir))) {
    log.error('Hay otra instancia del bot usando la misma sesión. Ciérrala antes de iniciar')
    process.exit(1)
  }

  await connect()
}
