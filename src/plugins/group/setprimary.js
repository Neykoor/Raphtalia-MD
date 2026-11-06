import { jidNumber, normalizeJid } from '../../utils/jid.js'
import { botsOnline, clearPrimary, getPrimary, setPrimary } from '../../utils/primary.js'

const resetWords = new Set(['reset', 'off', 'clear', 'quitar', 'borrar', 'del'])

const box = (title, ...lines) => [`*✿ ${title} ✿*`, ...lines.map(line => `> ${line}`)].join('\n')

const idsOf = sock => [sock.user?.id, sock.user?.lid].filter(Boolean).map(normalizeJid)

const inGroup = (group, sock) => {
  const ids = new Set(idsOf(sock))
  return Boolean(
    group?.participants.some(item =>
      [item.id, item.lid, item.phoneNumber].some(value => value && ids.has(normalizeJid(value)))
    )
  )
}

const findTarget = ctx => {
  const wanted = new Set([...ctx.mentions, ctx.quoted?.sender].filter(Boolean).map(jidNumber))
  const typed = (ctx.args[0] || '').replace(/\D/g, '')
  if (typed.length >= 8) wanted.add(typed)
  if (!wanted.size) return undefined
  return botsOnline().find(sock => idsOf(sock).some(id => wanted.has(jidNumber(id)))) ?? null
}

export default {
  name: 'setprimary',
  aliases: ['primary', 'botprincipal'],
  description: 'Define qué bot responde en este grupo (@bot, responder o reset)',
  groupOnly: true,
  adminOnly: true,
  run: async ctx => {
    const option = (ctx.args[0] || '').toLowerCase()
    const cmd = `${ctx.prefix}${ctx.command}`

    if (resetWords.has(option)) {
      if (!clearPrimary(ctx.chat)) return ctx.reply(box('Bot principal', '❀ Este grupo aún no tiene bot principal'))
      return ctx.reply(box('Bot principal', '♡ Listo, quité el bot principal', '✧ Ahora todos los bots pueden responder'))
    }

    const target = findTarget(ctx)

    if (target === undefined) {
      return ctx.reply(
        box(
          'Setprimary',
          '❀ Así se usa, cielo:',
          `✧ ${cmd} @bot`,
          `✧ ${cmd} (respondiendo al bot)`,
          `✧ ${cmd} reset`
        )
      )
    }

    if (!target) return ctx.reply(box('Bot principal', '❀ Ese número no es un bot activo, intenta con otro'))

    if (!inGroup(await ctx.getGroup(), target)) return ctx.reply(box('Bot principal', '❀ Ese bot no está en este grupo todavía'))

    const number = jidNumber(target.user.id)

    if (getPrimary(ctx.chat) === number) {
      if (ctx.sock === target) {
        await ctx.reply({
          text: box('Bot principal', `♡ @${number} ya es el principal de este grupo`),
          mentions: [normalizeJid(target.user.id)]
        })
      }
      return
    }

    setPrimary(ctx.chat, number)
    await ctx.reply({
      text: box('Bot principal', '♡ Listo, ya quedó configurado', `✧ Bot: @${number}`, '❀ Los demás bots descansarán en este grupo'),
      mentions: [normalizeJid(target.user.id)]
    })
  }
}
