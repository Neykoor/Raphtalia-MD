import * as gacha from '../../utils/gacha.js'

export default gacha.define({
  name: 'delclaimmsg',
  aliases: ['delclaim'],
  description: 'Restablece el mensaje de reclamo al predeterminado.',
  run: async ctx => {
    const me = ctx.senderNumber
    if (!gacha.getClaimMessage(me)) return ctx.reply('ꕥ No tienes un mensaje de reclamación personalizado.')
    gacha.deleteClaimMessage(me)
    return ctx.reply('❀ Mensaje de reclamación restablecido.')
  }
})
