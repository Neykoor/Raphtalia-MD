import { box, displayName, ensureUser, setAfk } from '../../utils/profiles.js'

export default {
  name: 'afk',
  description: 'Activa el modo ausente (AFK)',
  run: async ctx => {
    const reason = ctx.text.trim().slice(0, 200)
    const user = ensureUser(ctx.senderNumber, ctx.pushName)
    setAfk(ctx.chat, ctx.senderNumber, reason)

    await ctx.reply(
      box('AFK activado', [
        `Usuario: ${displayName(user, ctx.senderNumber)} ❀`,
        `Motivo: ${reason || 'sin especificar'} ✿`,
        'Avisaré a quien te mencione ♡'
      ])
    )
  }
}
