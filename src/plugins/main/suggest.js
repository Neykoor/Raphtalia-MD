import config from '../../../config.js'
import { duration, panel } from '../../utils/panel.js'
import { displayName, ensureUser, setField } from '../../utils/profiles.js'

const COOLDOWN_MS = 12 * 60 * 60 * 1000
const MIN_LENGTH = 10
const REPORTS = new Set(['report', 'reporte'])

export default {
  name: 'suggest',
  aliases: ['sug', 'report', 'reporte'],
  description: 'Envía una sugerencia o reporte a los dueños',
  run: async ctx => {
    const isReport = REPORTS.has(ctx.command)
    const noun = isReport ? 'reporte' : 'sugerencia'
    const key = isReport ? 'reportCooldown' : 'sugCooldown'
    const user = ensureUser(ctx.senderNumber, ctx.pushName)
    const remaining = (user[key] || 0) - Date.now()

    if (remaining > 0) {
      return ctx.reply(panel('Espera un momento', [`Podrás enviar otro ${noun} en ${duration(remaining)} ✗`]))
    }

    const text = ctx.text.trim()

    if (!text) {
      return ctx.reply(panel('Falta el mensaje', [`Ejemplo: ${ctx.prefix}${ctx.command} <tu ${noun}> ✿`]))
    }

    if (text.length < MIN_LENGTH) {
      return ctx.reply(panel('Mensaje muy corto', [`Explica mejor tu ${noun} (mínimo ${MIN_LENGTH} caracteres) ✗`]))
    }

    const message = panel(isReport ? 'Nuevo reporte' : 'Nueva sugerencia', [
      ['Nombre', displayName(user, ctx.senderNumber)],
      ['Número', `wa.me/${ctx.senderNumber}`],
      ['Fecha', new Date().toLocaleString('es-MX', { timeZone: config.timezone, dateStyle: 'full', timeStyle: 'short' })],
      ['Socket', ctx.sock.isJadibot ? 'Sub Bot' : 'Principal'],
      ['Mensaje', text]
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

    setField(ctx.senderNumber, key, Date.now() + COOLDOWN_MS)
    await ctx.reply(panel('Enviado', [`Gracias por tu ${noun} ♡`, 'Los dueños ya lo recibieron ✓']))
  }
}
