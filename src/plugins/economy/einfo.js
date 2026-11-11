import { currency, economyGate, getChatUser, nameOf } from '../../utils/economy.js'

const formatTime = ms => {
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts = []
  if (days > 0) parts.push(`${days} d`)
  if (hours > 0) parts.push(`${hours} h`)
  if (minutes > 0) parts.push(`${minutes} m`)
  if (seconds > 0) parts.push(`${seconds} s`)
  return parts.length ? parts.join(', ') : 'Ahora.'
}

export default {
  name: 'einfo',
  aliases: ['infoeconomy', 'cooldowns', 'economyinfo'],
  description: 'Ver tu información de economía y cooldowns.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const user = getChatUser(ctx.chat, ctx.senderNumber)
    const now = Date.now()
    const left = field => Math.max(0, (user[field] || 0) - now)
    const cooldowns = {
      crime: left('lastcrime'),
      mine: left('lastmine'),
      ritual: left('lastinvoke'),
      work: left('lastwork'),
      slut: left('lastslut'),
      steal: left('laststeal'),
      hunt: left('lasthunt'),
      fish: left('lastfish'),
      coffer: left('lastcoffer'),
      dungeon: left('lastdungeon'),
      adventure: left('lastadventure'),
      daily: left('lastdaily'),
      weekly: left('lastweekly'),
      monthly: left('lastmonthly')
    }
    const coins = user.coins || 0
    const name = nameOf(ctx.senderNumber)
    const mensaje = `✿ Usuario \`<${name}>\`

ⴵ Work » *${formatTime(cooldowns.work)}*
ⴵ Slut » *${formatTime(cooldowns.slut)}*
ⴵ Crime » *${formatTime(cooldowns.crime)}*
ⴵ Mine » *${formatTime(cooldowns.mine)}*
ⴵ Ritual » *${formatTime(cooldowns.ritual)}*
ⴵ Fish » *${formatTime(cooldowns.fish)}*
ⴵ Hunt » *${formatTime(cooldowns.hunt)}*
ⴵ Dungeon » *${formatTime(cooldowns.dungeon)}*
ⴵ Adventure » *${formatTime(cooldowns.adventure)}*
ⴵ Steal » *${formatTime(cooldowns.steal)}*
ⴵ Daily » *${formatTime(cooldowns.daily)}*
ⴵ Coffer » *${formatTime(cooldowns.coffer)}*
ⴵ Weekly » *${formatTime(cooldowns.weekly)}*
ⴵ Monthly » *${formatTime(cooldowns.monthly)}*

⛁ Coins totales » ¥${coins.toLocaleString()} ${currency}`
    await ctx.reply(mensaje)
  }
}
