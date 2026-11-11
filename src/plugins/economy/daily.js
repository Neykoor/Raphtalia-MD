import { currency as monedas, economyGate, getChatUser, getGlobal, setChatUser, setGlobal } from '../../utils/economy.js'

const formatRemainingTime = ms => {
  const s = Math.floor(ms / 1000)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const seg = s % 60
  const partes = []
  if (h) partes.push(`${h} ${h === 1 ? 'hora' : 'horas'}`)
  if (m) partes.push(`${m} ${m === 1 ? 'minuto' : 'minutos'}`)
  if (seg || partes.length === 0) partes.push(`${seg} ${seg === 1 ? 'segundo' : 'segundos'}`)
  return partes.join(' ')
}

export default {
  name: 'daily',
  aliases: ['diario'],
  description: 'Reclamar tu recompensa diaria.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { chat, senderNumber: me } = ctx
    const users = getGlobal(me)
    const user = getChatUser(chat, me)
    const now = Date.now()
    const oneDay = 24 * 60 * 60 * 1000
    const maxStreak = 200
    if (now < user.lastdaily) {
      const restante = formatRemainingTime(user.lastdaily - now)
      return ctx.reply(`ꕥ Ya has reclamado tu *Daily* de hoy.\n> Puedes reclamarlo de nuevo en *${restante}*`)
    }
    let currentStreak = users.streak
    const lost = users.streak >= 1 && now - users.lastDailyGlobal > oneDay * 1.5
    if (lost) {
      currentStreak = 0
      setGlobal(me, 'streak', 0)
    }
    const canClaimGlobal = now - users.lastDailyGlobal >= oneDay
    if (canClaimGlobal) {
      currentStreak = Math.min(currentStreak + 1, maxStreak)
      setGlobal(me, 'streak', currentStreak)
      setGlobal(me, 'lastDailyGlobal', now)
    }
    const recompensa = Math.min(20000 + (currentStreak - 1) * 5000, 1015000)
    setChatUser(chat, me, 'coins', (user.coins || 0) + recompensa)
    setChatUser(chat, me, 'lastdaily', now + oneDay)
    const siguiente = Math.min(20000 + currentStreak * 5000, 1015000).toLocaleString()
    let caption = `> Día *${currentStreak + 1}* » *+¥${siguiente}*`
    if (lost) caption += '\n> ☆ ¡Has perdido tu racha de días!'
    await ctx.reply(`「✿」Has reclamado tu recompensa diaria de *¥${recompensa.toLocaleString()} ${monedas}*! (Día *${currentStreak}*)\n${caption}`)
  }
}
