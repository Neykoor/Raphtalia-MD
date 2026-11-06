import { listJadibots } from '../../core/jadibot.js'

export default {
  name: 'bots',
  aliases: ['subbots', 'listjadibot'],
  description: 'Lista los sub-bots activos',
  ownerOnly: true,
  run: async ctx => {
    const subs = listJadibots()

    if (!subs.length) return ctx.reply('No hay sub-bots activos.')

    const lines = subs.map(sub => `> ${sub.number} - ${sub.online ? 'en línea' : 'conectando'}`)
    await ctx.reply([`*Sub-bots: ${subs.length}*`, ...lines].join('\n'))
  }
}
