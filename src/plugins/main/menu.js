import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../../../config.js'
import { registry } from '../../core/loader.js'
import { mediaCache } from '../../utils/cache.js'
import { formatUptime } from '../../utils/time.js'

const mediaDir = fileURLToPath(new URL('../../../media/', import.meta.url))
const imageExtensions = ['jpg', 'jpeg', 'png', 'webp']

let lastStamp = ''

const findMenuImage = async () => {
  try {
    const files = await readdir(mediaDir)
    const found = files.find(file => {
      const [name, extension] = file.toLowerCase().split(/\.(?=[^.]+$)/)
      return name === 'menu' && imageExtensions.includes(extension)
    })
    if (!found) return null

    const path = join(mediaDir, found)
    const { mtimeMs } = await stat(path)
    return { path, stamp: `${path}:${mtimeMs}` }
  } catch {
    return null
  }
}

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

    const text = [header, ...sections].join('\n\n')
    const image = await findMenuImage()

    if (!image) return ctx.reply(text)

    if (image.stamp !== lastStamp) {
      mediaCache.flushAll()
      lastStamp = image.stamp
    }

    await ctx.reply({ image: { url: image.path }, caption: text })
  }
}
