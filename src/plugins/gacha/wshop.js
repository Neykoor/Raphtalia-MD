import * as gacha from '../../utils/gacha.js'

const PER_PAGE = 10

const formatRemaining = ms => {
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  return `${d}d ${h}h ${m}m ${s}s`
}

export default gacha.define({
  name: 'wshop',
  aliases: ['haremshop', 'tiendawaifus'],
  description: 'Muestra los personajes puestos en venta en el mercado global.',
  run: async ctx => {
    const now = Date.now()
    const active = []

    for (const sale of gacha.getSales()) {
      if (now - sale.listedAt >= gacha.SALE_TTL_MS || gacha.getOwner(sale.characterId) !== sale.seller) {
        gacha.deleteSale(sale.characterId)
        continue
      }
      active.push(sale)
    }

    if (!active.length) return ctx.reply('ꕥ No hay personajes en venta.')

    const page = parseInt(ctx.args[0], 10) || 1
    const totalPages = Math.ceil(active.length / PER_PAGE)
    if (page < 1 || page > totalPages) {
      return ctx.reply(`ꕥ Página inválida. Solo hay *${totalPages}* disponible${totalPages > 1 ? 's' : ''}.`)
    }

    const start = (page - 1) * PER_PAGE
    const lines = active.slice(start, start + PER_PAGE).map(
      sale =>
        `❀ *${sale.name}* (✰ ${gacha.money(sale.value)}):\n` +
        `⛁ Precio » *${gacha.money(sale.price)}*\n` +
        `❖ Vendedor » *${gacha.displayName(sale.seller)}*\n` +
        `ⴵ Expira en » *${formatRemaining(gacha.SALE_TTL_MS - (now - sale.listedAt))}*`
    )

    return ctx.reply(
      `*☆ HaremShop \`≧◠ᴥ◠≦\`*\n❏ Personajes en venta <${active.length}>:\n\n${lines.join('\n\n')}\n\n> • Página *${page}* de *${totalPages}*`
    )
  }
})
