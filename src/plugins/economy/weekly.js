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
  name: 'weekly',
  aliases: ['semanal'],
  description: 'Reclamar tu recompensa semanal.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { chat, senderNumber: me } = ctx
    const users = getGlobal(me)
    const user = getChatUser(chat, me)
    const gap = 7 * 24 * 60 * 60 * 1000
    const now = Date.now()
    if (now < user.lastweekly) {
      const wait = formatTime(Math.floor((user.lastweekly - now) / 1000))
      return ctx.reply(`ꕥ Ya has reclamado tu recompensa semanal.\n> Puedes reclamarlo de nuevo en *${wait}*`)
    }
    let currentStreak = users.weeklyStreak
    const lost = users.weeklyStreak >= 1 && now - users.lastWeeklyGlobal > gap * 1.5
    if (lost) {
      currentStreak = 0
      setGlobal(me, 'weeklyStreak', 0)
    }
    const canClaimWeeklyGlobal = now - users.lastWeeklyGlobal >= gap
    if (canClaimWeeklyGlobal) {
      currentStreak = Math.min(currentStreak + 1, 30)
      setGlobal(me, 'weeklyStreak', currentStreak)
      setGlobal(me, 'lastWeeklyGlobal', now)
    }
    const coins = Math.min(40000 + (currentStreak - 1) * 5000, 185000)
    setChatUser(chat, me, 'coins', (user.coins || 0) + coins)
    setChatUser(chat, me, 'lastweekly', now + gap)
    const nextReward = Math.min(40000 + currentStreak * 5000, 185000).toLocaleString()
    let caption = `> Semana *${currentStreak + 1}* » *+¥${nextReward}*`
    if (lost) caption += '\n> ☆ ¡Has perdido tu racha de semanas!'
    await ctx.reply(`「❁」 Has reclamado tu recompensa semanal de *¥${coins.toLocaleString()} ${currency}* (Semana *${currentStreak}*)\n${caption}`)
  }
}
