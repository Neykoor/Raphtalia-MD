import { downloadMediaMessage } from 'baileys'
import { jidNumber } from '../../utils/jid.js'
import { silent } from '../../utils/logger.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const mediaTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage']

const captionOf = content => (content.imageMessage?.caption || content.videoMessage?.caption || '').trim()

const findMentions = async (ctx, text) => {
  const found = new Set(ctx.quoted ? [] : ctx.mentions)
  if (!text || !ctx.isGroup) return [...found]

  const group = await ctx.getGroup().catch(() => null)

  for (const item of group?.participants ?? []) {
    const numbers = [item.id, item.lid, item.phoneNumber].filter(Boolean).map(jidNumber)
    if (numbers.some(number => text.includes(`@${number}`))) found.add(item.id)
  }

  return [...found]
}

export default {
  name: 'say',
  aliases: ['decir'],
  description: 'Repite un mensaje como el bot',
  run: async ctx => {
    const userText = ctx.args.join(' ').trim()
    const quoted = ctx.quoted
    const content = quoted ? quoted.message : ctx.content
    const type = mediaTypes.find(key => content[key])
    const text = userText || (quoted ? (type ? captionOf(content) : quoted.text.trim()) : '')

    if (!type && !text) {
      return ctx.reply(
        box('Falta un mensaje', [
          'Escribe un texto o responde a un mensaje ✿',
          `Ejemplo: ${ctx.prefix}${ctx.command} hola a todos ❀`
        ])
      )
    }

    const mentions = await findMentions(ctx, text)

    if (!type) return ctx.send({ text, mentions })

    const source = quoted
      ? { key: { remoteJid: ctx.chat, id: quoted.id, participant: quoted.sender }, message: quoted.message }
      : ctx.raw

    let media

    try {
      media = await downloadMediaMessage(source, 'buffer', {}, { logger: silent, reuploadRequest: ctx.sock.updateMediaMessage })
    } catch {
      return ctx.reply(box('No se pudo completar', ['No pude descargar el archivo ✗']))
    }

    if (!media?.length) return ctx.reply(box('No se pudo completar', ['No pude descargar el archivo ✗']))

    const extra = text ? { caption: text } : {}

    if (type === 'imageMessage') return ctx.send({ image: media, ...extra, mentions })

    if (type === 'videoMessage') {
      return ctx.send({ video: media, mimetype: 'video/mp4', gifPlayback: Boolean(content.videoMessage.gifPlayback), ...extra, mentions })
    }

    if (type === 'audioMessage') {
      return ctx.send({ audio: media, mimetype: 'audio/mp4', ptt: Boolean(content.audioMessage.ptt), mentions })
    }

    await ctx.send({ sticker: media, mentions })
  }
}
