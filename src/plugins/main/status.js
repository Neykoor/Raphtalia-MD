import os from 'node:os'
import config from '../../../config.js'
import { bytes, compact, duration, panel } from '../../utils/panel.js'
import { allUsers } from '../../utils/profiles.js'

const countGroups = async sock => {
  try {
    return Object.keys(await sock.groupFetchAllParticipating()).length
  } catch {
    return null
  }
}

export default {
  name: 'status',
  aliases: ['estado'],
  description: 'Estado del bot y del servidor',
  run: async ctx => {
    const users = allUsers()
    const commands = users.reduce((total, user) => total + (user.commands || 0), 0)
    const groups = await countGroups(ctx.sock)
    const usage = process.memoryUsage()
    const total = os.totalmem()

    await ctx.reply(
      [
        panel(`Estado de ${config.botName}`, [
          ['Usuarios', users.length.toLocaleString()],
          ['Grupos', groups === null ? 'Desconocido' : groups.toLocaleString()],
          ['Comandos ejecutados', compact(commands)],
          ['Activo', duration(process.uptime() * 1000)]
        ]),
        panel('Servidor', [
          ['Sistema', os.type()],
          ['CPU', `${os.cpus().length} núcleos`],
          ['RAM', bytes(total)],
          ['RAM usada', bytes(total - os.freemem())],
          ['Arquitectura', os.arch()]
        ]),
        panel('Memoria NodeJS', [
          ['RAM utilizada', bytes(usage.rss)],
          ['Heap reservado', bytes(usage.heapTotal)],
          ['Heap usado', bytes(usage.heapUsed)],
          ['Módulos nativos', bytes(usage.external)],
          ['Buffers', bytes(usage.arrayBuffers)]
        ])
      ].join('\n\n')
    )
  }
}
