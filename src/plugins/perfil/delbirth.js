import { box, getUser, setField } from '../../utils/profiles.js'

export default {
  name: 'delbirth',
  description: 'Borra tu fecha de cumpleaños',
  run: async ctx => {
    const user = getUser(ctx.senderNumber)

    if (!user?.birth) {
      return ctx.reply(box('Sin cambios', ['No tienes una fecha de cumpleaños establecida ✗']))
    }

    setField(ctx.senderNumber, 'birth', '')
    await ctx.reply(box('Dato eliminado', ['Tu fecha de cumpleaños fue eliminada ✿']))
  }
}
