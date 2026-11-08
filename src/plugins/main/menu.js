import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../../../config.js'
import { registry } from '../../core/loader.js'
import { mediaCache } from '../../utils/cache.js'
import { card } from '../../utils/soft.js'

const mediaDir = fileURLToPath(new URL('../../../media/', import.meta.url))
const IMAGES = ['jpg', 'jpeg', 'png', 'webp']

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
const rank = key => (order.includes(key) ? order.indexOf(key) : order.length)

let lastStamp = ''

const findImage = async () => {
  try {
    const file = (await readdir(mediaDir)).find(name => {
      const [base, ext] = name.toLowerCase().split(/\.(?=[^.]+$)/)
      return base === 'menu' && IMAGES.includes(ext)
    })
    if (!file) return null
    const path = join(mediaDir, file)
    return { path, stamp: `${path}:${(await stat(path)).mtimeMs}` }
  } catch {
    return null
  }
}

const command = (plugin, prefix) => {
  const aliases = (plugin.aliases ?? []).map(alias => ` ⟡ \`${prefix}${alias}\``).join('')
  return `◈ \`${prefix}${plugin.name}\`${aliases}\n> _${plugin.description}_\n`
}

const category = (title, plugins, prefix) => `» ˚⟡•(✿)• ⊹ \`${title}\` ⊹\n${plugins.map(plugin => command(plugin, prefix)).join('')}\n`

export default {
  name: 'menu',
  aliases: ['help', 'ayuda', 'allmenu'],
  description: 'Muestra el listado de comandos disponibles',
  run: async ctx => {
    const groups = new Map()

    for (const plugin of registry.list) {
      if (plugin.hidden || (plugin.ownerOnly && !ctx.isOwner)) continue
      groups.set(plugin.category, [...(groups.get(plugin.category) ?? []), plugin])
    }

    const keys = [...groups.keys()].sort((a, b) => rank(a) - rank(b))
    const input = normalize(ctx.args[0])
    const selected = input ? keys.find(key => (names[key] ?? [key]).map(normalize).includes(input)) : null

    if (input && !selected) {
      return ctx.reply(card('Categoría no encontrada', [`"${ctx.args[0]}" no existe ✗`, ...keys.map(key => `${ctx.prefix}menu ${(names[key] ?? [key])[0]}`)]))
    }

    const group = ctx.isGroup ? await ctx.getGroup() : null

    const header = [
      `✦ 𝐇𝐨𝐥𝐚, 𝐬𝐨𝐲 ${config.botName}`,
      'ʟɪsᴛᴀ ᴅᴇ ᴄᴏᴍᴀɴᴅᴏs ᴅɪsᴘᴏɴɪʙʟᴇs',
      '╭┈ ➤',
      '│ ❀ 𝓓𝓮𝓿𝓮𝓵𝓸𝓹𝓮𝓭 𝓫𝔂 𝓝𝓮𝔂𝓴𝓸𝓸𝓻 ✦',
      ...(group ? [`│ ❀ ꒷◈ 𝐆𝐫𝐮𝐩𝐨: ${group.subject ?? 'Grupo'}`, `│ ❀ ꒷◈ 𝐔𝐬𝐮𝐚𝐫𝐢𝐨𝐬: ${group.participants?.length ?? 1}`] : []),
      '╰─────────────────',
      '',
      ''
    ].join('\n')

    const body = (selected ? [selected] : keys).map(key => category(labels[key] ?? key, groups.get(key), ctx.prefix)).join('')
    const text = `${header}${body}━━━━━━━━━━━━━━━━━━━━━━━━━━`
    const image = await findImage()

    if (!image) return ctx.reply(text)

    if (image.stamp !== lastStamp) {
      mediaCache.flushAll()
      lastStamp = image.stamp
    }

    await ctx.reply({ image: { url: image.path }, caption: text })
  }
}
