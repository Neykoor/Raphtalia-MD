import config from '../../../config.js'
import { cap, cleanName, define, formatBytes, getJson, mark, sendWithRetry, usage } from '../../utils/downloads.js'

const search = async query => {
  const res = await getJson(`https://ws75.aptoide.com/api/7/apps/search/query=${encodeURIComponent(query)}/limit=1`)
  return res?.datalist?.list?.[0] ?? null
}

export default define({
  name: 'apk',
  aliases: ['aptoide', 'apkdl'],
  description: 'Busca y descarga aplicaciones de Aptoide',
  run: async ctx => {
    if (!ctx.text) return usage(ctx, 'Por favor, ingresa el nombre de la aplicación.', 'whatsapp')

    await mark(ctx, '🕒')
    const app = await search(ctx.text)
    if (!app) {
      await mark(ctx, '✖️')
      return ctx.reply(`ꕥ No se encontraron resultados para *${ctx.text}*.`)
    }

    const url = app.file?.path || app.file?.path_alt
    if (!url) {
      await mark(ctx, '✖️')
      return ctx.reply('ꕥ No se pudo obtener la información de la aplicación.')
    }

    const bytes = Number(app.size || app.file?.filesize || 0)
    const limit = (config.downloads?.maxFileMb ?? 500) * 1024 * 1024

    if (bytes > limit) {
      await mark(ctx, '✖️')
      return ctx.reply(`ꕥ El archivo es demasiado grande (${formatBytes(bytes)}).\n> Descárgalo directamente desde aquí:\n${url}`)
    }

    const caption = cap('Aptoide', [
      ['Nombre', app.name],
      ['Paquete', app.package],
      ['Versión', app.file?.vername],
      ['Última actualización', app.modified || app.updated],
      ['Tamaño', formatBytes(bytes)]
    ])

    await sendWithRetry(ctx, {
      document: { url },
      mimetype: 'application/vnd.android.package-archive',
      fileName: `${cleanName(app.name, 'app')}.apk`,
      caption
    })
    return mark(ctx, '✔️')
  }
})
