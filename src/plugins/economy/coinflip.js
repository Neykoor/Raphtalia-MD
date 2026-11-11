import { currency as monedas, economyGate, getChatUser, setChatUser } from '../../utils/economy.js'

const msToTime = duration => {
  const seconds = Math.floor(duration / 1000)
  return `${seconds} segundo${seconds !== 1 ? 's' : ''}`
}

const capitalize = txt => txt.charAt(0).toUpperCase() + txt.slice(1)

export default {
  name: 'cf',
  aliases: ['flip', 'coinflip'],
  description: 'Apostar coins en un cara o cruz.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { chat, senderNumber: me, args, prefix, command } = ctx
    const user = getChatUser(chat, me)
    const cooldown = 10 * 1000
    if (Date.now() < user.lastcoinflip) {
      const restante = user.lastcoinflip - Date.now()
      return ctx.reply(`ꕥ Debes esperar *${msToTime(restante)}* antes de volver a usar ${command}.`)
    }
    let cantidad, eleccion
    const a0 = parseFloat(args[0])
    const a1 = parseFloat(args[1])
    if (!isNaN(a0)) {
      cantidad = a0
      eleccion = (args[1] || '').toLowerCase()
    } else if (!isNaN(a1)) {
      cantidad = a1
      eleccion = (args[0] || '').toLowerCase()
    } else {
      return ctx.reply(`ꕥ Cantidad inválida, ingresa un número válido.\n> Ejemplo » *${prefix + command} 200 cara* o *${prefix + command} cruz 200*`)
    }
    if (Math.abs(cantidad) < 100) {
      return ctx.reply(`ꕥ La cantidad mínima para apostar es *100 ${monedas}*.`)
    }
    if (!['cara', 'cruz'].includes(eleccion)) {
      return ctx.reply(`ꕥ Elección inválida. Solo se admite *cara* o *cruz*.\n> Ejemplo » *${prefix + command} 200 cara*`)
    }
    if (cantidad > user.coins) {
      return ctx.reply(`ꕥ No tienes suficientes *${monedas}* fuera del banco para apostar, tienes *¥${user.coins.toLocaleString()} ${monedas}*.`)
    }
    setChatUser(chat, me, 'lastcoinflip', Date.now() + cooldown)
    const resultado = Math.random() < 0.5 ? 'cara' : 'cruz'
    const acierto = resultado === eleccion
    const cambio = acierto ? cantidad : -cantidad
    const newCoins = (user.coins || 0) + cambio
    setChatUser(chat, me, 'coins', newCoins < 0 ? 0 : newCoins)
    await ctx.reply(
      `「✿」La moneda ha caído en *${capitalize(resultado)}* y has ${acierto ? 'ganado' : 'perdido'} *¥${Math.abs(cambio).toLocaleString()} ${monedas}*!\n> Tu elección fue *${capitalize(eleccion)}*`
    )
  }
}
