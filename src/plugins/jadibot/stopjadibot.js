import { stopJadibot } from '../../core/jadibot.js'
import { isLidJid } from '../../utils/jid.js'

export default {
  name: 'stopjadibot',
  aliases: ['deljadibot', 'stopsubbot'],
  description: 'Desvincula y elimina un sub-bot',
  run: async ctx => {
    if (ctx.sock.isJadibot) {
      if (!ctx.fromMe) return ctx.reply('Solo el dueño del sub-bot puede desvincularlo.')
      await ctx.reply('Sub-bot desvinculado ✓')
      return stopJadibot(ctx.sock.jadibotNumber)
    }

    const typed = (ctx.args[0] || '').replace(/\D/g, '')
    const number = ctx.isOwner && typed ? typed : isLidJid(ctx.sender) ? '' : ctx.senderNumber

    if (!(await stopJadibot(number))) return ctx.reply('No hay un sub-bot activo para ese número.')

    await ctx.reply('Sub-bot desvinculado ✓')
  }
}
