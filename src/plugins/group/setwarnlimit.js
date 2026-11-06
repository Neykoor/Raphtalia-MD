import { box, getSettings, setSettings } from '../../utils/warns.js'

export default {
  name: 'setwarnlimit',
  aliases: ['warnlimit'],
  description: 'Define el límite de advertencias del grupo (0 desactiva)',
  groupOnly: true,
  adminOnly: true,
  run: async ctx => {
    const raw = ctx.args[0]
    const limit = Number(raw)
    const current = getSettings(ctx.chat)

    if (!raw || !Number.isInteger(limit) || limit < 0 || limit > 10) {
      return ctx.reply(
        box('Límite de advertencias', [
          'Debe ser un número entre 1 y 10, o 0 para desactivar ❀',
          `Ejemplo: ${ctx.prefix}${ctx.command} 5 ✿`,
          `Ejemplo: ${ctx.prefix}${ctx.command} 0 ✿`,
          `Estado actual: ${current.kick ? `${current.limit} advertencias` : 'Desactivado'} ♡`
        ])
      )
    }

    if (limit === 0) {
      setSettings(ctx.chat, current.limit, false)
      return ctx.reply(box('Límite desactivado', ['Ya no expulsaré al llegar al límite ✿', 'Hecho ♡']))
    }

    setSettings(ctx.chat, limit, true)

    await ctx.reply(
      box('Límite establecido', [
        `Límite del grupo: ${limit} advertencias ❀`,
        'Expulsaré automáticamente al llegar a él ✿',
        'Necesito ser admin para poder hacerlo ♡'
      ])
    )
  }
}
