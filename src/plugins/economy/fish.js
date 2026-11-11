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
  name: 'pescar',
  aliases: ['fish'],
  description: 'Ganar coins pescando.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { chat, senderNumber: me, prefix } = ctx
    const user = getChatUser(chat, me)
    const staminaConsumed = Math.floor(Math.random() * (5 - 1 + 1)) + 1
    if (user.stamina < staminaConsumed) {
      return ctx.reply(`ꕥ No tienes suficiente energía para salir de pescar.\n> Usa *${prefix}heal* para curarte.`)
    }
    if (!user.tools?.caña) {
      return ctx.reply(`ꕥ Necesitas una Caña de pescar para pescar.\n> Compra una en la tienda con: *${prefix}buy caña*`)
    }
    if (user.tools.caña.durability <= 10) {
      delete user.tools.caña
      setChatUser(chat, me, 'tools', user.tools)
      return ctx.reply(`ꕥ Tu Caña de pescar se ha roto por el uso y ha sido eliminada de tu inventario.\n> Compra una nueva con: *${prefix}buy caña*`)
    }
    const remainingTime = user.lastfish - Date.now()
    if (remainingTime > 0) {
      return ctx.reply(`ꕥ Debes esperar *${msToTime(remainingTime)}* antes de volver a pescar.`)
    }
    user.stamina -= staminaConsumed
    setChatUser(chat, me, 'stamina', user.stamina)
    const rand = Math.random()
    const durabilityConsumed = Math.floor(Math.random() * (15 - 1 + 1)) + 1
    let cantidad
    let message
    if (rand < 0.4) {
      user.tools.caña.durability -= durabilityConsumed
      if (user.tools.caña.durability <= 10) {
        delete user.tools.caña
      }
      setChatUser(chat, me, 'tools', user.tools)
      cantidad = Math.floor(Math.random() * (8000 - 6000 + 1)) + 6000
      user.coins += cantidad
      setChatUser(chat, me, 'coins', user.coins)
      const successMessages = [
        `¡Has pescado un Salmón con tu Caña! Ganaste *¥${cantidad.toLocaleString()} ${currency}*!`,
        `¡Has pescado una Trucha con tu Caña! Ganaste *¥${cantidad.toLocaleString()} ${currency}*!`,
        `¡Has capturado un Tiburón con tu Caña! Ganaste *¥${cantidad.toLocaleString()} ${currency}*!`,
        `¡Has pescado una Ballena con tu Caña! Ganaste *¥${cantidad.toLocaleString()} ${currency}*!`,
        `¡Has capturado un Pez Payaso con tu Caña! Ganaste *¥${cantidad.toLocaleString()} ${currency}*!`,
        `¡Has atrapado una Anguila Dorada con tu Caña! Ganaste *¥${cantidad.toLocaleString()} ${currency}*!`,
        `¡Has pescado un Mero Gigante con tu Caña! Ganaste *¥${cantidad.toLocaleString()} ${currency}*!`,
        `¡Has capturado un Pulpo azul con tu Caña! Ganaste *¥${cantidad.toLocaleString()} ${currency}*!`,
        `¡Sacaste una Carpa Real con tu Caña! Ganaste *¥${cantidad.toLocaleString()} ${currency}*!`,
        `¡Has conseguido un Pez Dragón con tu Caña! Ganaste *¥${cantidad.toLocaleString()} ${currency}*!`
      ]
      message = pickRandom(successMessages)
    } else if (rand < 0.7) {
      user.tools.caña.durability -= durabilityConsumed
      if (user.tools.caña.durability <= 10) {
        delete user.tools.caña
      }
      setChatUser(chat, me, 'tools', user.tools)
      cantidad = Math.floor(Math.random() * (6500 - 5000 + 1)) + 5000
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
        `El anzuelo de tu Caña se enredó y perdiste parte de tu equipo, perdiste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Una corriente fuerte arrastró tu Caña, perdiste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Un pez grande rompió tu línea de la Caña y dañó tu aparejo, perdiste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Tu bote se golpeó contra las rocas y tuviste que reparar tu Caña, perdiste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `El pez escapó y arruinó tu red conectada a tu Caña, perdiste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `El pez mordió el anzuelo pero se soltó y dañó tu carrete de la Caña, perdiste *¥${cantidad.toLocaleString()} ${currency}*.`,
        `Tu cubeta se volcó y los peces atrapados con tu Caña se perdieron, perdiste *¥${cantidad.toLocaleString()} ${currency}*.`
      ]
      message = pickRandom(failMessages)
    } else {
      const neutralMessages = [
        `Pasaste la tarde pescando con tu Caña y observando cómo los peces nadaban cerca.`,
        `El agua estuvo tranquila y los peces se acercaban sin morder el anzuelo de tu Caña.`,
        `Tu jornada de pesca fue serena con tu Caña, los peces nadaban alrededor sin ser atrapados.`,
        `Los peces se mostraron esquivos a tu Caña, pero la experiencia de pesca fue agradable.`,
        `El río estuvo lleno de peces curiosos que se acercaban sin ser capturados por tu Caña.`
      ]
      message = pickRandom(neutralMessages)
    }
    setChatUser(chat, me, 'lastfish', Date.now() + 8 * 60 * 1000)
    await ctx.reply(`「✿」 ${message}`)
  }
}
