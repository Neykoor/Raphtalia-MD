import * as gacha from '../../utils/gacha.js'

export default gacha.define({
  name: 'principal',
  aliases: ['setmain', 'waifuprincipal', 'setfav', 'setfavourite'],
  description: 'Marca uno de tus personajes reclamados como tu principal.',
  run: async ctx => {
    const me = ctx.senderNumber
    const { text, prefix, command } = ctx
    const { owned, matches } = gacha.findOwned(me, text)

    if (!text) {
      const primaryId = gacha.getPrimaryCharacter(me)
      const current = primaryId ? owned.find(c => c.id === primaryId) : null
      if (!current) {
        return ctx.reply(`ꕥ No tienes un personaje principal.\n\n✐ Usa *${prefix}${command} <nombre o ID>* para elegir uno.`)
      }
      return ctx.reply(`★ Tu personaje principal es *${current.name}* \`${current.id}\` (*${gacha.money(current.value)}*)`)
    }

    if (['quitar', 'remove', 'ninguno'].includes(text.toLowerCase())) {
      gacha.clearPrimaryCharacter(me)
      return ctx.reply('ꕥ Ya no tienes un personaje principal.')
    }

    if (!owned.length) return ctx.reply('ꕥ No tienes personajes reclamados.')
    if (!matches.length) return ctx.reply(`❀ No encontré ese personaje en tu harem.\n\n✐ Usa *${prefix}harem* para ver tu lista.`)
    if (matches.length > 1) return ctx.reply(gacha.ambiguousText(matches, text, prefix, command))

    gacha.setPrimaryCharacter(me, matches[0].id)
    return ctx.reply(`★ *${matches[0].name}* \`${matches[0].id}\` ahora es tu personaje principal.`)
  }
})
