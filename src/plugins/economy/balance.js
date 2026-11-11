import { currency as monedas, economyGate, getChatUser, nameOf, pickTarget } from '../../utils/economy.js'

export default {
  name: 'balance',
  aliases: ['bal', 'coins', 'bank'],
  description: 'Ver cuantos coins tienes.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const target = await pickTarget(ctx)
    const who = target?.number || ctx.senderNumber
    const user = getChatUser(ctx.chat, who)
    const total = (user.coins || 0) + (user.bank || 0)
    const bal = `✿ Usuario \`<${nameOf(who)}>\`

⛀ Cartera › *¥${user.coins?.toLocaleString() || 0} ${monedas}*
⚿ Banco › *¥${user.bank?.toLocaleString() || 0} ${monedas}*
⛁ Total › *¥${total.toLocaleString()} ${monedas}*

> _Para proteger tu dinero, ¡depósitalo en el banco usando ${ctx.prefix}deposit!_`
    await ctx.reply(bal)
  }
}
