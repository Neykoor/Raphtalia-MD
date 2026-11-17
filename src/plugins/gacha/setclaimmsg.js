import * as gacha from '../../utils/gacha.js'

export default gacha.define({
  name: 'setclaimmsg',
  aliases: ['setclaim'],
  description: 'Modifica el mensaje que se envía al reclamar un personaje.',
  run: async ctx => {
    const { text, prefix, command } = ctx

    if (!text) {
      return ctx.reply(
        `❀ Debes especificar un mensaje para reclamar un personaje.\n> Ejemplos:\n> ${prefix}${command} €user ha reclamado el personaje €character!\n> ${prefix}${command} €character ha sido reclamado por €user`
      )
    }
    if (!text.includes('€user') || !text.includes('€character')) {
      return ctx.reply('ꕥ Tu mensaje debe incluir *€user* y *€character* para que funcione correctamente.')
    }

    gacha.setClaimMessage(ctx.senderNumber, text)
    return ctx.reply('❀ Mensaje de reclamación modificado.')
  }
})
