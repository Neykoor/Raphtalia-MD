import { jidNumber, normalizeJid } from '../../utils/jid.js'
import { dayKey, history } from '../../utils/stats.js'

const dayMs = 86400000
const defaultDays = 30
const maxListed = 20

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const idsOf = participant => [participant.id, participant.lid, participant.phoneNumber].filter(Boolean)

const label = day =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  })

export default {
  name: 'count',
  aliases: ['mensajes', 'messages', 'msgcount', 'contador'],
  description: 'Cuenta los mensajes de un usuario (@usuario o responder, y días)',
  groupOnly: true,
  run: async ctx => {
    const typedDays = Number(ctx.args.find(arg => /^\d+$/.test(arg)))
    const days = Math.min(Math.max(typedDays || defaultDays, 1), 365)

    const target = normalizeJid(ctx.mentions[0] || ctx.quoted?.sender || ctx.sender)
    const group = await ctx.getGroup()
    const participant = group?.participants.find(item => idsOf(item).some(id => normalizeJid(id) === target))

    const mention = participant?.id || target
    const own = !ctx.mentions[0] && !ctx.quoted?.sender
    const lookup = [
      ...new Set([...(participant ? idsOf(participant) : [target]), ...(own ? ctx.senderIds : [])].map(jidNumber))
    ]

    const since = dayKey(Date.now() - (days - 1) * dayMs)
    const rows = history(ctx.chat, lookup, since)
    const tag = `@${jidNumber(mention)}`

    if (!rows.length) {
      return ctx.reply({
        text: box('Sin registros', [`Usuario: ${tag}`, `No he visto mensajes en los últimos ${days} días ✗`]),
        mentions: [mention]
      })
    }

    const totalMsgs = rows.reduce((sum, [, [msgs]]) => sum + msgs, 0)
    const totalCmds = rows.reduce((sum, [, [, cmds]]) => sum + cmds, 0)

    const lines = rows.slice(0, maxListed).map(([day, [msgs, cmds]]) => `❏ *${label(day)}*\n> Mensajes: ${msgs} · Comandos: ${cmds}`)
    if (rows.length > maxListed) lines.push(`... y ${rows.length - maxListed} días más`)

    const header = box('Contador de mensajes', [
      `Usuario: ${tag} ❀`,
      `Últimos ${days} días: ${totalMsgs} mensajes ✿`,
      `Comandos usados: ${totalCmds} ♡`
    ])

    await ctx.reply({ text: [header, '', ...lines].join('\n'), mentions: [mention] })
  }
}
