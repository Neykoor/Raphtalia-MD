import { box, displayName, getUser, inflect, progressOf, rankOf, targetRaw, whoIs } from '../../utils/profiles.js'

export default {
  name: 'profile',
  aliases: ['perfil'],
  description: 'Muestra tu perfil o el de otro usuario (@usuario o responder)',
  run: async ctx => {
    const target = await whoIs(ctx, targetRaw(ctx))
    const user = getUser(target.number)

    if (!user) {
      return ctx.reply(box('Sin registro', ['Ese usuario aún no está registrado en el bot ✗']))
    }

    const partner = user.marry ? getUser(user.marry) : null
    const { progress, needed, percent } = progressOf(user)

    const lines = [
      `Nombre: ${displayName(user, target.number)} ❀`,
      ...(user.desc ? [`Descripción: ${user.desc} ✿`] : []),
      `Cumpleaños: ${user.birth || 'Sin especificar'} ♡`,
      `Pasatiempo: ${user.hobby || 'No definido'} ✧`,
      `Género: ${user.genre || 'Oculto'} ❀`,
      `${inflect(user.genre, 'Casada con', 'Casado con', 'Casadx con')}: ${user.marry ? displayName(partner, user.marry) : 'Nadie'} ♡`,
      `Nivel: ${user.level} ✿`,
      `Experiencia: ${user.exp.toLocaleString('es-CO')} ❀`,
      `Progreso: ${progress} / ${needed} (${percent}%) ✧`,
      `Puesto: #${rankOf(target.number)} ♡`,
      `Comandos ejecutados: ${user.commands.toLocaleString('es-CO')} ✿`
    ]

    const caption = box('Perfil', lines)
    const picture = await ctx.sock.profilePictureUrl(target.jid, 'image').catch(() => null)

    if (!picture) return ctx.reply(caption)

    await ctx.reply({ image: { url: picture }, caption })
  }
}
