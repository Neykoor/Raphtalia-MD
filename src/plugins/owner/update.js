import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { loadPlugins } from '../../core/loader.js'

const run = promisify(exec)

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const TIMEOUT = 120000
const MAX_OUTPUT = 3000

const mark = (ctx, emoji) => ctx.react(emoji).catch(() => {})

const clip = text => (text.length > MAX_OUTPUT ? `${text.slice(0, MAX_OUTPUT)}\n...` : text)

export default {
  name: 'update',
  aliases: ['fix', 'actualizar'],
  description: 'Actualiza el bot con git pull y recarga los plugins',
  ownerOnly: true,
  run: async ctx => {
    await mark(ctx, '🕒')

    try {
      const { stdout } = await run('git pull', { timeout: TIMEOUT, cwd: process.cwd() })
      const result = await loadPlugins()
      const upToDate = /already up to date|ya est[aá] actualizado/i.test(stdout)

      await mark(ctx, '✔️')
      await ctx.reply(
        box(upToDate ? 'Todo está al día' : 'Actualización completada', [
          ...(upToDate ? [] : [clip(stdout.trim())]),
          `Plugins recargados: ${result.commands} comandos en ${result.files} archivos ✿`
        ])
      )
    } catch (error) {
      await mark(ctx, '✖️')
      await ctx.reply(box('No se pudo actualizar', [`Motivo: ${clip((error.stderr || error.message || 'desconocido').trim())} ✧`]))
    }
  }
}
