import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../../../config.js'
import { registry } from '../../core/loader.js'
import { mediaCache } from '../../utils/cache.js'
import { panel } from '../../utils/panel.js'

const mediaDir = fileURLToPath(new URL('../../../media/', import.meta.url))
const imageExtensions = ['jpg', 'jpeg', 'png', 'webp']
const MAX_ALIASES = 4

const labels = {
  perfil: 'Perfil',
  group: 'Grupo',
  utils: 'Utilidades',
  nsfw: 'NSFW +18',
  jadibot: 'Sub-Bot',
  main: 'General',
  owner: 'Owner'
}

const names = {
  perfil: ['perfil', 'profile'],
  group: ['grupo', 'group', 'grupos'],
  utils: ['utilidades', 'utils', 'herramientas'],
  nsfw: ['nsfw', '18', 'adulto'],
  jadibot: ['subbot', 'jadibot', 'bots'],
  main: ['general', 'main', 'principal'],
  owner: ['owner', 'dueño', 'dueno']
}

const order = Object.keys(labels)

const normalize = value => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ+\s-]/g, '')

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

const renderCommand = (plugin, prefix) => {
  const aliases = plugin.aliases ?? []
  const shown = aliases.length > MAX_ALIASES ? [] : aliases
  const aliasText = shown.map(alias => ` ⁞ \`${prefix}${alias}\``).join('')
  const description = plugin.description ? `\n   ↳ _${plugin.description}_` : ''
  return `◈ \`${prefix}${plugin.name}\`${aliasText}${description}\n`
}

const renderCategory = (title, plugins, prefix) =>
  `❖ ⟡ *${title}* ⟡ ❖\n${plugins.map(plugin => renderCommand(plugin, prefix)).join('')}\n`

export default {
  name: 'menu',
  aliases: ['help', 'ayuda', 'allmenu'],
  description: 'Muestra el listado de comandos disponibles',
  run: async ctx => {
    const groups = new Map()

    for (const plugin of registry.list) {
      if (plugin.hidden) continue
      if (plugin.ownerOnly && !ctx.isOwner) continue
      if (!groups.has(plugin.category)) groups.set(plugin.category, [])
      groups.get(plugin.category).push(plugin)
    }

    const keys = [...groups.keys()].sort((a, b) => {
      const left = order.indexOf(a)
      const right = order.indexOf(b)
      return (left === -1 ? order.length : left) - (right === -1 ? order.length : right)
    })

    const input = normalize(ctx.args[0])
    let selected = null

    if (input) {
      selected = keys.find(key => (names[key] ?? [key]).map(normalize).includes(input)) ?? null

      if (!selected) {
        return ctx.reply(
          panel('Categoría no encontrada', [
            `"${ctx.args[0]}" no existe ✗`,
            ...keys.map(key => `${ctx.prefix}menu ${(names[key] ?? [key])[0]}`)
          ])
        )
      }
    }

    const group = ctx.isGroup ? await ctx.getGroup() : null

    let header = `✦ 𝐇𝐨𝐥𝐚, 𝐬𝐨𝐲 *${config.botName}* ✦\n`
    header += `ʟɪsᴛᴀ ᴅᴇ ᴄᴏᴍᴀɴᴅᴏs ᴅɪsᴘᴏɴɪʙʟᴇs ❀\n\n`
    header += `⟡ 𝗗𝗲𝘃 ⟶ Neykoor\n`
    if (group) {
      header += `⟡ 𝗚𝗿𝘂𝗽𝗼 ⟶ ${group.subject ?? 'Grupo'}\n`
      header += `⟡ 𝗠𝗶𝗲𝗺𝗯𝗿𝗼𝘀 ⟶ ${group.participants?.length ?? 1}\n`
    }
    header += `\n`

    const body = (selected ? [selected] : keys)
      .map(key => renderCategory(labels[key] ?? key, groups.get(key), ctx.prefix))
      .join('')

    const text = `${header}${body}`.trimEnd()
    const image = await findMenuImage()

    if (!image) return ctx.reply(text)

    if (image.stamp !== lastStamp) {
      mediaCache.flushAll()
      lastStamp = image.stamp
    }

    await ctx.reply({ image: { url: image.path }, caption: text })
  }
}
