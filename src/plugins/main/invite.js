import config from '../../../config.js'
import { duration } from '../../utils/panel.js'
import { displayName, ensureUser, setField } from '../../utils/profiles.js'
import { card, notifyOwners, socketType } from '../../utils/soft.js'

const COOLDOWN = 60 * 60 * 1000
const LINK = /chat\.whatsapp\.com\/([0-9A-Za-z]{20,24})/i

export default {
  name: 'invite',
  aliases: ['invitar'],
  description: 'Invita al bot a tu grupo con un enlace',
  run: async ctx => {
    const user = ensureUser(ctx.senderNumber, ctx.pushName)
    const wait = (user.inviteCooldown || 0) - Date.now()
    const code = ctx.text.match(LINK)?.[1]

    if (wait > 0) return ctx.reply(card('Espera un momento', [`Podrás enviar otra invitación en ${duration(wait)} ✗`]))
    if (!ctx.text.trim()) return ctx.reply(card('Falta el enlace', [`Ejemplo: ${ctx.prefix}${ctx.command} https://chat.whatsapp.com/... ✿`]))
    if (!code) return ctx.reply(card('Enlace no válido', ['El enlace está incompleto o no es de un grupo ✗']))

    const chat = ctx.isGroup ? (await ctx.getGroup())?.subject || 'Grupo desconocido' : 'Chat privado'

    const sent = await notifyOwners(
      ctx.sock,
      card('Solicitud recibida', [
        ['Usuario', displayName(user, ctx.senderNumber)],
        ['Número', `wa.me/${ctx.senderNumber}`],
        ['Enlace', `https://chat.whatsapp.com/${code}`],
        ['Chat', chat],
        ['Bot', config.botName],
        ['Socket', socketType(ctx.sock)]
      ])
    )

    if (!sent) return ctx.reply(card('No se pudo enviar', ['No pude contactar a los dueños ✗']))

    setField(ctx.senderNumber, 'inviteCooldown', Date.now() + COOLDOWN)
    await ctx.reply(card('Enviado', ['Tu enlace fue enviado correctamente ✓', 'Gracias por la invitación ♡']))
  }
}
