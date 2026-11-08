import os from 'node:os'
import config from '../../../config.js'
import { bytes, compact, duration } from '../../utils/panel.js'
import { allUsers } from '../../utils/profiles.js'
import { card } from '../../utils/soft.js'

export default {
  name: 'status',
  aliases: ['estado'],
  description: 'Estado del bot y del servidor',
  run: async ctx => {
    const users = allUsers()
    const groups = await ctx.sock.groupFetchAllParticipating().then(all => Object.keys(all).length, () => null)
    const usage = process.memoryUsage()
    const total = os.totalmem()

    await ctx.reply(
      [
        card(`Estado de ${config.botName}`, [
          ['Usuarios', users.length.toLocaleString()],
          ['Grupos', groups === null ? 'Desconocido' : groups.toLocaleString()],
          ['Comandos', compact(users.reduce((sum, user) => sum + (user.commands || 0), 0))],
          ['Activo', duration(process.uptime() * 1000)]
        ]),
        card('Servidor', [
          ['Sistema', os.type()],
          ['CPU', `${os.cpus().length} núcleos`],
          ['RAM', `${bytes(total - os.freemem())} / ${bytes(total)}`],
          ['Arquitectura', os.arch()]
        ]),
        card('Memoria NodeJS', [
          ['RAM', bytes(usage.rss)],
          ['Heap', `${bytes(usage.heapUsed)} / ${bytes(usage.heapTotal)}`]
        ])
      ].join('\n\n')
    )
  }
}
