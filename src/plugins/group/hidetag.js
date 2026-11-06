import { downloadMediaMessage } from 'baileys'
import { silent } from '../../utils/logger.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage']

const captionOf = content => (content.imageMessage?.caption || content.videoMessage?.caption || '').trim()

export default {
  name: 'hidetag',
  aliases: ['tag', 'notify'],
  description: 'Envía un mensaje mencionando a todos sin mostrar las menciones',
  groupOnly: true,
  adminOnly: true,
  run: async ctx => {
    const group = await ctx.getGroup()
    const mentions = (group?.participants ?? []).map(item => item.id).filter(Boolean)

    if (!mentions.length) return ctx.reply(box('Sin información', ['No pude ver los miembros del grupo ✗']))

    const userText = ctx.args.join(' ').trim()
    const quoted = ctx.quoted
    const content = quoted ? quoted.message : ctx.content
    const type = mediaTypes.find(key => content[key])

    if (type) {
      const source = quoted
        ? { key: { remoteJid: ctx.chat, id: quoted.id, participant: quoted.sender }, message: quoted.message }
        : ctx.raw

      const media = await downloadMediaMessage(source, 'buffer', {}, { logger: silent, reuploadRequest: ctx.sock.updateMediaMessage })
      const caption = quoted ? captionOf(content) : userText
      const extra = caption ? { caption } : {}

      if (type === 'imageMessage') return ctx.send({ image: media, ...extra, mentions })

      if (type === 'videoMessage') {
        return ctx.send({ video: media, mimetype: 'video/mp4', gifPlayback: Boolean(content.videoMessage.gifPlayback), ...extra, mentions })
      }

      if (type === 'audioMessage') {
        return ctx.send({ audio: media, mimetype: 'audio/mp4', ptt: Boolean(content.audioMessage.ptt), mentions })
      }

      return ctx.send({ sticker: media, mentions })
    }

    const text = quoted?.text?.trim() || userText

    if (!text) {
      return ctx.reply(
        box('Falta un mensaje', [
          'Escribe un texto o responde a un mensaje ✿',
          `Ejemplo: ${ctx.prefix}${ctx.command} hola a todos ❀`
        ])
      )
    }

    await ctx.send({ text, mentions })
  }
}
