import { currency as monedas, economyGate, getChatUser, nameOf, pickTarget, setChatUser } from '../../utils/economy.js'

export default {
  name: 'givecoins',
  aliases: ['pay', 'coinsgive'],
  description: 'Dar coins a un usuario.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { chat, senderNumber: me, args, prefix, command } = ctx
    const picked = await pickTarget(ctx)
    const typed = args[1] ? args[1].replace(/[@ .+-]/g, '') : ''
    const who = picked?.number || typed || null
    if (!who) {
      return ctx.reply(`❀ Debes mencionar a quien quieras transferir *${monedas}*.\n> Ejemplo » *${prefix + command} 25000 @mencion*`)
    }
    const senderData = getChatUser(chat, me)
    const targetData = getChatUser(chat, who)
    const cantidadInput = args[0]?.toLowerCase()
    const cantidad = cantidadInput === 'all' ? senderData.bank : parseInt(cantidadInput)
    if (!cantidadInput || isNaN(cantidad) || cantidad <= 0) {
      return ctx.reply(`ꕥ Ingresa una cantidad válida de *${monedas}* para transferir.`)
    }
    if (senderData.bank < cantidad) {
      return ctx.reply(`ꕥ No tienes suficientes *${monedas}* en el banco para transferir.\n> Tu saldo actual: *¥${senderData.bank.toLocaleString()} ${monedas}*`)
    }
    setChatUser(chat, me, 'bank', senderData.bank - cantidad)
    setChatUser(chat, who, 'bank', (targetData.bank || 0) + cantidad)
    const jid = picked?.jid || `${who}@s.whatsapp.net`
    await ctx.reply({
      text: `❀ Transferiste *¥${cantidad.toLocaleString()} ${monedas}* a *${nameOf(who)}*\n> Ahora tienes *¥${(senderData.bank - cantidad).toLocaleString()} ${monedas}* en tu banco.`,
      mentions: [jid]
    })
  }
}
