import { box, formatDate, getSettings, getWarns, resolveTarget } from '../../utils/warns.js'
import { jidNumber } from '../../utils/jid.js'

export default {
  name: 'warns',
  aliases: ['advertencias'],
  description: 'Muestra las advertencias de un miembro del grupo',
  groupOnly: true,
  adminOnly: true,
  run: async ctx => {
    const target = await resolveTarget(ctx)

    if (!target) {
      return ctx.reply(
        box('Falta un usuario', ['Menciona a alguien con @ ✿', 'O responde a su mensaje ❀', `Ejemplo: ${ctx.prefix}${ctx.command} @usuario ✧`])
      )
    }

    const warnings = getWarns(ctx.chat, target.keys)
    const total = warnings.length

    if (!total) {
      return ctx.reply({
        text: box('Sin advertencias', [`Usuario: ${target.tag}`, 'No tiene advertencias registradas ✿']),
        mentions: [target.mention]
      })
    }

    const { limit } = getSettings(ctx.chat)

    const list = warnings.map((item, index) => {
      const author = item.by ? `\n> » Por: @${jidNumber(item.by)}` : ''
      return `\`#${total - index}\` » ${item.reason}\n> » Fecha: ${formatDate(item.at)}${author}`
    })

    const header = box('Advertencias', [`Usuario: ${target.tag}`, `Total: ${total}/${limit} ❀`])
    const authors = warnings.map(item => item.by).filter(Boolean)

    await ctx.reply({
      text: [header, '', ...list].join('\n'),
      mentions: [...new Set([target.mention, ...authors])]
    })
  }
}
