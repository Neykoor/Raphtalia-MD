import { isBotOff, setBotOff } from '../../utils/botstate.js'
import { jidNumber } from '../../utils/jid.js'

export default {
  name: 'bot',
  description: 'Enciende o apaga el bot en este grupo (on/off)',
  groupOnly: true,
  adminOnly: true,
  run: async ctx => {
    const option = (ctx.args[0] || '').toLowerCase()
    const bot = jidNumber(ctx.sock.user?.id)
    const off = isBotOff(bot, ctx.chat)

    if (off) {
      if (option !== 'on') return
      setBotOff(bot, ctx.chat, false)
      return ctx.reply('Bot encendido en este grupo ✓')
    }

    if (option === 'off') return setBotOff(bot, ctx.chat, true)

    if (option === 'on') return ctx.reply('El bot ya está encendido en este grupo ✓')

    await ctx.reply(`Uso: ${ctx.prefix}bot on / ${ctx.prefix}bot off`)
  }
}
