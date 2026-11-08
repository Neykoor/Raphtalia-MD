import config from '../../../config.js'

export default {
  name: 'ping',
  aliases: ['p'],
  description: 'Muestra la latencia del bot',
  run: async ctx => {
    const start = Date.now()
    const sent = await ctx.reply(`\`❏ ¡Pong!\`\n> *${config.botName}*`)
    const latency = Date.now() - start
    if (sent?.key) await ctx.send({ text: `✿ *Pong!*\n> Tiempo ⴵ ${latency}ms`, edit: sent.key })
  }
}
