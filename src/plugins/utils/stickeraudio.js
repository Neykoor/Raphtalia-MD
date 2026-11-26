import { downloadMediaMessage } from 'baileys'
import config from '../../../config.js'
import log, { silent } from '../../utils/logger.js'
import { getStickerInfo } from '../../utils/stickerinfo.js'
import {
  addExif,
  buildExif,
  DOWNLOAD_TIMEOUT,
  encodeSticker,
  extractAudio,
  MAX_INPUT,
  MAX_NAME,
  MAX_SECONDS,
  noAudioMessage,
  withTimeout
} from '../../utils/stickermaker.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const mark = (ctx, emoji) => ctx.react(emoji).catch(() => {})

const pickSource = ctx => {
  const own = ctx.content
  if (own.videoMessage) return { video: own.videoMessage, source: ctx.raw }

  const quoted = ctx.quoted
  if (!quoted?.message?.videoMessage) return null

  return {
    video: quoted.message.videoMessage,
    source: { key: { remoteJid: ctx.chat, id: quoted.id, participant: quoted.sender }, message: quoted.message }
  }
}

export default {
  name: 'stickeraudio',
  aliases: ['sa', 'saudio', 'stickerconaudio'],
  description: 'Crea un sticker animado desde un video y te envía también su audio',
  run: async ctx => {
    const picked = pickSource(ctx)

    if (!picked) {
      return ctx.reply(
        box('Falta un video', [
          'Envía un video con el comando o responde a uno ✿',
          `Recibirás el sticker animado y su audio (hasta ${MAX_SECONDS} s) ❀`,
          `Ejemplo: ${ctx.prefix}${ctx.command} Paquete | Autor ✧`,
          `Guarda tus datos con ${ctx.prefix}setsticker Paquete | Autor ♡`
        ])
      )
    }

    const { video, source } = picked

    if (Number(video.fileLength) > MAX_INPUT) {
      return ctx.reply(box('Archivo muy pesado', [`El máximo es ${MAX_INPUT / 1024 / 1024} MB ✗`]))
    }

    const [packText, authorText] = ctx.text.split('|')
    const saved = getStickerInfo(ctx.senderNumber)
    const pack = (packText || '').trim().slice(0, MAX_NAME) || saved?.pack || config.botName
    const author = (authorText || '').trim().slice(0, MAX_NAME) || saved?.author || ctx.pushName || config.botName

    log.info('Sticker con audio: procesando video')

    await mark(ctx, '🕒')

    try {
      const buffer = await withTimeout(
        downloadMediaMessage(source, 'buffer', {}, { logger: silent, reuploadRequest: ctx.sock.updateMediaMessage }),
        DOWNLOAD_TIMEOUT,
        'la descarga tardó demasiado'
      )

      if (!buffer?.length) {
        await mark(ctx, '✖️')
        return ctx.reply(box('No se pudo completar', ['No pude descargar el archivo ✗']))
      }

      const input = { buffer, extension: 'mp4' }
      const audio = await extractAudio(input)
      const webp = await encodeSticker(input, true)

      await ctx.reply({ sticker: addExif(webp, buildExif(pack, author)) })
      await ctx.reply({ audio, mimetype: 'audio/mp4', ptt: false })
      await mark(ctx, '✔️')
      log.success('Sticker con audio: enviado')
    } catch (error) {
      log.error('Sticker con audio:', error?.message ?? error)
      await mark(ctx, '✖️')

      if (error?.message === noAudioMessage) {
        return ctx.reply(
          box('Sin audio', ['Ese video no tiene audio ✗', `Para un sticker normal usa ${ctx.prefix}sticker ✧`])
        )
      }

      await ctx.reply(box('No se pudo completar', ['No pude crear el sticker con audio ✗', `Motivo: ${error?.message ?? 'desconocido'} ✧`]))
    }
  }
}
