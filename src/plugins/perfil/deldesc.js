import { box, getUser, setField } from '../../utils/profiles.js'

export default {
  name: 'deldesc',
  aliases: ['deldescription'],
  description: 'Elimina tu descripción de perfil',
  run: async ctx => {
    const user = getUser(ctx.senderNumber)

    if (!user?.desc) {
      return ctx.reply(box('Sin cambios', ['No tienes una descripción establecida ✗']))
    }

    setField(ctx.senderNumber, 'desc', '')
    await ctx.reply(box('Dato eliminado', ['Tu descripción fue eliminada ✿']))
  }
}
