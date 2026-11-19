import * as gacha from '../../utils/gacha.js'
import { economyGate, getChatUser, setChatUser } from '../../utils/economy.js'

export default gacha.define({
  name: 'buychar',
  aliases: ['buyc', 'buycharacter'],
  description: 'Compra un personaje puesto en venta en el mercado.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return

    const me = ctx.senderNumber
    const { chat, text, prefix, command } = ctx

    if (!text) return ctx.reply(`❀ Debes especificar un personaje para comprar.\n> Ejemplo » *${prefix}${command} Rem*`)

    const sale = gacha.getSaleByQuery(text)
    if (!sale) return ctx.reply(`ꕥ No se ha encontrado al personaje *${text}* en venta.`)
    if (sale.seller === me) return ctx.reply('ꕥ No puedes comprar tu propio personaje.')

    const now = Date.now()
    if (now - sale.listedAt >= gacha.SALE_TTL_MS) {
      gacha.deleteSale(sale.characterId)
      return ctx.reply(`ꕥ La venta de *${sale.name}* ha expirado.`)
    }

    if (gacha.getOwner(sale.characterId) !== sale.seller) {
      gacha.deleteSale(sale.characterId)
      return ctx.reply(`ꕥ *${sale.name}* ya no está disponible.`)
    }

    const buyer = getChatUser(chat, me)
    if (buyer.coins < sale.price) {
      return ctx.reply(`ꕥ No tienes suficiente dinero en la cartera para comprar a *${sale.name}*.\n> Necesitas *${gacha.money(sale.price)}*`)
    }

    const seller = getChatUser(chat, sale.seller)
    setChatUser(chat, me, 'coins', buyer.coins - sale.price)
    setChatUser(chat, sale.seller, 'coins', (seller.coins || 0) + sale.price)

    gacha.transferCharacter(sale.characterId, me, now)

    const sellerJid = gacha.mentionJid(sale.seller)
    return ctx.reply({
      text: `❀ *${sale.name}* ha sido comprado por *${gacha.displayName(me)}*!\n> Se han transferido *${gacha.money(sale.price)}* a *${gacha.displayName(sale.seller)}*`,
      mentions: [ctx.sender, sellerJid]
    })
  }
})
