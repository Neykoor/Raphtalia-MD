import { downloadMediaMessage } from 'baileys'
import config from '../../../config.js'
import log, { silent } from '../../utils/logger.js'
import { addExif, buildExif, DOWNLOAD_TIMEOUT, encodeSticker, extensionOf, MAX_INPUT, MAX_NAME, withTimeout } from '../../utils/stickermaker.js'
import { getStickerInfo } from '../../utils/stickerinfo.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const mark = (ctx, emoji) => ctx.react(emoji).catch(() => {})

const pickSource = ctx => {
  const own = ctx.content
  if (own.imageMessage || own.videoMessage) return { content: own, source: ctx.raw }

  const quoted = ctx.quoted
  if (!quoted?.message?.imageMessage && !quoted?.message?.videoMessage && !quoted?.message?.stickerMessage) return null

  return {
    content: quoted.message,
    source: { key: { remoteJid: ctx.chat, id: quoted.id, participant: quoted.sender }, message: quoted.message }
  }
}

export default {
  name: 'sticker',
  aliases: ['s', 'stiker'],
  description: 'Crea un sticker desde una imagen, video o GIF',
  run: async ctx => {
    const picked = pickSource(ctx)

    if (!picked) {
      return ctx.reply(
        box('Falta una imagen o video', [
          'Envía una imagen, video o GIF con el comando ✿',
          'O responde a uno, o a un sticker para cambiarle el paquete y autor ❀',
          `Ejemplo: ${ctx.prefix}${ctx.command} Paquete | Autor ✧`,
          `Guarda tus datos con ${ctx.prefix}setsticker Paquete | Autor ♡`
        ])
      )
    }

    const { content, source } = picked
    const video = content.videoMessage
    const image = content.imageMessage
    const existing = content.stickerMessage

    if (Number(video?.fileLength ?? image?.fileLength ?? existing?.fileLength) > MAX_INPUT) {
      return ctx.reply(box('Archivo muy pesado', [`El máximo es ${MAX_INPUT / 1024 / 1024} MB ✗`]))
    }

    const [packText, authorText] = ctx.text.split('|')
    const saved = getStickerInfo(ctx.senderNumber)
    const pack = (packText || '').trim().slice(0, MAX_NAME) || saved?.pack || config.botName
    const author = (authorText || '').trim().slice(0, MAX_NAME) || saved?.author || ctx.pushName || config.botName

    log.info(`Sticker: procesando ${existing ? 'sticker' : video ? 'video' : 'imagen'}`)

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

      const webp = existing ? buffer : await encodeSticker({ buffer, extension: video ? 'mp4' : extensionOf(image.mimetype) }, Boolean(video))

      await ctx.reply({ sticker: addExif(webp, buildExif(pack, author)) })
      await mark(ctx, '✔️')
      log.success('Sticker: enviado')
    } catch (error) {
      log.error('Sticker:', error?.message ?? error)
      await mark(ctx, '✖️')
      await ctx.reply(box('No se pudo completar', ['No pude crear el sticker ✗', `Motivo: ${error?.message ?? 'desconocido'} ✧`]))
    }
  }
}
