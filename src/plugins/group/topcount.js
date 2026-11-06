import { jidNumber, normalizeJid } from '../../utils/jid.js'
import { dayKey, history } from '../../utils/stats.js'

const dayMs = 86400000
const maxDays = 365
const perPage = 10

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const idsOf = participant => [participant.id, participant.lid, participant.phoneNumber].filter(Boolean)

export default {
  name: 'topcount',
  aliases: ['topmensajes', 'topmsgcount', 'topmessages'],
  description: 'Top de usuarios con más mensajes (días y página)',
  groupOnly: true,
  run: async ctx => {
    const days = ctx.args[0] ? Number(ctx.args[0]) : 1

    if (!Number.isInteger(days) || days < 1 || days > maxDays) {
      return ctx.reply(box('Días inválidos', [`Usa un número entre 1 y ${maxDays} ✗`, `Ejemplo: ${ctx.prefix}${ctx.command} 7 ✿`]))
    }

    const group = await ctx.getGroup()

    if (!group) return ctx.reply(box('Sin información', ['No pude ver el grupo ✗']))

    const botIds = new Set([normalizeJid(ctx.sock.user?.id), normalizeJid(ctx.sock.user?.lid)].filter(Boolean))
    const since = dayKey(Date.now() - (days - 1) * dayMs)
    const ranking = []

    for (const participant of group.participants) {
      const ids = idsOf(participant)
      if (ids.some(id => botIds.has(normalizeJid(id)))) continue

      const rows = history(ctx.chat, [...new Set(ids.map(jidNumber))], since)
      const msgs = rows.reduce((sum, [, [count]]) => sum + count, 0)
      const cmds = rows.reduce((sum, [, [, count]]) => sum + count, 0)

      if (msgs > 0) ranking.push({ jid: participant.id, msgs, cmds })
    }

    const label = `${days} día${days > 1 ? 's' : ''}`

    if (!ranking.length) {
      return ctx.reply(box('Sin registros', [`No hay actividad en los últimos ${label} ✗`]))
    }

    ranking.sort((a, b) => b.msgs - a.msgs || b.cmds - a.cmds)

    const totalPages = Math.ceil(ranking.length / perPage)
    const page = ctx.args[1] ? Number(ctx.args[1]) : 1

    if (!Number.isInteger(page) || page < 1 || page > totalPages) {
      return ctx.reply(box('Página inválida', [`Solo hay ${totalPages} página${totalPages > 1 ? 's' : ''} disponible${totalPages > 1 ? 's' : ''} ✗`]))
    }

    const start = (page - 1) * perPage
    const slice = ranking.slice(start, start + perPage)

    const lines = slice.map(
      (item, index) => `*${start + index + 1}.* @${jidNumber(item.jid)}\n> ✧ Mensajes: ${item.msgs} · Comandos: ${item.cmds}`
    )

    const header = box('Top de mensajes', [`Periodo: últimos ${label} ❀`, `Página: ${page} de ${totalPages} ✿`])
    const parts = [header, '', ...lines]

    if (page < totalPages) parts.push('', `> ➜ Siguiente página: *${ctx.prefix}${ctx.command} ${days} ${page + 1}* ✧`)

    await ctx.reply({ text: parts.join('\n'), mentions: slice.map(item => item.jid) })
  }
}
