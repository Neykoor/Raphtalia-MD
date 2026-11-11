import { currency as monedas, economyGate, getChatUser, setChatUser } from '../../utils/economy.js'

export default {
  name: 'dep',
  aliases: ['deposit', 'd', 'depositar'],
  description: 'Depositar tus coins en el banco.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { chat, senderNumber: me, args } = ctx
    const user = getChatUser(chat, me)
    if (!args[0]) {
      return ctx.reply(`《✧》 Ingresa la cantidad de *${monedas}* que quieras *depositar*.`)
    }
    if (args[0] < 1 && args[0].toLowerCase() !== 'all') {
      return ctx.reply('✎ Ingresa una cantidad *válida* para depositar')
    }
    if (args[0].toLowerCase() === 'all') {
      if (user.coins <= 0) return ctx.reply(`✎ No tienes *${monedas}* para depositar en tu *banco*`)
      const count = user.coins
      setChatUser(chat, me, 'coins', 0)
      setChatUser(chat, me, 'bank', (user.bank || 0) + count)
      return ctx.reply(`ꕥ Has depositado *¥${count.toLocaleString()} ${monedas}* en tu Banco`)
    }
    if (!Number(args[0]) || parseInt(args[0]) < 1) {
      return ctx.reply('《✧》 Ingresa una cantidad *válida* para depositar')
    }
    const count = parseInt(args[0])
    if (user.coins <= 0 || user.coins < count) {
      return ctx.reply(`❀ No tienes suficientes *${monedas}* para depositar`)
    }
    setChatUser(chat, me, 'coins', (user.coins || 0) - count)
    setChatUser(chat, me, 'bank', (user.bank || 0) + count)
    await ctx.reply(`ꕥ Has depositado *¥${count.toLocaleString()} ${monedas}* en tu Banco`)
  }
}
