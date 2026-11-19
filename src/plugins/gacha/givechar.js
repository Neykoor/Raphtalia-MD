import * as gacha from '../../utils/gacha.js'

export default gacha.define({
  name: 'givechar',
  aliases: ['givewaifu', 'regalar'],
  description: 'Regala un personaje reclamado a otro usuario.',
  run: async ctx => {
    const me = ctx.senderNumber
    const { args, prefix, command } = ctx

    if (!args.length) {
      return ctx.reply(
        `❀ Debes escribir el nombre del personaje y citar o mencionar al usuario que lo recibirá.\n> Ejemplo » *${prefix}${command} Rem @usuario*`
      )
    }

    const to = await gacha.target(ctx)
    if (!to) return ctx.reply('❀ Debes mencionar o citar el mensaje del destinatario.')
    if (to.id === me) return ctx.reply('ꕥ No puedes regalarte un personaje a ti mismo.')

    const query = args.filter(arg => !arg.startsWith('@')).join(' ').trim()
    if (!query) return ctx.reply('❀ Debes escribir el nombre del personaje que quieres regalar.')

    const { matches } = gacha.findOwned(me, query)
    if (!matches.length) return ctx.reply(`ꕥ *${query}* no está reclamado por ti.`)
    if (matches.length > 1) return ctx.reply(gacha.ambiguousText(matches, query, prefix, command))

    const character = matches[0]
    gacha.touchUser(to.id, to.jid)
    gacha.transferCharacter(character.id, to.id, Date.now())

    return ctx.reply({
      text: `❀ *${character.name}* ha sido regalado a *${gacha.displayName(to.id)}* por *${gacha.displayName(me)}*.`,
      mentions: [to.jid]
    })
  }
})
