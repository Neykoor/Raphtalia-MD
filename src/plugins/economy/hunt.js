import { currency, economyGate, getChatUser, setChatUser } from '../../utils/economy.js'

const msToTime = duration => {
  const seconds = Math.floor((duration / 1000) % 60)
  const minutes = Math.floor((duration / (1000 * 60)) % 60)
  const min = minutes < 10 ? '0' + minutes : minutes
  const sec = seconds < 10 ? '0' + seconds : seconds
  return min === '00' ? `${sec} segundo${sec > 1 ? 's' : ''}` : `${min} minuto${min > 1 ? 's' : ''}, ${sec} segundo${sec > 1 ? 's' : ''}`
}

const pickRandom = list => list[Math.floor(Math.random() * list.length)]

export default {
  name: 'cazar',
  aliases: ['hunt'],
  description: 'Cazar animales para ganar coins.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { chat, senderNumber: me, prefix } = ctx
    const user = getChatUser(chat, me)
    const staminaConsumed = Math.floor(Math.random() * (5 - 1 + 1)) + 1
    if (user.stamina < staminaConsumed) {
      return ctx.reply(`ꕥ No tienes suficiente stamina para cazar.\n> Usa *${prefix}heal* para curarte.`)
    }
    if (!user.weapons?.arco) {
      return ctx.reply(`ꕥ Necesitas un Arco para cazar.\n> Compra uno en la tienda con: *${prefix}buy arco*`)
    }
    if (user.weapons.arco.durability <= 10) {
      delete user.weapons.arco
      setChatUser(chat, me, 'weapons', user.weapons)
      return ctx.reply(`ꕥ Tu Arco se ha roto por el uso y ha sido eliminado de tu inventario.\n>Compra uno nuevo con: *${prefix}buy arco*`)
    }
    const remainingTime = user.lasthunt - Date.now()
    if (remainingTime > 0) {
      return ctx.reply(`ꕥ Debes esperar *${msToTime(remainingTime)}* antes de volver a cazar.`)
    }
    user.stamina -= staminaConsumed
    setChatUser(chat, me, 'stamina', user.stamina)
    const rand = Math.random()
    const durabilityConsumed = Math.floor(Math.random() * (15 - 1 + 1)) + 1
    let cantidad
    let message
    if (rand < 0.4) {
      user.weapons.arco.durability -= durabilityConsumed
      if (user.weapons.arco.durability <= 10) {
        delete user.weapons.arco
      }
      setChatUser(chat, me, 'weapons', user.weapons)
      cantidad = Math.floor(Math.random() * (13000 - 10000 + 1)) + 10000
      user.coins += cantidad
      setChatUser(chat, me, 'coins', user.coins)
      const successMessages = [
        `¡Con gran valentía, lograste cazar un Oso con tu Arco! Ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `¡Has cazado un Tigre feroz con tu Arco! Tras una persecución electrizante, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Lograste cazar un Elefante con astucia y persistencia usando tu Arco, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `¡Has cazado un Panda con tu Arco! La caza fue tranquila, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Cazaste un Jabalí tras un rastreo emocionante con tu Arco, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Con gran destreza, atrapaste un Cocodrilo con tu Arco, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `¡Has cazado un Ciervo robusto con tu Arco! Ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Con paciencia lograste cazar un Zorro plateado con tu Arco, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Localizaste un grupo de peces en el río y atrapaste varios con tu Arco, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Te internaste en la niebla del bosque y cazaste un jabalí salvaje con tu Arco, ganaste *¥${cantidad.toLocaleString()} ${currency}*.`
      ]
      message = pickRandom(successMessages)
    } else if (rand < 0.7) {
      user.weapons.arco.durability -= durabilityConsumed
      if (user.weapons.arco.durability <= 10) {
        delete user.weapons.arco
      }
      setChatUser(chat, me, 'weapons', user.weapons)
      cantidad = Math.floor(Math.random() * (8000 - 6000 + 1)) + 6000
      const total = (user.coins || 0) + (user.bank || 0)
      if (total >= cantidad) {
        if (user.coins >= cantidad) {
          user.coins -= cantidad
          setChatUser(chat, me, 'coins', user.coins)
        } else {
          const restante = cantidad - user.coins
          user.coins = 0
          user.bank -= restante
          setChatUser(chat, me, 'coins', 0)
          setChatUser(chat, me, 'bank', user.bank)
        }
      } else {
        cantidad = total
        user.coins = 0
        user.bank = 0
        setChatUser(chat, me, 'coins', 0)
        setChatUser(chat, me, 'bank', 0)
      }
      const failMessages = [
        `Tu presa se escapó y no lograste cazar nada con tu Arco, perdiste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Tropezaste mientras apuntabas con tu Arco y la presa huyó, perdiste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Un rugido te distrajo y no lograste dar en el blanco con tu Arco, perdiste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Tu Arco se rompió justo en el momento crucial, perdiste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Un aguacero repentino arruinó tu ruta de caza con tu Arco, perdiste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Un jabalí te embistió y tuviste que huir perdiendo el control de tu Arco, perdiste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Un tigre te sorprendió y escapaste con pérdidas dañando tu Arco, perdiste *¥${cantidad.toLocaleString()} ${currency}*.`
      ]
      message = pickRandom(failMessages)
    } else {
      const neutralMessages = [
        `Pasaste la tarde cazando con tu Arco y observando cómo los animales se movían en silencio.`,
        `El bosque estuvo tranquilo y los animales se mostraron esquivos a tu Arco.`,
        `Tu jornada de caza fue serena con tu Arco, los animales se acercaban sin ser atrapados.`,
        `Los animales se mostraron cautelosos ante tu Arco, pero la experiencia de caza fue agradable.`,
        `Exploraste nuevas rutas de caza con tu Arco y descubriste huellas frescas.`
      ]
      message = pickRandom(neutralMessages)
    }
    setChatUser(chat, me, 'lasthunt', Date.now() + 15 * 60 * 1000)
    await ctx.reply(`「✿」 ${message}`)
  }
}
