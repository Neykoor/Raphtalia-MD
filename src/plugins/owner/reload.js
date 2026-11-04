import { loadPlugins } from '../../core/loader.js'

export default {
  name: 'reload',
  aliases: ['recargar'],
  description: 'Recarga los plugins sin reiniciar',
  ownerOnly: true,
  run: async ctx => {
    const result = await loadPlugins()
    await ctx.reply(`Plugins recargados: ${result.commands} comandos en ${result.files} archivos.`)
  }
}
