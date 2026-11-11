import { delay } from 'baileys'
import { currency, economyGate, getChatUser, setChatUser } from '../../utils/economy.js'

const formatTime = ms => {
  const totalSec = Math.ceil(ms / 1000)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  const parts = []
  if (minutes > 0) parts.push(`${minutes} minuto${minutes !== 1 ? 's' : ''}`)
  parts.push(`${seconds} segundo${seconds !== 1 ? 's' : ''}`)
  return parts.join(' ')
}

const emojis = ['✾', '❃', '❁']

const getRandomEmojis = () => {
  const row = () => Array.from({ length: 3 }, () => emojis[Math.floor(Math.random() * emojis.length)])
  return { x: row(), y: row(), z: row() }
}

const board = (x, y, z) => `「✿」| *SLOTS* 
────────
${x[0]} : ${y[0]} : ${z[0]}
${x[1]} : ${y[1]} : ${z[1]}
${x[2]} : ${y[2]} : ${z[2]}
────────`

export default {
  name: 'slot',
  description: 'Apostar coins en el casino.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { chat, senderNumber: me, args, prefix, command } = ctx
    const user = getChatUser(chat, me)
    if (!args[0] || isNaN(args[0]) || parseInt(args[0]) <= 0) {
      return ctx.reply('❀ Por favor, ingresa la cantidad que deseas apostar.')
    }
    const apuesta = parseInt(args[0])
    if (Date.now() - user.lastslot < 30000) {
      const restante = user.lastslot + 30000 - Date.now()
      return ctx.reply(`ꕥ Debes esperar *${formatTime(restante)}* para usar *${prefix + command}* nuevamente.`)
    }
    if (apuesta < 100) {
      return ctx.reply(`ꕥ El mínimo para apostar es de 100 *${currency}*.`)
    }
    if (user.coins < apuesta) {
      return ctx.reply(`ꕥ Tus *${currency}* no son suficientes para apostar esa cantidad.`)
    }
    const { key } = await ctx.reply('「✿」| *SLOTS* \n────────\n')
    for (let i = 0; i < 5; i++) {
      const { x, y, z } = getRandomEmojis()
      await ctx.reply({ text: board(x, y, z), edit: key })
      await delay(300)
    }
    const { x, y, z } = getRandomEmojis()
    let resultado
    let newCoins = user.coins
    if (x[0] === y[0] && y[0] === z[0]) {
      resultado = `❀ Ganaste! *¥${(apuesta * 2).toLocaleString()} ${currency}*.`
      newCoins += apuesta
    } else if (x[0] === y[0] || x[0] === z[0] || y[0] === z[0]) {
      resultado = `❀ Casi lo logras. *Toma ¥10 ${currency}* por intentarlo.`
      newCoins += 10
    } else {
      resultado = `❀ Perdiste *¥${apuesta.toLocaleString()} ${currency}*.`
      newCoins -= apuesta
    }
    setChatUser(chat, me, 'lastslot', Date.now())
    setChatUser(chat, me, 'coins', newCoins)
    await ctx.reply({ text: `${board(x, y, z)}\n${resultado}`, edit: key })
  }
}
