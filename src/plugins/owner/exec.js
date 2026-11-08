import { createRequire } from 'node:module'
import { format } from 'node:util'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const AsyncFunction = (async () => {}).constructor
const require = createRequire(import.meta.url)
const MAX_PRINTS = 15
const MAX_OUTPUT = 4000

const mark = (ctx, emoji) => ctx.react(emoji).catch(() => {})

const clip = text => (text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n... (${text.length - MAX_OUTPUT} caracteres más)` : text)

export default {
  name: 'ex',
  aliases: ['e'],
  description: 'Ejecuta código JavaScript en el bot',
  ownerOnly: true,
  run: async ctx => {
    const code = ctx.text.trim()

    if (!code) {
      return ctx.reply(box('Falta el código', [`Ejemplo: ${ctx.prefix}${ctx.command} 1 + 1 ✿`, `Con ${ctx.prefix}e se devuelve el resultado directamente ❀`]))
    }

    const source = (ctx.command === 'e' ? 'return ' : '') + code
    let remaining = MAX_PRINTS
    let result

    await mark(ctx, '🕒')

    try {
      const fn = new AsyncFunction('print', 'ctx', 'msg', 'sock', 'require', 'process', 'args', source)
      const print = (...values) => {
        if (--remaining < 0) return
        return ctx.reply(clip(format(...values)))
      }

      result = await fn.call(ctx.sock, print, ctx, ctx, ctx.sock, require, process, ctx.args)
      await mark(ctx, '✔️')
    } catch (error) {
      result = error
      await mark(ctx, '✖️')
    }

    await ctx.reply(clip(format(result)))
  }
}
