import { box, displayName, getUser, progressOf, rankOf, targetRaw, whoIs } from '../../utils/profiles.js'

export default {
  name: 'level',
  aliases: ['lvl', 'nivel'],
  description: 'Muestra tu nivel y experiencia (@usuario o responder)',
  run: async ctx => {
    const target = await whoIs(ctx, targetRaw(ctx))
    const user = getUser(target.number)

    if (!user) {
      return ctx.reply(box('Sin registro', ['Ese usuario aún no está registrado en el bot ✗']))
    }

    const { progress, needed, percent } = progressOf(user)

    await ctx.reply(
      box('Nivel', [
        `Usuario: ${displayName(user, target.number)} ❀`,
        `Nivel: ${user.level} ✿`,
        `Experiencia: ${user.exp.toLocaleString('es-CO')} ♡`,
        `Progreso: ${progress} / ${needed} (${percent}%) ✧`,
        `Puesto: #${rankOf(target.number)} ❀`,
        `Comandos ejecutados: ${user.commands.toLocaleString('es-CO')} ✿`
      ])
    )
  }
}
