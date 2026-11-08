import { box, ensureUser, setField } from '../../utils/profiles.js'

const MAX_DESC = 300

export default {
  name: 'setdesc',
  aliases: ['setdescription'],
  description: 'Establece tu descripción de perfil',
  run: async ctx => {
    const text = ctx.text.trim()

    if (!text) {
      return ctx.reply(box('Falta la descripción', [`Ejemplo: ${ctx.prefix}${ctx.command} Hola, uso WhatsApp ✿`]))
    }

    ensureUser(ctx.senderNumber, ctx.pushName)
    setField(ctx.senderNumber, 'desc', text.slice(0, MAX_DESC))
    await ctx.reply(box('Descripción guardada', [`Puedes verla con ${ctx.prefix}profile ❀`]))
  }
}
