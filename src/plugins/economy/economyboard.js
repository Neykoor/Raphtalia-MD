import { currency as monedas, economyGate, getChatUsers } from '../../utils/economy.js'
import { getUser } from '../../utils/profiles.js'

export default {
  name: 'economyboard',
  aliases: ['eboard', 'baltop'],
  description: 'Ver el ranking de usuarios con más coins.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { args, prefix, command } = ctx
    try {
      const users = []
      for (const userData of getChatUsers(ctx.chat).slice(0, 1000)) {
        const total = (userData.coins || 0) + (userData.bank || 0)
        if (total >= 1000) users.push({ ...userData, name: getUser(userData.number)?.name || 'Usuario' })
      }
      if (users.length === 0) {
        return ctx.reply(`ꕥ No hay usuarios en el grupo con más de 1,000 ${monedas}.`)
      }
      const sorted = users.sort((a, b) => (b.coins || 0) + (b.bank || 0) - ((a.coins || 0) + (a.bank || 0)))
      const page = parseInt(args[0]) || 1
      const pageSize = 10
      const totalPages = Math.ceil(sorted.length / pageSize)
      if (isNaN(page) || page < 1 || page > totalPages) {
        return ctx.reply(`《✧》 La página *${page}* no existe. Hay *${totalPages}* páginas.`)
      }
      const start = (page - 1) * pageSize
      const end = start + pageSize
      let text = '*✩ EconomyBoard (✿◡‿◡)*\n\n'
      text += sorted
        .slice(start, end)
        .map(({ name, coins, bank }, i) => {
          const total = (coins || 0) + (bank || 0)
          return `✩ ${start + i + 1} › *${name}*\n     Total → *¥${total.toLocaleString()} ${monedas}*`
        })
        .join('\n')
      text += `\n\n> ⌦ Página *${page}* de *${totalPages}*`
      if (page < totalPages) {
        text += `\n> Para ver la siguiente página › *${prefix + command} ${page + 1}*`
      }
      await ctx.reply(text)
    } catch (e) {
      await ctx.reply(`> An unexpected error occurred while executing command *${prefix + command}*. Please try again or contact support if the issue persists.\n> [Error: *${e.message}*]`)
    }
  }
}
