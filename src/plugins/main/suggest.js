import config from '../../../config.js'
import { duration } from '../../utils/panel.js'
import { displayName, ensureUser, setField } from '../../utils/profiles.js'
import { card, notifyOwners, socketType } from '../../utils/soft.js'

const COOLDOWN = 12 * 60 * 60 * 1000
const MIN = 10

export default {
  name: 'suggest',
  aliases: ['sug', 'report', 'reporte'],
  description: 'Envía una sugerencia o reporte a los dueños',
  run: async ctx => {
    const report = ['report', 'reporte'].includes(ctx.command)
    const noun = report ? 'reporte' : 'sugerencia'
    const key = report ? 'reportCooldown' : 'sugCooldown'
    const user = ensureUser(ctx.senderNumber, ctx.pushName)
    const wait = (user[key] || 0) - Date.now()
    const text = ctx.text.trim()

    if (wait > 0) return ctx.reply(card('Espera un momento', [`Podrás enviar otro ${noun} en ${duration(wait)} ✗`]))
    if (!text) return ctx.reply(card('Falta el mensaje', [`Ejemplo: ${ctx.prefix}${ctx.command} <tu ${noun}> ✿`]))
    if (text.length < MIN) return ctx.reply(card('Mensaje muy corto', [`Explica mejor tu ${noun} (mínimo ${MIN} caracteres) ✗`]))

    const sent = await notifyOwners(
      ctx.sock,
      card(report ? 'Nuevo reporte' : 'Nueva sugerencia', [
        ['Nombre', displayName(user, ctx.senderNumber)],
        ['Número', `wa.me/${ctx.senderNumber}`],
        ['Fecha', new Date().toLocaleString('es-MX', { timeZone: config.timezone, dateStyle: 'full', timeStyle: 'short' })],
        ['Socket', socketType(ctx.sock)],
        ['Mensaje', text]
      ])
    )

    if (!sent) return ctx.reply(card('No se pudo enviar', ['No pude contactar a los dueños ✗']))

    setField(ctx.senderNumber, key, Date.now() + COOLDOWN)
    await ctx.reply(card('Enviado', [`Gracias por tu ${noun} ♡`, 'Los dueños ya lo recibieron ✓']))
  }
}
