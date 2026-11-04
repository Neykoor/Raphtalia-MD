import config from '../../../config.js'
import { registry } from '../../core/loader.js'
import { formatUptime } from '../../utils/time.js'

export default {
  name: 'menu',
  aliases: ['help', 'ayuda'],
  description: 'Muestra la lista de comandos',
  run: async ctx => {
    const groups = new Map()

    for (const plugin of registry.list) {
      if (plugin.hidden) continue
      if (plugin.ownerOnly && !ctx.isOwner) continue
      if (!groups.has(plugin.category)) groups.set(plugin.category, [])
      groups.get(plugin.category).push(plugin)
    }

    const sections = [...groups.entries()].map(([category, plugins]) => {
      const lines = plugins.map(item => {
        const detail = item.description ? ` - ${item.description}` : ''
        return `> ${ctx.prefix}${item.name}${detail}`
      })
      return `*${category.toUpperCase()}*\n${lines.join('\n')}`
    })

    const header = [
      `*${config.botName}*`,
      `Hola ${ctx.pushName || 'usuario'}`,
      `Activo: ${formatUptime(process.uptime())}`,
      `Comandos: ${registry.list.length}`
    ].join('\n')

    await ctx.reply([header, ...sections].join('\n\n'))
  }
}
