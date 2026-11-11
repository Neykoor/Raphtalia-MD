import { currency, economyGate, getChatUser, nameOf, pickTarget, setChatUser } from '../../utils/economy.js'

export default {
  name: 'heal',
  aliases: ['curar', 'pocion', 'potion'],
  description: 'Curar salud para salir de aventuras.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const { chat, senderNumber: me, prefix, command } = ctx
    const picked = await pickTarget(ctx)
    const who = picked?.number || null
    const healer = getChatUser(chat, me)
    const target = who ? getChatUser(chat, who) : healer
    const targetName = who ? nameOf(who) : null
    const mentions = picked ? [picked.jid] : []
    const cmd = command.toLowerCase()
    if (cmd === 'pocion' || cmd === 'potion') {
      if (!healer.inventory?.pocion || healer.inventory.pocion <= 0) {
        return ctx.reply(`ꕥ No tienes poción en tu inventario.\n> Compra una en la tienda: ${prefix}shop`)
      }
      const magiaActual = target.magic || 0
      const magiaFaltante = 100 - magiaActual
      if (magiaFaltante <= 0) {
        const maximo = who ? `ꕥ La magia de *${targetName}* ya está al máximo, Magia actual: ${magiaActual}/100` : `ꕥ Tu magia ya está al máximo, Magia actual: ${magiaActual}/100`
        return ctx.reply({ text: maximo, mentions })
      }
      healer.inventory.pocion -= 1
      if (healer.inventory.pocion <= 0) {
        delete healer.inventory.pocion
      }
      setChatUser(chat, me, 'inventory', healer.inventory)
      const magiaRestaurada = Math.min(magiaFaltante, 100)
      target.magic = magiaActual + magiaRestaurada
      setChatUser(chat, who || me, 'magic', target.magic)
      const info = who ? `ꕥ Has usado una poción en *${targetName}* y restauraste *${magiaRestaurada}* puntos de magia.\n> Magia actual: ${target.magic}/100` : `ꕥ Has usado una poción y restauraste *${magiaRestaurada}* puntos de magia.\n> Magia actual: ${target.magic}/100`
      return ctx.reply({ text: info, mentions })
    }
    const saludActual = target.health || 0
    const staminaActual = target.stamina || 0
    const faltanteSalud = 100 - saludActual
    const faltanteStamina = 100 - staminaActual
    const necesitaCuracion = saludActual < 100 || staminaActual < 100
    if (!necesitaCuracion) {
      const maximo = who ? `ꕥ La salud y stamina de *${targetName}* ya están al máximo.\n> Salud: ${saludActual}/100 | Stamina: ${staminaActual}/100` : `ꕥ Tu salud y stamina ya están al máximo.\n> Salud: ${saludActual}/100 | Stamina: ${staminaActual}/100`
      return ctx.reply({ text: maximo, mentions })
    }
    const bloquesSalud = Math.ceil(faltanteSalud > 0 ? faltanteSalud / 10 : 0)
    const bloquesStamina = Math.ceil(faltanteStamina > 0 ? faltanteStamina / 10 : 0)
    const costoS = bloquesSalud * 500
    const costoSt = bloquesStamina * 300
    const costoTotal = costoS + costoSt
    const totalFondos = (healer.coins || 0) + (healer.bank || 0)
    if (totalFondos < costoTotal) {
      const mensajeCostos = []
      if (faltanteSalud > 0) mensajeCostos.push(`Salud: *¥${costoS.toLocaleString()}*`)
      if (faltanteStamina > 0) mensajeCostos.push(`Stamina: *¥${costoSt.toLocaleString()}*`)
      const fondos = who ? `ꕥ No tienes suficientes ${currency} para curar a *${targetName}*.\n> Costos:\n> ${mensajeCostos.join('\n> ')}\n> Total necesario: *¥${costoTotal.toLocaleString()} ${currency}*` : `ꕥ No tienes suficientes ${currency} para curarte.\n> Costos:\n> ${mensajeCostos.join('\n> ')}\n> Total necesario: *¥${costoTotal.toLocaleString()} ${currency}*`
      return ctx.reply({ text: fondos, mentions })
    }
    if ((healer.coins || 0) >= costoTotal) {
      healer.coins -= costoTotal
      setChatUser(chat, me, 'coins', healer.coins)
    } else {
      const restante = costoTotal - (healer.coins || 0)
      healer.coins = 0
      healer.bank = Math.max(0, (healer.bank || 0) - restante)
      setChatUser(chat, me, 'coins', 0)
      setChatUser(chat, me, 'bank', healer.bank)
    }
    const curaciones = []
    if (faltanteSalud > 0) {
      target.health = 100
      setChatUser(chat, who || me, 'health', 100)
      curaciones.push('salud')
    }
    if (faltanteStamina > 0) {
      target.stamina = 100
      setChatUser(chat, who || me, 'stamina', 100)
      curaciones.push('stamina')
    }
    const curadoStr = curaciones.length === 1 ? curaciones[0] : 'salud y stamina'
    const info = who ? `ꕥ Has curado a *${targetName}* hasta el máximo nivel de ${curadoStr}.` : `ꕥ Te has curado hasta el máximo nivel de ${curadoStr}.`
    let detallesCosto = ''
    if (faltanteSalud > 0 && faltanteStamina > 0) {
      detallesCosto = `\n> Costo salud: *¥${costoS.toLocaleString()}*\n> Costo stamina: *¥${costoSt.toLocaleString()}*`
    } else if (faltanteSalud > 0) {
      detallesCosto = `\n> Costo salud: *¥${costoS.toLocaleString()}*`
    } else if (faltanteStamina > 0) {
      detallesCosto = `\n> Costo stamina: *¥${costoSt.toLocaleString()}*`
    }
    await ctx.reply({ text: info + detallesCosto + `\n> Salud actual: ${target.health}/100\n> Stamina actual: ${target.stamina}/100`, mentions })
  }
}
