import os from 'node:os'
import config from '../../../config.js'
import { registry } from '../../core/loader.js'
import { bytes, duration, panel } from '../../utils/panel.js'

const memory = () => {
  const total = os.totalmem()
  const constrained = process.constrainedMemory?.() || 0
  const limit = Number.isFinite(constrained) && constrained > 0 && constrained < total ? constrained : total
  const used = process.memoryUsage().rss
  return `${bytes(used)} / ${bytes(limit)} (${((used / limit) * 100).toFixed(2)}%)`
}

export default {
  name: 'infobot',
  aliases: ['botinfo'],
  description: 'Información del bot',
  run: async ctx => {
    const started = new Date(Date.now() - process.uptime() * 1000).toLocaleString('es-MX', {
      timeZone: config.timezone,
      dateStyle: 'long',
      timeStyle: 'short'
    })

    const owner = config.owners[0]

    await ctx.reply(
      [
        panel(`Información de ${config.botName}`, [
          ['Nombre', config.botName],
          ['Prefijos', config.prefixes.join('  ')],
          ['Tipo', ctx.sock.isJadibot ? 'Sub Bot' : 'Principal'],
          ['Comandos', registry.list.length],
          ['Dueño', owner ? `wa.me/${owner}` : 'Oculto']
        ]),
        panel('Sistema', [
          ['Plataforma', os.type()],
          ['NodeJS', process.version],
          ['RAM', memory()],
          ['Activo desde', started],
          ['Tiempo activo', duration(process.uptime() * 1000)],
          ['Sistema activo', duration(os.uptime() * 1000)]
        ])
      ].join('\n\n')
    )
  }
}
