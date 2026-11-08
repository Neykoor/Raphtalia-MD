import config from '../../../config.js'
import { duration, panel } from '../../utils/panel.js'
import { displayName, ensureUser, setField } from '../../utils/profiles.js'

const COOLDOWN_MS = 60 * 60 * 1000
const LINK = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i

const groupName = async ctx => {
  if (!ctx.isGroup) return 'Chat privado'
  const group = await ctx.getGroup()
  return group?.subject || 'Grupo desconocido'
}

export default {
  name: 'invite',
  aliases: ['invitar'],
  description: 'Invita al bot a tu grupo con un enlace',
  run: async ctx => {
    const user = ensureUser(ctx.senderNumber, ctx.pushName)
    const remaining = (user.inviteCooldown || 0) - Date.now()

    if (remaining > 0) {
      return ctx.reply(panel('Espera un momento', [`Podrás enviar otra invitación en ${duration(remaining)} ✗`]))
    }

    if (!ctx.text.trim()) {
      return ctx.reply(panel('Falta el enlace', [`Ejemplo: ${ctx.prefix}${ctx.command} https://chat.whatsapp.com/... ✿`]))
    }

    const match = ctx.text.match(LINK)

    if (!match) {
      return ctx.reply(panel('Enlace no válido', ['El enlace está incompleto o no es de un grupo ✗']))
    }

    const message = panel('Solicitud recibida', [
      ['Usuario', displayName(user, ctx.senderNumber)],
      ['Número', `wa.me/${ctx.senderNumber}`],
      ['Enlace', `https://chat.whatsapp.com/${match[1]}`],
      ['Chat', await groupName(ctx)],
      ['Bot', config.botName],
      ['Socket', ctx.sock.isJadibot ? 'Sub Bot' : 'Principal']
    ])

    let delivered = 0

    for (const owner of config.owners) {
      try {
        await ctx.sock.sendMessage(`${owner}@s.whatsapp.net`, { text: message })
        delivered += 1
      } catch {}
    }

    if (!delivered) {
      return ctx.reply(panel('No se pudo enviar', ['No pude contactar a los dueños en este momento ✗']))
    }

    setField(ctx.senderNumber, 'inviteCooldown', Date.now() + COOLDOWN_MS)
    await ctx.reply(panel('Enviado', ['Tu enlace fue enviado correctamente ✓', 'Gracias por la invitación ♡']))
  }
}
