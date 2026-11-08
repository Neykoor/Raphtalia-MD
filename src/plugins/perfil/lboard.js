import { allUsers, box, displayName, progressOf } from '../../utils/profiles.js'

const PAGE_SIZE = 10

export default {
  name: 'lboard',
  aliases: ['lb', 'leaderboard', 'top'],
  description: 'Top de usuarios con más experiencia',
  run: async ctx => {
    const sorted = allUsers()
      .filter(user => user.exp >= 1)
      .sort((a, b) => b.exp - a.exp || b.commands - a.commands)

    if (!sorted.length) {
      return ctx.reply(box('Sin datos', ['Aún no hay usuarios con experiencia ✗']))
    }

    const totalPages = Math.ceil(sorted.length / PAGE_SIZE)
    const page = Number(ctx.args[0]) || 1

    if (!Number.isInteger(page) || page < 1 || page > totalPages) {
      return ctx.reply(box('Página inválida', [`La página ${ctx.args[0]} no existe, hay ${totalPages} ✗`]))
    }

    const start = (page - 1) * PAGE_SIZE
    const rows = sorted.slice(start, start + PAGE_SIZE).map((user, index) => {
      const { progress, needed, percent } = progressOf(user)
      return `❏ *${start + index + 1}. ${displayName(user, user.number)}*\n> XP: ${user.exp.toLocaleString('es-CO')} · Nivel: ${user.level}\n> Progreso: ${progress} / ${needed} (${percent}%)`
    })

    const footer = [`Página ${page} de ${totalPages} ✿`]
    if (page < totalPages) footer.push(`Siguiente: ${ctx.prefix}${ctx.command} ${page + 1} ❀`)

    await ctx.reply([box('Top de experiencia', footer), '', ...rows].join('\n'))
  }
}
