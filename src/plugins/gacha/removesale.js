import * as gacha from '../../utils/gacha.js'

export default gacha.define({
  name: 'removesale',
  aliases: ['removerventa'],
  description: 'Elimina un personaje que pusiste en venta.',
  run: async ctx => {
    const me = ctx.senderNumber
    const { text, prefix, command } = ctx

    if (!text) return ctx.reply(`❀ Debes especificar un personaje para eliminar.\n> Ejemplo » *${prefix}${command} Rem*`)

    const character = gacha.findCharacterExact(text)
    const sale = character ? gacha.getSale(character.id) : null
    if (!character || !sale || sale.seller !== me) return ctx.reply(`ꕥ El personaje *${text}* no está a la venta por ti.`)

    gacha.deleteSale(character.id)
    return ctx.reply(`❀ *${character.name}* ha sido eliminado de la lista de ventas.`)
  }
})
