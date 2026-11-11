import { currency, economyGate, getChatUser, nameOf, pickTarget, setChatUser } from '../../utils/economy.js'

const formatTime = ms => {
  const totalSec = Math.ceil(ms / 1000)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  const parts = []
  if (hours) parts.push(`${hours} hora${hours !== 1 ? 's' : ''}`)
  if (minutes) parts.push(`${minutes} minuto${minutes !== 1 ? 's' : ''}`)
  parts.push(`${seconds} segundo${seconds !== 1 ? 's' : ''}`)
  return parts.join(' ')
}

export default {
  name: 'robar',
  aliases: ['steal', 'rob'],
  description: 'Intentar robar coins a un usuario.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { chat, senderNumber: me, prefix, command } = ctx
    const user = getChatUser(chat, me)
    if (Date.now() < user.laststeal) {
      const restante = user.laststeal - Date.now()
      return ctx.reply(`ꕥ Debes esperar *${formatTime(restante)}* para usar *${prefix + command}* de nuevo.`)
    }
    const picked = await pickTarget(ctx)
    if (!picked) {
      return ctx.reply('❀ Debes mencionar a alguien para intentar robarle.')
    }
    const who = picked.number
    const target = getChatUser(chat, who)
    const name = nameOf(who)
    const lastCmd = target.lastCmd || 0
    const tiempoInactivo = Date.now() - lastCmd
    if (tiempoInactivo < 3600000) {
      return ctx.reply(`ꕥ Solo puedes robarle *${currency}* a un usuario si estuvo más de 1 hora inactivo.`)
    }
    const chance = Math.random()
    if (chance < 0.3) {
      let loss = Math.floor(Math.random() * (5000 - 2000 + 1)) + 2000
      const total = (user.coins || 0) + (user.bank || 0)
      if (total >= loss) {
        if (user.coins >= loss) {
          setChatUser(chat, me, 'coins', (user.coins || 0) - loss)
        } else {
          const restanteLoss = loss - (user.coins || 0)
          setChatUser(chat, me, 'coins', 0)
          setChatUser(chat, me, 'bank', Math.max(0, (user.bank || 0) - restanteLoss))
        }
      } else {
        loss = total
        setChatUser(chat, me, 'coins', 0)
        setChatUser(chat, me, 'bank', 0)
      }
      setChatUser(chat, me, 'laststeal', Date.now() + 3600000)
      return ctx.reply(`ꕥ El robo salió mal y perdiste *¥${loss.toLocaleString()} ${currency}*.`)
    }
    const rob = Math.floor(Math.random() * (9000 - 3000 + 1)) + 3000
    if ((target.coins || 0) < rob) {
      return ctx.reply({
        text: `ꕥ *${name}* no tiene suficientes *${currency}* fuera del banco como para que valga la pena intentar robar.`,
        mentions: [picked.jid]
      })
    }
    setChatUser(chat, me, 'coins', (user.coins || 0) + rob)
    setChatUser(chat, who, 'coins', (target.coins || 0) - rob)
    setChatUser(chat, me, 'laststeal', Date.now() + 3600000)
    await ctx.reply({ text: `❀ Le robaste *¥${rob.toLocaleString()} ${currency}* a *${name}*`, mentions: [picked.jid] })
  }
}
