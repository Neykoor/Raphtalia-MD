import { define, mark, usage } from '../../utils/downloads.js'

const SEPARATOR = '\n\n╾۪〬─ ┄۫╌ ׄ┄┈۪ ─〬 ׅ┄╌ ۫┈ ─ׄ─۪〬 ┈ ┄۫╌ ─ׄ〬╼\n\n'
const MAX_RESULTS = 10

const loadYts = async () => {
  try {
    const mod = await import('yt-search')
    return mod.default ?? mod
  } catch {
    throw new Error('Falta el módulo yt-search. Instálalo con: npm install yt-search')
  }
}

const format = item => {
  if (item.type === 'video') {
    return `➩ *Título ›* *${item.title}*\n\n> ⴵ *Duración ›* ${item.timestamp}\n> ❖ *Subido ›* ${item.ago}\n> ✿ *Vistas ›* ${item.views}\n> ❒ *Url ›* ${item.url}`
  }
  if (item.type === 'channel') {
    return `> ❖ Canal › *${item.name}*\n> ❒ Url › ${item.url}\n> ❀ Subscriptores › ${item.subCountLabel} (${item.subCount})\n> ✿ Videos totales › ${item.videoCount}`
  }
  return null
}

export default define({
  name: 'ytsearch',
  aliases: ['yts', 'ytbuscar'],
  description: 'Busca videos de YouTube',
  run: async ctx => {
    if (!ctx.text) return usage(ctx, 'Por favor, ingresa el título de un video.', 'bad bunny monaco')

    await mark(ctx, '🕒')
    const yts = await loadYts()
    const result = await yts(ctx.text)
    const items = (result.all ?? []).slice(0, MAX_RESULTS)
    const text = items.map(format).filter(Boolean).join(SEPARATOR)

    if (!text) {
      await mark(ctx, '✖️')
      return ctx.reply(`ꕥ No se encontraron resultados para *${ctx.text}*.`)
    }

    const thumb = items[0].image || items[0].thumbnail
    if (thumb) await ctx.reply({ image: { url: thumb }, caption: text }).catch(() => ctx.reply(text))
    else await ctx.reply(text)

    return mark(ctx, '✔️')
  }
})
