import config from '../../../config.js'
import { currency as monedas, economyGate, getChatUser, setChatUser } from '../../utils/economy.js'

const determineWinner = (user, bot) => {
  if (user === bot) return 'tie'
  if ((user === 'piedra' && bot === 'tijera') || (user === 'papel' && bot === 'piedra') || (user === 'tijera' && bot === 'papel')) {
    return 'win'
  }
  return 'lose'
}

const msToTime = duration => {
  const seconds = Math.floor((duration / 1000) % 60)
  const minutes = Math.floor((duration / (1000 * 60)) % 60)
  return `${minutes} minuto${minutes !== 1 ? 's' : ''}, ${seconds} segundo${seconds !== 1 ? 's' : ''}`
}

export default {
  name: 'ppt',
  description: 'Jugar piedra, papel o tijera con el bot.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { chat, senderNumber: me, args, prefix, command } = ctx
    const botname = config.botName
    const user = getChatUser(chat, me)
    const remainingTime = user.lastppt - Date.now()
    if (remainingTime > 0) {
      return ctx.reply(`ꕥ Debes esperar *${msToTime(remainingTime)}* antes de jugar nuevamente.`)
    }
    const options = ['piedra', 'papel', 'tijera']
    const userChoice = args[0]?.trim().toLowerCase()
    if (!options.includes(userChoice)) {
      return ctx.reply(`《✧》 Usa el comando así:\n› *${prefix + command} piedra*, *papel* o *tijera*`)
    }
    const botChoice = options[Math.floor(Math.random() * options.length)]
    const result = determineWinner(userChoice, botChoice)
    const reward = Math.floor(Math.random() * (5500 - 3000 + 1)) + 3000
    const loss = Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000
    const tieReward = Math.floor(Math.random() * (1500 - 800 + 1)) + 800
    let newCoins = user.coins || 0
    let newBank = user.bank || 0
    if (result === 'win') {
      newCoins += reward
      setChatUser(chat, me, 'coins', newCoins)
      await ctx.reply(`ꕥ Ganaste.\n\n> ✿ *Tu elección ›* ${userChoice}\n> ✿ *${botname} eligió ›* ${botChoice}\n> ✿ *${monedas} ›* ¥${reward.toLocaleString()}`)
    } else if (result === 'lose') {
      const total = newCoins + newBank
      const actualLoss = Math.min(loss, total)
      if (newCoins >= actualLoss) {
        newCoins -= actualLoss
        setChatUser(chat, me, 'coins', newCoins)
      } else {
        const remaining = actualLoss - newCoins
        newCoins = 0
        newBank = Math.max(0, newBank - remaining)
        setChatUser(chat, me, 'coins', 0)
        setChatUser(chat, me, 'bank', newBank)
      }
      await ctx.reply(`ꕥ Perdiste.\n\n> ✿ *Tu elección ›* ${userChoice}\n> ✿ *${botname} eligió ›* ${botChoice}\n> ✿ *${monedas} ›* -¥${actualLoss.toLocaleString()}`)
    } else {
      newCoins += tieReward
      setChatUser(chat, me, 'coins', newCoins)
      await ctx.reply(`ꕥ Empate.\n\n> ✿ *Tu elección ›* ${userChoice}\n> ✿ *${botname} eligió ›* ${botChoice}\n> ✿ *${monedas} ›* +¥${tieReward.toLocaleString()}`)
    }
    setChatUser(chat, me, 'lastppt', Date.now() + 1 * 60 * 1000)
  }
}
