import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(exec)

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const TIMEOUT = 120000
const MAX_OUTPUT = 4000

const mark = (ctx, emoji) => ctx.react(emoji).catch(() => {})

const clip = text => (text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n... (${text.length - MAX_OUTPUT} caracteres más)` : text)

export default {
  name: 'r',
  aliases: ['shell'],
  description: 'Ejecuta comandos del sistema',
  ownerOnly: true,
  run: async ctx => {
    const command = ctx.text.trim()

    if (!command) {
      return ctx.reply(box('Falta el comando', [`Ejemplo: ${ctx.prefix}${ctx.command} ls ✿`]))
    }

    await mark(ctx, '🕒')

    let output

    try {
      output = await run(command, { timeout: TIMEOUT, maxBuffer: 10 * 1024 * 1024 })
      await mark(ctx, '✔️')
    } catch (error) {
      output = { stdout: error.stdout ?? '', stderr: error.stderr || error.message || '' }
      await mark(ctx, '✖️')
    }

    const stdout = String(output.stdout ?? '').trim()
    const stderr = String(output.stderr ?? '').trim()

    if (stdout) await ctx.reply(clip(stdout))
    if (stderr) await ctx.reply(clip(stderr))
    if (!stdout && !stderr) await ctx.reply(box('Sin salida', ['El comando terminó sin mostrar nada ✿']))
  }
}
