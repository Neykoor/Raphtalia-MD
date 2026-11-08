import { box, getUser, setField } from '../../utils/profiles.js'

export default {
  name: 'delhobby',
  aliases: ['delpasatiempo', 'removehobby'],
  description: 'Elimina tu pasatiempo del perfil',
  run: async ctx => {
    const user = getUser(ctx.senderNumber)

    if (!user?.hobby) {
      return ctx.reply(box('Sin cambios', ['No tienes ningún pasatiempo establecido ✗']))
    }

    setField(ctx.senderNumber, 'hobby', '')
    await ctx.reply(box('Dato eliminado', ['Tu pasatiempo fue eliminado ✿']))
  }
}
