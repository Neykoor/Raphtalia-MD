import { currency as monedas, economyGate, getChatUser, setChatUser } from '../../utils/economy.js'

const msToTime = duration => {
  let seconds = Math.floor((duration / 1000) % 60)
  let minutes = Math.floor((duration / (1000 * 60)) % 60)
  minutes = minutes < 10 ? '0' + minutes : minutes
  seconds = seconds < 10 ? '0' + seconds : seconds
  if (minutes === '00') return `${seconds} segundo${seconds > 1 ? 's' : ''}`
  return `${minutes} minuto${minutes > 1 ? 's' : ''}, ${seconds} segundo${seconds > 1 ? 's' : ''}`
}

const pickRandom = list => list[Math.floor(Math.random() * list.length)]

const escenarios = [
  'una cueva oscura y húmeda',
  'la cima de una montaña nevada',
  'un bosque misterioso lleno de raíces',
  'un río cristalino y caudaloso',
  'una mina abandonada de carbón',
  'las ruinas de un antiguo castillo',
  'una playa desierta con arena dorada',
  'un valle escondido entre colinas',
  'un arbusto espinoso al borde del camino',
  'un tronco hueco en medio del bosque'
]

const mineria = [
  'encontraste un antiguo cofre con',
  'hallaste una bolsa llena de',
  'descubriste un saco de',
  'desenterraste monedas antiguas que contienen',
  'rompiste una roca y adentro estaba',
  'cavando profundo, hallaste',
  'entre las raíces, encontraste',
  'dentro de una caja olvidada, hallaste',
  'bajo unas piedras, descubriste',
  'entre los escombros de un lugar viejo, encontraste'
]

export default {
  name: 'mine',
  aliases: ['minar'],
  description: 'Realizar trabajos de minería y ganar coins.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { chat, senderNumber: me, prefix } = ctx
    const user = getChatUser(chat, me)
    const staminaConsumed = Math.floor(Math.random() * (5 - 1 + 1)) + 1
    if (user.stamina < staminaConsumed) {
      return ctx.reply(`ꕥ No tienes suficiente energía para ir a minar.\n> Usa *${prefix}heal* para curarte.`)
    }
    if (!user.tools?.pico) {
      return ctx.reply(`ꕥ Necesitas un Pico para minar.\n> Compra uno en la tienda con: *${prefix}buy pico*`)
    }
    if (user.tools.pico.durability <= 10) {
      delete user.tools.pico
      setChatUser(chat, me, 'tools', user.tools)
      return ctx.reply(`ꕥ Tu Pico se ha roto por el uso y ha sido eliminado de tu inventario.\n> Compra uno nuevo con: *${prefix}buy pico*`)
    }
    const remaining = user.lastmine - Date.now()
    if (remaining > 0) {
      return ctx.reply(`ꕥ Debes esperar *${msToTime(remaining)}* para minar de nuevo.`)
    }
    user.stamina -= staminaConsumed
    setChatUser(chat, me, 'stamina', user.stamina)
    const durabilityConsumed = Math.floor(Math.random() * (15 - 1 + 1)) + 1
    user.tools.pico.durability -= durabilityConsumed
    if (user.tools.pico.durability <= 10) {
      delete user.tools.pico
    }
    setChatUser(chat, me, 'tools', user.tools)
    setChatUser(chat, me, 'lastmine', Date.now() + 10 * 60 * 1000)
    const isLegendary = Math.random() < 0.02
    let reward, narration, bonusMsg = ''
    if (isLegendary) {
      reward = Math.floor(Math.random() * (13000 - 11000 + 1)) + 11000
      narration = '¡DESCUBRISTE UN TESORO LEGENDARIO!\n\n'
      bonusMsg = '\nꕥ Recompensa ÉPICA obtenida!'
    } else {
      reward = Math.floor(Math.random() * (9500 - 7000 + 1)) + 7000
      const scenario = pickRandom(escenarios)
      narration = `En ${scenario}, ${pickRandom(mineria)}`
      if (Math.random() < 0.1) {
        const bonus = Math.floor(Math.random() * (4500 - 2500 + 1)) + 2500
        reward += bonus
        bonusMsg = `\n「✿」 ¡Bonus de minería! Ganaste *${bonus.toLocaleString()}* ${monedas} extra`
      }
    }
    setChatUser(chat, me, 'coins', user.coins + reward)
    let caption = `「✿」 ${narration} *${reward.toLocaleString()} ${monedas}*`
    if (bonusMsg) caption += `\n${bonusMsg}`
    await ctx.reply(caption)
  }
}
