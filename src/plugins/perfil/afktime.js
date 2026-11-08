import { makeCache } from '../../utils/cache.js'
import { box, clearAfk, displayName, formatDuration, getAfk, getUser } from '../../utils/profiles.js'
import { jidNumber } from '../../utils/jid.js'

const handled = makeCache(5000, 600000)

export default {
  all: async ctx => {
    if (ctx.fromMe && !ctx.sock.isJadibot) return
    if (ctx.content.reactionMessage || !ctx.senderNumber) return

    const key = `${ctx.chat}|${ctx.id}`
    if (handled.get(key)) return
    handled.set(key, true)

    const own = getAfk(ctx.chat, ctx.senderNumber)

    if (own) {
      clearAfk(ctx.chat, ctx.senderNumber)
      await ctx.reply(
        box('Ya no estás AFK', [
          `Usuario: ${displayName(getUser(ctx.senderNumber), ctx.pushName || ctx.senderNumber)} ❀`,
          `Motivo: ${own.reason || 'sin especificar'} ✿`,
          `Tiempo inactivo: ${formatDuration(Date.now() - own.since)} ♡`
        ])
      )
    }

    const raws = [...new Set([...ctx.mentions, ...(ctx.quoted?.sender ? [ctx.quoted.sender] : [])])]

    for (const raw of raws) {
      const number = jidNumber(await ctx.resolve(raw))
      if (!number || number === ctx.senderNumber) continue

      const away = getAfk(ctx.chat, number)
      if (!away) continue

      await ctx.reply(
        box('Usuario AFK', [
          `Usuario: ${displayName(getUser(number), number)} ❀`,
          `Motivo: ${away.reason || 'sin especificar'} ✿`,
          `Tiempo inactivo: ${formatDuration(Date.now() - away.since)} ♡`
        ])
      )
    }
  }
}
