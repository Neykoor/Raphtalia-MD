import { currency, economyGate, getChatUser, getGlobal, setChatUser, setGlobal } from '../../utils/economy.js'

const formatTime = t => {
  const d = Math.floor(t / 86400)
  const h = Math.floor((t % 86400) / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  if (d) return `${d} día${d !== 1 ? 's' : ''} ${h} hora${h !== 1 ? 's' : ''} ${m} minuto${m !== 1 ? 's' : ''}`
  if (h) return `${h} hora${h !== 1 ? 's' : ''} ${m} minuto${m !== 1 ? 's' : ''} ${s} segundo${s !== 1 ? 's' : ''}`
  if (m) return `${m} minuto${m !== 1 ? 's' : ''} ${s} segundo${s !== 1 ? 's' : ''}`
  return `${s} segundo${s !== 1 ? 's' : ''}`
}

export default {
  name: 'monthly',
  aliases: ['mensual'],
  description: 'Reclamar tu recompensa mensual.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { chat, senderNumber: me } = ctx
    const users = getGlobal(me)
    const user = getChatUser(chat, me)
    const gap = 30 * 24 * 60 * 60 * 1000
    const now = Date.now()
    if (now < user.lastmonthly) {
      const wait = formatTime(Math.floor((user.lastmonthly - now) / 1000))
      return ctx.reply(`ꕥ Ya has reclamado tu recompensa mensual.\n> Puedes reclamarlo de nuevo en *${wait}*`)
    }
    let currentStreak = users.monthlyStreak
    const lost = users.monthlyStreak >= 1 && now - users.lastMonthlyGlobal > gap * 1.5
    if (lost) {
      currentStreak = 0
      setGlobal(me, 'monthlyStreak', 0)
    }
    const canClaimGlobal = now - users.lastMonthlyGlobal >= gap
    if (canClaimGlobal) {
      currentStreak = Math.min(currentStreak + 1, 8)
      setGlobal(me, 'monthlyStreak', currentStreak)
      setGlobal(me, 'lastMonthlyGlobal', now)
    }
    const coins = Math.min(60000 + (currentStreak - 1) * 5000, 95000)
    setChatUser(chat, me, 'coins', (user.coins || 0) + coins)
    setChatUser(chat, me, 'lastmonthly', now + gap)
    const next = Math.min(60000 + currentStreak * 5000, 95000).toLocaleString()
    let caption = `> Mes *${currentStreak + 1}* » *+${next}*`
    if (lost) caption += '\n> ☆ ¡Has perdido tu racha de meses!'
    await ctx.reply(`「❁」 Has reclamado tu recompensa mensual de *+${coins.toLocaleString()} ${currency}* (Mes *${currentStreak}*)\n${caption}`)
  }
}
