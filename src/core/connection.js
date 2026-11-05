import { rm } from 'node:fs/promises'
import qrcode from 'qrcode-terminal'
import makeWASocket, {
  Browsers,
  DisconnectReason,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState
} from 'baileys'
import config from '../../config.js'
import { makeCache, mediaCache } from '../utils/cache.js'
import { bindGroupCache, groupCache } from '../utils/groups.js'
import log, { silent } from '../utils/logger.js'
import { ask } from '../utils/prompt.js'
import { handleMessage } from './handler.js'
import { loadPlugins } from './loader.js'

const messageCache = makeCache(config.messageCacheSize, config.messageCacheTtlMs)

let loginChoice = null
let pluginsReady = false

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

const restart = delay => {
  setTimeout(() => {
    start().catch(error => {
      log.error('Error al reconectar:', error?.message ?? error)
      restart(config.reconnectDelayMs)
    })
  }, delay)
}

export const start = async () => {
  if (!pluginsReady) {
    const result = await loadPlugins()
    log.success(`Plugins cargados: ${result.commands} comandos en ${result.files} archivos`)
    pluginsReady = true
  }

  const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir)
  const login = await resolveLogin(state.creds.registered)

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silent)
    },
    logger: silent,
    browser: Browsers.windows('Chrome'),
    markOnlineOnConnect: false,
    syncFullHistory: false,
    mediaCache,
    shouldIgnoreJid: jid => jid === 'status@broadcast' || jid?.endsWith('@newsletter'),
    cachedGroupMetadata: async jid => groupCache.get(jid),
    getMessage: async key => messageCache.get(key.id)
  })

  let closed = false

  sock.ev.on('creds.update', saveCreds)

  bindGroupCache(sock)

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
    if (qr && login?.method === 'qr') {
      log.info('Escanea el QR desde WhatsApp > Dispositivos vinculados > Vincular un dispositivo')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'connecting') log.info('Conectando...')

    if (connection === 'open') {
      log.success(`${config.botName} conectado como ${sock.user?.name || sock.user?.id}`)
    }

    if (connection !== 'close' || closed) return
    closed = true

    const status = lastDisconnect?.error?.output?.statusCode

    if (status === DisconnectReason.loggedOut || status === DisconnectReason.badSession) {
      log.warn('Sesión cerrada o inválida. Se eliminará y tendrás que vincular de nuevo')
      await rm(config.sessionDir, { recursive: true, force: true })
      loginChoice = null
      return restart(0)
    }

    if (status === DisconnectReason.connectionReplaced) {
      log.error('La sesión fue abierta en otro lugar. Cierra la otra instancia y vuelve a iniciar')
      process.exit(1)
    }

    if (status === DisconnectReason.forbidden) {
      log.error('WhatsApp rechazó la conexión (403)')
      process.exit(1)
    }

    log.warn(`Conexión cerrada (${status ?? 'desconocido'}). Reconectando...`)
    restart(status === DisconnectReason.restartRequired ? 0 : config.reconnectDelayMs)
  })

  if (login?.method === 'code') {
    try {
      const code = await sock.requestPairingCode(login.number)
      log.info(`Código de emparejamiento: ${code.match(/.{1,4}/g).join('-')}`)
      log.info('Ingrésalo en WhatsApp > Dispositivos vinculados > Vincular con el número de teléfono')
    } catch (error) {
      log.error('No se pudo generar el código de emparejamiento:', error?.message ?? error)
    }
  }
}
