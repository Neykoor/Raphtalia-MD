import { currency, economyGate, getChatUser, setChatUser } from '../../utils/economy.js'

export default {
  name: 'withdraw',
  aliases: ['with', 'retirar'],
  description: 'Retirar tus coins del banco.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { chat, senderNumber: me, args, prefix, command } = ctx
    const user = getChatUser(chat, me)
    if (!args[0]) {
      return ctx.reply(`《✧》 Ingresa la cantidad de *${currency}* que quieras retirar.`)
    }
    if (args[0].toLowerCase() === 'all') {
      if ((user.bank || 0) <= 0) {
        return ctx.reply(`No tienes suficientes *${currency}* en tu Banco para poder retirar.`)
      }
      const amount = user.bank
      setChatUser(chat, me, 'bank', 0)
      setChatUser(chat, me, 'coins', (user.coins || 0) + amount)
      return ctx.reply(`✎ Has retirado *¥${amount.toLocaleString()} ${currency}* del banco, ahora podras usarlo pero tambien podran robartelo.`)
    }
    const count = parseInt(args[0])
    if (isNaN(count) || count < 1) {
      return ctx.reply(`《✧》 Debes retirar una cantidad válida.\n > Ejemplo 1 » *${prefix + command} ¥25000*\n> Ejemplo 2 » *${prefix + command} all*`)
    }
    if ((user.bank || 0) < count) {
      return ctx.reply(`《✧》 No tienes suficientes *${currency}* en tu banco para retirar esa cantidad.\n> Solo tienes *¥${user.bank.toLocaleString()} ${currency}* en tu cuenta.`)
    }
    setChatUser(chat, me, 'bank', user.bank - count)
    setChatUser(chat, me, 'coins', (user.coins || 0) + count)
    await ctx.reply(`✎ Has retirado *¥${count.toLocaleString()} ${currency}* del banco, ahora podras usarlo pero tambien podran robartelo.`)
  }
}
