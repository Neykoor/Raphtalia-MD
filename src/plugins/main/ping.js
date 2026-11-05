export default {
  name: 'ping',
  description: 'Muestra la latencia del bot',
  run: async ctx => {
    const start = performance.now()
    const sent = await ctx.reply('Pong...')
    const text = `Pong: ${Math.round(performance.now() - start)} ms`

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
