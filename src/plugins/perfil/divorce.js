import { box, displayName, getUser, inflect, setField } from '../../utils/profiles.js'

export default {
  name: 'divorce',
  aliases: ['divorcio'],
  description: 'Te divorcia de tu pareja',
  run: async ctx => {
    const user = getUser(ctx.senderNumber)

    if (!user?.marry) {
      return ctx.reply(box('Sin pareja', [`No estás ${inflect(user?.genre, 'casada', 'casado', 'casadx')} con nadie ✗`]))
    }

    const partnerNumber = user.marry
    const partner = getUser(partnerNumber)

    setField(ctx.senderNumber, 'marry', '')
    if (partner?.marry === ctx.senderNumber) setField(partnerNumber, 'marry', '')

    await ctx.reply(
      box('Divorcio', [`${displayName(user, ctx.senderNumber)} se divorció de ${displayName(partner, partnerNumber)} ✿`])
    )
  }
}
