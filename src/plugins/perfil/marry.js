import { box, displayName, ensureUser, getUser, inflect, propose, setField, takeProposal, targetRaw, whoIs } from '../../utils/profiles.js'

export default {
  name: 'marry',
  aliases: ['casarse'],
  description: 'Propón matrimonio o acepta una propuesta (@usuario o responder)',
  groupOnly: true,
  run: async ctx => {
    const raw = targetRaw(ctx)

    if (!raw) {
      return ctx.reply(
        box('Falta una persona', ['Menciona o responde a quien quieras proponerle matrimonio ✿', `Ejemplo: ${ctx.prefix}${ctx.command} @usuario ❀`])
      )
    }

    const me = ensureUser(ctx.senderNumber, ctx.pushName)
    const other = await whoIs(ctx, raw)

    if (other.own) {
      return ctx.reply(box('No se puede', [`No puedes proponerte matrimonio a ti ${inflect(me.genre, 'misma', 'mismo', 'mismx')} ✗`]))
    }

    const partner = getUser(other.number)

    if (!partner) {
      return ctx.reply(box('Sin registro', ['Ese usuario aún no está registrado en el bot ✗']))
    }

    if (me.marry) {
      const current = getUser(me.marry)
      return ctx.reply(
        box('Ya tienes pareja', [`Ya estás ${inflect(me.genre, 'casada', 'casado', 'casadx')} con ${displayName(current, me.marry)} ✗`])
      )
    }

    if (partner.marry) {
      const current = getUser(partner.marry)
      return ctx.reply(
        box('Ya tiene pareja', [
          `${displayName(partner, other.number)} ya está ${inflect(partner.genre, 'casada', 'casado', 'casadx')} con ${displayName(current, partner.marry)} ✗`
        ])
      )
    }

    if (takeProposal(other.number, ctx.senderNumber)) {
      setField(ctx.senderNumber, 'marry', other.number)
      setField(other.number, 'marry', ctx.senderNumber)

      return ctx.reply(
        box('¡Se han casado!', [
          `${inflect(me.genre, 'Esposa', 'Esposo', 'Esposx')}: ${displayName(me, ctx.senderNumber)} ♡`,
          `${inflect(partner.genre, 'Esposa', 'Esposo', 'Esposx')}: ${displayName(partner, other.number)} ♡`,
          'Disfruten de su luna de miel ✿'
        ])
      )
    }

    propose(ctx.senderNumber, other.number)

    await ctx.reply({
      text: box('Propuesta de matrimonio', [
        `@${other.number}, ${displayName(me, ctx.senderNumber)} te propuso matrimonio ♡`,
        `Para aceptar responde con ${ctx.prefix}${ctx.command} @${ctx.senderNumber} ✿`,
        'La propuesta expira en 2 minutos ❀'
      ]),
      mentions: [other.jid, ctx.sender]
    })
  }
}
