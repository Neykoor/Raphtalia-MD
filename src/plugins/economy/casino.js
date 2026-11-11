import { delay } from 'baileys'
import config from '../../../config.js'
import { currency, economyGate, getChatUser, nameOf, setChatUser } from '../../utils/economy.js'

const formatNumber = number => number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const formatTime = ms => {
  if (ms <= 0 || isNaN(ms)) return 'Ahora'
  const totalSec = Math.ceil(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  const partes = []
  if (min) partes.push(`${min} minuto${min !== 1 ? 's' : ''}`)
  partes.push(`${sec} segundo${sec !== 1 ? 's' : ''}`)
  return partes.join(' ')
}

export default {
  name: 'apostar',
  aliases: ['casino'],
  description: 'Apostar coins en el casino.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { chat, senderNumber: me, args, prefix, command } = ctx
    const botname = config.botName
    const user = getChatUser(chat, me)
    const Aku = Math.floor(Math.random() * 101)
    const Kamu = Math.floor(Math.random() * 55)
    const userName = nameOf(me)
    const tiempoEspera = 30 * 1000
    const ahora = Date.now()
    if (user.lastApuesta && ahora - user.lastApuesta < tiempoEspera) {
      const restante = user.lastApuesta + tiempoEspera - ahora
      return ctx.reply(`ꕥ Debes esperar *${formatTime(restante)}* para usar *${prefix + command}* nuevamente.`)
    }
    setChatUser(chat, me, 'lastApuesta', ahora)
    let count = args[0]
    if (count && /all/i.test(count)) {
      count = user.coins
    } else if (args[0]) {
      count = parseInt(args[0])
    } else {
      count = 1
    }
    count = Math.max(1, count)
    if (args.length < 1) {
      return ctx.reply(`❀ Ingresa la cantidad de *${currency}* que deseas aportar contra *${botname}*\n> Ejemplo: *${prefix + command} 100*`)
    }
    if (user.coins >= count) {
      setChatUser(chat, me, 'coins', user.coins - count)
      let resultado = ''
      let ganancia = 0
      if (Aku > Kamu) {
        resultado = `> ${userName}, *Perdiste ¥${formatNumber(count)} ${currency}*.`
      } else if (Aku < Kamu) {
        ganancia = count * 2
        setChatUser(chat, me, 'coins', user.coins - count + ganancia)
        resultado = `> ${userName}, *Ganaste ¥${formatNumber(ganancia)} ${currency}*.`
      } else {
        ganancia = count
        setChatUser(chat, me, 'coins', user.coins - count + ganancia)
        resultado = `> ${userName}, *Ganaste ¥${formatNumber(ganancia)} ${currency}*.`
      }
      const { key } = await ctx.reply('🎲 El crupier lanza los dados... ¡Las apuestas están cerradas!')
      await delay(2000)
      await ctx.reply({ text: '❀ Los números están girando... ¡Prepárate para el resultado!', edit: key })
      await delay(2000)
      const replyMsg = `❀ \`Veamos qué números tienen!\`\n\n➠ *${botname}* : ${Aku}\n➠ *${userName}* : ${Kamu}\n\n${resultado}`
      await ctx.reply({ text: replyMsg.trim(), edit: key })
    } else {
      await ctx.reply(`ꕥ No tienes *¥${formatNumber(count)} ${currency}* para apostar!`)
    }
  }
}
