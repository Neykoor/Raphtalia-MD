import config from '../../../config.js'
import { forget, lastSeen } from '../../utils/activity.js'
import { groupCache } from '../../utils/groups.js'
import { jidNumber, normalizeJid } from '../../utils/jid.js'
import { botsOnline } from '../../utils/primary.js'

const dayMs = 86400000
const defaultDays = 30
const maxListed = 40
const batchSize = 5
const batchDelayMs = 1000

const viewWords = new Set(['view', 'views', 'ver'])
const deleteWords = new Set(['delete', 'del', 'kick', 'eliminar'])

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const formatTime = ms => {
  const sec = Math.floor(ms / 1000)
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || '0m'
}

const idsOf = participant => [participant.id, participant.lid, participant.phoneNumber].filter(Boolean)

const hasAdmin = participant => Boolean(participant.admin || participant.isAdmin || participant.isSuperAdmin)

const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

export default {
  name: 'clear',
  aliases: ['limpiar', 'inactivos'],
  description: 'Limpia usuarios inactivos del grupo (view / delete / días)',
  groupOnly: true,
  adminOnly: true,
  run: async ctx => {
    const start = Date.now()
    const args = ctx.args.map(arg => arg.toLowerCase())
    const view = args.some(arg => viewWords.has(arg))
    const remove = !view && args.some(arg => deleteWords.has(arg))
    const typedDays = Number(args.find(arg => /^\d+$/.test(arg)))
    const days = Math.min(Math.max(typedDays || defaultDays, 1), 365)
    const limit = days * dayMs

    const group = await ctx.getGroup()
    if (!group) return ctx.reply(box('Sin información', ['No pude ver el grupo ✗']))

    const protectedIds = new Set(
      [
        ...ctx.senderIds,
        ...botsOnline().flatMap(sock => [sock.user.id, sock.user.lid])
      ]
        .filter(Boolean)
        .map(normalizeJid)
    )

    const isProtected = participant =>
      hasAdmin(participant) ||
      idsOf(participant).some(id => protectedIds.has(normalizeJid(id)) || config.owners.includes(jidNumber(id)))

    const now = Date.now()
    const rows = []

    for (const participant of group.participants) {
      if (isProtected(participant)) continue

      const seen = lastSeen(ctx.chat, idsOf(participant).map(jidNumber))
      if (!seen) continue

      const delta = now - seen
      if (!view && delta <= limit) continue

      rows.push({ participant, delta })
    }

    rows.sort((a, b) => b.delta - a.delta)

    if (!rows.length) {
      return ctx.reply(
        view
          ? box('Sin actividad', ['No hay usuarios con actividad registrada ✗'])
          : box('Sin inactivos', ['No se encontraron usuarios inactivos ✿', `Tiempo límite: ${days} días ❀`])
      )
    }

    let removed = 0
    let failed = 0

    if (remove) {
      if (!ctx.isBotAdmin) return ctx.reply(config.messages.botAdmin)

      for (let index = 0; index < rows.length; index += batchSize) {
        const batch = rows.slice(index, index + batchSize)

        try {
          const results = await ctx.sock.groupParticipantsUpdate(
            ctx.chat,
            batch.map(row => row.participant.id),
            'remove'
          )

          batch.forEach((row, position) => {
            const status = String(results?.[position]?.status ?? '200')
            if (status === '200') {
              removed += 1
              forget(ctx.chat, idsOf(row.participant).map(jidNumber))
            } else {
              failed += 1
            }
          })
        } catch {
          failed += batch.length
        }

        if (index + batchSize < rows.length) await wait(batchDelayMs)
      }

      groupCache.del(ctx.chat)
    }

    const listed = rows.slice(0, maxListed)
    const list = listed.map(
      (row, index) => `${index + 1}. @${jidNumber(row.participant.id)} - hace ${formatTime(row.delta)}`
    )
    if (rows.length > listed.length) list.push(`... y ${rows.length - listed.length} más`)

    const elapsed = `Ejecutado en ${Math.max(Date.now() - start, 1)}ms ❒`

    let header
    if (remove) {
      header = box('Limpieza completada', [
        `Expulsados: ${removed} ♡`,
        ...(failed ? [`Fallidos: ${failed} ✗`] : []),
        `Tiempo límite: ${days} días ❀`,
        elapsed
      ])
    } else if (view) {
      header = box('Actividad del grupo', [`Usuarios registrados: ${rows.length} ❀`, elapsed])
    } else {
      header = box('Usuarios inactivos', [
        `Encontrados: ${rows.length} ❖`,
        `Tiempo límite: ${days} días ❀`,
        elapsed,
        `Usa ${ctx.prefix}${ctx.command} delete para expulsarlos ♡`
      ])
    }

    await ctx.reply({
      text: [header, '', ...list].join('\n'),
      mentions: view || remove ? listed.map(row => row.participant.id) : []
    })
  }
}
