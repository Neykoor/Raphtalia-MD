import { groupCache } from '../../utils/groups.js'
import { jidNumber } from '../../utils/jid.js'
import { botsOnline } from '../../utils/primary.js'
import { addWarn, authorOf, box, clearWarns, formatDate, getSettings, resolveTarget } from '../../utils/warns.js'

export default {
  name: 'warn',
  aliases: ['advertir'],
  description: 'Da una advertencia a un miembro del grupo',
  groupOnly: true,
  adminOnly: true,
  run: async ctx => {
    const target = await resolveTarget(ctx)

    if (!target) {
      return ctx.reply(
        box('Falta un usuario', [
          'Menciona a alguien con @ ✿',
          'O responde a su mensaje ❀',
          `Ejemplo: ${ctx.prefix}${ctx.command} @usuario motivo ✧`
        ])
      )
    }

    const botNumbers = botsOnline().flatMap(sock => [sock.user.id, sock.user.lid]).filter(Boolean).map(jidNumber)
    if (target.keys.some(key => botNumbers.includes(key))) {
      return ctx.reply(box('Acción no permitida', ['No puedo advertir a un bot ✗']))
    }

    const reason = ctx.args.filter(arg => !arg.startsWith('@')).join(' ').trim() || 'Sin razón.'
    const by = await authorOf(ctx)
    const warnings = addWarn(ctx.chat, target.keys, { reason, at: Date.now(), by })
    const total = warnings.length
    const { limit, kick } = getSettings(ctx.chat)

    const list = warnings.map((item, index) => `\`#${total - index}\` » ${item.reason}\n> » Fecha: ${formatDate(item.at)}`)

    const header = box('Advertencia añadida', [`Usuario: ${target.tag}`, `Advertencias totales: ${total}/${limit} ❀`])
    const parts = [header, '', ...list]

    if (total >= limit && kick) {
      let removed = false

      if (target.participant) {
        try {
          const [result] = await ctx.sock.groupParticipantsUpdate(ctx.chat, [target.participant.id], 'remove')
          removed = !result?.status || String(result.status) === '200'
        } catch {
          removed = false
        }
      }

      if (removed) {
        clearWarns(ctx.chat, target.keys)
        groupCache.del(ctx.chat)
        parts.push('', '> ❖ Llegó al límite de advertencias y fue expulsado del grupo ♡')
      } else {
        parts.push('', '> ❖ Llegó al límite, pero no pude expulsarlo automáticamente ✗')
      }
    } else if (total >= limit) {
      parts.push('', '> ❖ El usuario llegó al límite de advertencias ❀')
    }

    await ctx.reply({ text: parts.join('\n'), mentions: [target.mention] })
  }
}
