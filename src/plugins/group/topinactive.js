import { lastSeen } from '../../utils/activity.js'
import { jidNumber, normalizeJid } from '../../utils/jid.js'
import { dayKey, history } from '../../utils/stats.js'

const dayMs = 86400000
const maxDays = 365
const defaultDays = 30
const perPage = 10

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const idsOf = participant => [participant.id, participant.lid, participant.phoneNumber].filter(Boolean)

export default {
  name: 'topinactive',
  aliases: ['topinactivos', 'topinactiveusers'],
  description: 'Top de usuarios más inactivos (días y página)',
  groupOnly: true,
  run: async ctx => {
    const days = ctx.args[0] ? Number(ctx.args[0]) : defaultDays

    if (!Number.isInteger(days) || days < 1 || days > maxDays) {
      return ctx.reply(box('Días inválidos', [`Usa un número entre 1 y ${maxDays} ✗`, `Ejemplo: ${ctx.prefix}${ctx.command} 30 ✿`]))
    }

    const group = await ctx.getGroup()

    if (!group) return ctx.reply(box('Sin información', ['No pude ver el grupo ✗']))

    const botIds = new Set([normalizeJid(ctx.sock.user?.id), normalizeJid(ctx.sock.user?.lid)].filter(Boolean))
    const since = dayKey(Date.now() - (days - 1) * dayMs)
    const ranking = []

    for (const participant of group.participants) {
      const ids = idsOf(participant)
      if (ids.some(id => botIds.has(normalizeJid(id)))) continue

      const numbers = [...new Set(ids.map(jidNumber))]
      const rows = history(ctx.chat, numbers, since)
      const msgs = rows.reduce((sum, [, [count]]) => sum + count, 0)

      ranking.push({ jid: participant.id, msgs, seen: lastSeen(ctx.chat, numbers) })
    }

    if (!ranking.length) return ctx.reply(box('Sin registros', ['No encontré miembros en el grupo ✗']))

    ranking.sort((a, b) => a.msgs - b.msgs || a.seen - b.seen)

    const totalPages = Math.ceil(ranking.length / perPage)
    const page = ctx.args[1] ? Number(ctx.args[1]) : 1

    if (!Number.isInteger(page) || page < 1 || page > totalPages) {
      return ctx.reply(box('Página inválida', [`Solo hay ${totalPages} página${totalPages > 1 ? 's' : ''} disponible${totalPages > 1 ? 's' : ''} ✗`]))
    }

    const start = (page - 1) * perPage
    const slice = ranking.slice(start, start + perPage)

    const lines = slice.map((item, index) => `*${start + index + 1}.* @${jidNumber(item.jid)}\n> ✧ Mensajes: ${item.msgs}`)

    const header = box('Top de inactivos', [`Periodo: últimos ${days} días ❀`, `Página: ${page} de ${totalPages} ✿`])
    const parts = [header, '', ...lines]

    if (page < totalPages) parts.push('', `> ➜ Siguiente página: *${ctx.prefix}${ctx.command} ${days} ${page + 1}* ✧`)

    await ctx.reply({ text: parts.join('\n'), mentions: slice.map(item => item.jid) })
  }
}
