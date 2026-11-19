import * as gacha from '../../utils/gacha.js'

const MIN_PRICE = 2000
const MAX_PRICE = 100000000

export default gacha.define({
  name: 'sell',
  aliases: ['vender'],
  description: 'Pone en venta un personaje reclamado en el mercado global.',
  run: async ctx => {
    const me = ctx.senderNumber
    const { args, prefix, command } = ctx

    if (args.length < 2) {
      return ctx.reply(`❀ Debes especificar un precio para vender el personaje.\n> Ejemplo » *${prefix}${command} 5000 Rem*`)
    }

    const digits = args[0].replace(/[,._]/g, '')
    if (!/^\d+$/.test(digits)) return ctx.reply('ꕥ Ingresa un precio válido, solo números.')

    const price = Number(digits)
    if (price < MIN_PRICE) return ctx.reply(`ꕥ El precio mínimo para vender un personaje es de *${gacha.money(MIN_PRICE)}*.`)
    if (price > MAX_PRICE) return ctx.reply(`ꕥ El precio máximo permitido para vender un personaje es de *${gacha.money(MAX_PRICE)}*.`)

    const query = args.slice(1).join(' ')
    const { matches } = gacha.findOwned(me, query)
    if (!matches.length) return ctx.reply(`ꕥ No se ha encontrado al personaje *${query}* reclamado por ti.`)
    if (matches.length > 1) return ctx.reply(gacha.ambiguousText(matches, query, prefix, `${command} ${price}`))

    const character = matches[0]
    const now = Date.now()
    const current = gacha.getSale(character.id)

    if (current) {
      if (now - current.listedAt < gacha.SALE_TTL_MS) return ctx.reply(`ꕥ *${character.name}* ya está en venta.`)
      gacha.deleteSale(character.id)
    }

    gacha.createSale(character.id, me, price, now, ctx.chat)

    return ctx.reply(
      `✎ *${character.name}* ha sido puesto a la venta!\n` +
        `❀ Vendedor » *${gacha.displayName(me)}*\n` +
        `⛁ Valor » *${gacha.money(price)}*\n` +
        `ⴵ Expira en » *3 días*\n` +
        `> Puedes ver los personajes en venta usando *${prefix}wshop*`
    )
  }
})
