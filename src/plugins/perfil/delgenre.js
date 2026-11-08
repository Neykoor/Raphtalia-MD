import { box, getUser, setField } from '../../utils/profiles.js'

export default {
  name: 'delgenre',
  description: 'Elimina tu género del perfil',
  run: async ctx => {
    const user = getUser(ctx.senderNumber)

    if (!user?.genre) {
      return ctx.reply(box('Sin cambios', ['No tienes un género asignado ✗']))
    }

    setField(ctx.senderNumber, 'genre', '')
    await ctx.reply(box('Dato eliminado', ['Tu género fue eliminado ✿']))
  }
}
