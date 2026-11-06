import { isJadibotActive, startJadibot } from '../../core/jadibot.js'
import { isLidJid, jidNumber } from '../../utils/jid.js'

export default {
  name: 'jadibot',
  aliases: ['serbot', 'subbot'],
  description: 'Vincula tu número como sub-bot con un código',
  privateOnly: true,
  run: async ctx => {
    if (ctx.sock.isJadibot) return ctx.reply('Este comando solo se usa desde el bot principal.')

    const typed = (ctx.args[0] || '').replace(/\D/g, '')
    const number = ctx.isOwner && typed ? typed : isLidJid(ctx.sender) ? '' : ctx.senderNumber

    if (!/^\d{8,15}$/.test(number)) {
      return ctx.reply(`No pude detectar tu número. Usa: ${ctx.prefix}${ctx.command} 5210000000000`)
    }

    if (number === jidNumber(ctx.sock.user?.id)) return ctx.reply('Ese es el número del bot principal.')

    if (isJadibotActive(number)) {
      return ctx.reply(`Ese número ya tiene un sub-bot. Usa ${ctx.prefix}stopjadibot para quitarlo.`)
    }

    await ctx.reply('Generando tu código de emparejamiento...')

    await startJadibot(number, {
      onCode: async code => {
        await ctx.reply(
          [
            '*Vincula tu sub-bot*',
            '1. Abre WhatsApp > Dispositivos vinculados',
            '2. Vincular con el número de teléfono',
            '3. Escribe el código de abajo',
            'El código dura pocos minutos.'
          ].join('\n')
        )
        await ctx.send(code)
      },
      onFail: () => {
        ctx.reply('No se completó la vinculación. Usa el comando de nuevo para pedir otro código.').catch(() => {})
      }
    })
  }
}
