import config from '../../../config.js'
import { isJadibotActive, startJadibot } from '../../core/jadibot.js'
import { isLidJid, jidNumber } from '../../utils/jid.js'
import log from '../../utils/logger.js'

const cooldowns = new Map()

const failMessages = {
  ratelimit: 'WhatsApp limitó los códigos de vinculación. Espera unos minutos e inténtalo de nuevo.',
  main: 'Ese número es el del bot principal, no puede ser un sub-bot.',
  duplicate: 'Esa cuenta ya tiene un sub-bot activo.',
  error: 'No pude generar el código. Intenta de nuevo en unos segundos.'
}

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

    const left = (cooldowns.get(number) ?? 0) + config.jadibotCodeCooldownMs - Date.now()

    if (left > 0 && !ctx.isOwner) {
      return ctx.reply(`Espera ${Math.ceil(left / 1000)}s antes de pedir otro código.`)
    }

    cooldowns.set(number, Date.now())
    if (cooldowns.size > 500) cooldowns.delete(cooldowns.keys().next().value)

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
        onFail: reason => {
          const text =
            failMessages[reason] ?? `No se completó la vinculación. Usa ${ctx.prefix}${ctx.command} de nuevo para pedir otro código.`
          ctx.reply(text).catch(() => {})
        }
      })
    } catch (error) {
      log.error(`No se pudo generar el código del jadibot ${number}:`, error?.message ?? error)
      await ctx.reply('No pude generar el código. Intenta de nuevo en unos segundos.').catch(() => {})
    }
  }
}
