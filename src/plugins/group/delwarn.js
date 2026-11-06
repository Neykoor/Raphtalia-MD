import { box, getWarns, removeWarn, resolveTarget } from '../../utils/warns.js'

export default {
  name: 'delwarn',
  aliases: ['unwarn', 'quitarwarn'],
  description: 'Elimina una advertencia de un miembro (número o all)',
  groupOnly: true,
  adminOnly: true,
  run: async ctx => {
    const target = await resolveTarget(ctx)

    if (!target) {
      return ctx.reply(
        box('Falta un usuario', [
          'Menciona a alguien con @ ✿',
          'O responde a su mensaje ❀',
          `Ejemplo: ${ctx.prefix}${ctx.command} @usuario 1 ✧`,
          `Para borrar todas: ${ctx.prefix}${ctx.command} @usuario all ♡`
        ])
      )
    }

    const total = getWarns(ctx.chat, target.keys).length

    if (!total) {
      return ctx.reply({
        text: box('Sin advertencias', [`Usuario: ${target.tag}`, 'No tiene advertencias registradas ✿']),
        mentions: [target.mention]
      })
    }

    const raw = (ctx.args.filter(arg => !arg.startsWith('@'))[0] || '').toLowerCase()

    if (raw === 'all') {
      removeWarn(ctx.chat, target.keys, 'all')
      return ctx.reply({
        text: box('Advertencias eliminadas', [`Usuario: ${target.tag}`, `Se borraron las ${total} advertencias ♡`]),
        mentions: [target.mention]
      })
    }

    const index = Number(raw)

    if (!raw || !Number.isInteger(index)) {
      return ctx.reply(box('Falta el número', ['Indica cuál advertencia quitar ❀', `O usa ${ctx.prefix}${ctx.command} @usuario all ✿`]))
    }

    if (index < 1 || index > total) {
      return ctx.reply(box('Número inválido', [`Debe ser un número entre 1 y ${total} ✗`]))
    }

    removeWarn(ctx.chat, target.keys, index)

    await ctx.reply({
      text: box('Advertencia eliminada', [`Usuario: ${target.tag}`, `Se quitó la advertencia #${index} ♡`, `Quedan: ${total - 1} ❀`]),
      mentions: [target.mention]
    })
  }
}
