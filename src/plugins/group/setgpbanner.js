import { downloadMediaMessage } from 'baileys'
import { silent } from '../../utils/logger.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const pickSource = ctx => {
  if (ctx.content.imageMessage) return ctx.raw

  const quoted = ctx.quoted
  if (!quoted?.message?.imageMessage) return null

  return {
    key: { remoteJid: ctx.chat, id: quoted.id, participant: quoted.sender },
    message: quoted.message
  }
}

export default {
  name: 'setgpbanner',
  aliases: ['setgppfp', 'setgpimg', 'setgpicon'],
  description: 'Cambia la imagen del grupo',
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  run: async ctx => {
    const source = pickSource(ctx)

    if (!source) {
      return ctx.reply(
        box('Falta una imagen', [
          'Envía una imagen con el comando ✿',
          'O responde a una imagen ❀',
          `Ejemplo: ${ctx.prefix}${ctx.command} ✧`
        ])
      )
    }

    let image

    try {
      image = await downloadMediaMessage(source, 'buffer', {}, { logger: silent, reuploadRequest: ctx.sock.updateMediaMessage })
    } catch {
      return ctx.reply(box('No se pudo completar', ['No pude descargar la imagen ✗']))
    }

    if (!image?.length) return ctx.reply(box('No se pudo completar', ['No pude descargar la imagen ✗']))

    try {
      await ctx.sock.updateProfilePicture(ctx.chat, image)
    } catch (error) {
      return ctx.reply(box('No se pudo completar', ['No pude cambiar la imagen del grupo ✗', `Motivo: ${error?.message ?? 'desconocido'} ✧`]))
    }

    await ctx.reply(box('Imagen actualizada', ['La imagen del grupo se cambió con éxito ❀', 'Hecho ♡']))
  }
}
