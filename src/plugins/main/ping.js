export default {
  name: 'ping',
  description: 'Muestra la latencia del bot',
  run: async ctx => {
    const latency = Math.max(0, Date.now() - ctx.timestamp * 1000)
    await ctx.reply(`Pong: ${latency} ms`)
  }
}
