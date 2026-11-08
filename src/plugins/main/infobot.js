import os from 'node:os'
import config from '../../../config.js'
import { registry } from '../../core/loader.js'
import { bytes, duration } from '../../utils/panel.js'
import { card, socketType } from '../../utils/soft.js'

const ram = () => {
  const total = os.totalmem()
  const cap = process.constrainedMemory?.() || 0
  const limit = cap > 0 && cap < total ? cap : total
  const used = process.memoryUsage().rss
  return `${bytes(used)} / ${bytes(limit)} (${((used / limit) * 100).toFixed(2)}%)`
}

export default {
  name: 'infobot',
  aliases: ['botinfo'],
  description: 'Información del bot',
  run: async ctx => {
    const owner = config.owners[0]
    const since = new Date(Date.now() - process.uptime() * 1000).toLocaleString('es-MX', {
      timeZone: config.timezone,
      dateStyle: 'long',
      timeStyle: 'short'
    })

    await ctx.reply(
      [
        card(`Información de ${config.botName}`, [
          ['Prefijos', config.prefixes.join('  ')],
          ['Tipo', socketType(ctx.sock)],
          ['Comandos', registry.list.length],
          ['Dueño', owner ? `wa.me/${owner}` : 'Oculto']
        ]),
        card('Sistema', [
          ['Plataforma', os.type()],
          ['NodeJS', process.version],
          ['RAM', ram()],
          ['Activo desde', since],
          ['Tiempo activo', duration(process.uptime() * 1000)],
          ['Sistema activo', duration(os.uptime() * 1000)]
        ])
      ].join('\n\n')
    )
  }
}
