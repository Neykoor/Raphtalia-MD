const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

export default {
  name: 'restart',
  aliases: ['reiniciar'],
  description: 'Reinicia el bot',
  ownerOnly: true,
  run: async ctx => {
    await ctx.reply(box('Reiniciando', ['Espera un momento ✿']))

    setTimeout(() => {
      if (process.send) process.send('restart')
      else process.exit(0)
    }, 3000)
  }
}
