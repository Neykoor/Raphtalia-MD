import { currency, economyGate, getChatUser, setChatUser } from '../../utils/economy.js'

const msToTime = duration => {
  const seconds = Math.floor(duration / 1000)
  return `${seconds} segundo${seconds !== 1 ? 's' : ''}`
}

export default {
  name: 'rt',
  aliases: ['roulette', 'ruleta'],
  description: 'Apostar coins en una ruleta.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { chat, senderNumber: me, args } = ctx
    const user = getChatUser(chat, me)
    const cooldown = 30 * 1000
    if (Date.now() < user.lastroulette) {
      const restante = user.lastroulette - Date.now()
      return ctx.reply(`ꕥ Debes esperar *${msToTime(restante)}* antes de volver a usar rt.`)
    }
    if (args.length < 2) {
      return ctx.reply(`《✧》 Debes ingresar una cantidad de ${currency} y apostar a un color.`)
    }
    let amount, color
    if (!isNaN(parseInt(args[0]))) {
      amount = parseInt(args[0])
      color = args[1].toLowerCase()
    } else if (!isNaN(parseInt(args[1]))) {
      color = args[0].toLowerCase()
      amount = parseInt(args[1])
    } else {
      return ctx.reply('《✧》 Formato inválido. Ejemplo: *rt 2000 black* o *rt black 2000*')
    }
    const validColors = ['red', 'black', 'green']
    if (isNaN(amount) || amount < 200) {
      return ctx.reply(`《✧》 La cantidad mínima de ${currency} a apostar es 200.`)
    }
    if (!validColors.includes(color)) {
      return ctx.reply('《✧》 Por favor, elige un color válido: red, black, green.')
    }
    if (user.coins < amount) {
      return ctx.reply(`《✧》 No tienes suficientes *${currency}* para hacer esta apuesta.`)
    }
    setChatUser(chat, me, 'lastroulette', Date.now() + cooldown)
    const random = Math.floor(Math.random() * 37)
    let resultColor
    if (random < 9) {
      resultColor = 'green'
    } else if (random < 23) {
      resultColor = 'red'
    } else {
      resultColor = 'black'
    }
    if (resultColor === color) {
      const reward = amount * (resultColor === 'green' ? 5 : 2)
      setChatUser(chat, me, 'coins', (user.coins || 0) + reward)
      await ctx.reply({ text: `「✿」 La ruleta salió en *${resultColor}* y has ganado *¥${reward.toLocaleString()} ${currency}*.`, mentions: [ctx.sender] })
    } else {
      setChatUser(chat, me, 'coins', (user.coins || 0) - amount)
      await ctx.reply({ text: `「✿」 La ruleta salió en *${resultColor}* y has perdido *¥${amount.toLocaleString()} ${currency}*.`, mentions: [ctx.sender] })
    }
  }
}
