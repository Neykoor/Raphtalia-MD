import { groupCache } from '../../utils/groups.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const maxLength = 2048

export default {
  name: 'setgpdesc',
  aliases: ['setgpdescription'],
  description: 'Cambia la descripción del grupo',
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  run: async ctx => {
    const description = ctx.text || ctx.quoted?.text?.trim() || ''

    if (!description) {
      return ctx.reply(
        box('Falta la descripción', [
          'Escribe la nueva descripción del grupo ✿',
          `Ejemplo: ${ctx.prefix}${ctx.command} Reglas del grupo ❀`
        ])
      )
    }

    if (description.length > maxLength) {
      return ctx.reply(box('Descripción muy larga', [`El máximo es ${maxLength} caracteres ✗`, `Enviaste ${description.length} ✧`]))
    }

    try {
      await ctx.sock.groupUpdateDescription(ctx.chat, description)
    } catch (error) {
      return ctx.reply(box('No se pudo completar', ['No pude cambiar la descripción ✗', `Motivo: ${error?.message ?? 'desconocido'} ✧`]))
    }

    groupCache.del(ctx.chat)

    await ctx.reply(box('Descripción actualizada', ['La descripción del grupo se modificó correctamente ❀', 'Hecho ♡']))
  }
}
