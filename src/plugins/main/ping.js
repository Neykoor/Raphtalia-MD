import config from '../../../config.js'
import { panel } from '../../utils/panel.js'

export default {
  name: 'ping',
  aliases: ['p'],
  description: 'Muestra la latencia del bot',
  run: async ctx => {
    const start = performance.now()
    const sent = await ctx.reply(panel('Pong', [`Midiendo ✧`]))
    const latency = Math.round(performance.now() - start)

    const text = panel('Pong', [
      ['Latencia', `${latency} ms`],
      ['Bot', config.botName],
      ['Tipo', ctx.sock.isJadibot ? 'Sub Bot' : 'Principal']
    ])

    if (sent?.key) {
      const edited = await ctx.send({ text, edit: sent.key }).then(
        () => true,
        () => false
      )
      if (edited) return
    }

    await ctx.reply(text)
  }
}
