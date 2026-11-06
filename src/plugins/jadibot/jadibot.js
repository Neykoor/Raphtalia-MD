import { isJadibotActive, startJadibot } from '../../core/jadibot.js'
import { isLidJid, jidNumber } from '../../utils/jid.js'
import log from '../../utils/logger.js'

export default {
  name: 'jadibot',
  aliases: ['code', 'serbot', 'subbot'],
  description: 'Vincula tu número como sub-bot con un código',
  run: async ctx => {
    if (ctx.sock.isJadibot) return ctx.reply('Este comando solo se usa desde el bot principal.')

    const typed = (ctx.args[0] || '').replace(/\D/g, '')
    const own = isLidJid(ctx.sender) ? '' : ctx.senderNumber
    const number = typed && (ctx.isOwner || !own) ? typed : own

    if (!/^\d{8,15}$/.test(number)) {
      return ctx.reply(`No pude detectar tu número. Usa: ${ctx.prefix}${ctx.command} 5210000000000`)
    }

    if (number === jidNumber(ctx.sock.user?.id)) return ctx.reply('Ese es el número del bot principal.')

    if (isJadibotActive(number)) {
      return ctx.reply(`Ese número ya tiene un sub-bot. Usa ${ctx.prefix}stopjadibot para quitarlo.`)
    }

    await ctx.reply('Generando tu código de emparejamiento...')

    try {
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
        onLinked: () => ctx.reply('Sub-bot vinculado y conectado correctamente ✓').catch(() => {}),
        onFail: () => {
          ctx.reply(`No se completó la vinculación. Usa ${ctx.prefix}${ctx.command} de nuevo para pedir otro código.`).catch(() => {})
        }
      })
    } catch (error) {
      log.error(`No se pudo generar el código del jadibot ${number}:`, error?.message ?? error)
      await ctx.reply('No pude generar el código. Intenta de nuevo en unos segundos.').catch(() => {})
    }
  }
}
