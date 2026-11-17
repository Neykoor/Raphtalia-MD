import config from '../../../config.js'
import { cap, cleanName, define, formatBytes, getText, headType, mark, sendWithRetry, usage } from '../../utils/downloads.js'

const LINK_RE = /drive\.google\.com\/(file\/d\/|open\?id=|uc\?id=)/i

const scrape = async url => {
  const id = (url.match(/[?&]id=([^&]+)/i) ?? url.match(/\/d\/([^/?#]+)/))?.[1]
  if (!id) throw new Error('No se encontró ID de descarga')

  const body = await getText(`https://drive.google.com/uc?id=${id}&authuser=0&export=download`, {
    method: 'POST',
    timeout: 30000,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      Origin: 'https://drive.google.com',
      'x-drive-first-party': 'DriveWebUi',
      'x-json-requested': 'true'
    }
  })

  const data = JSON.parse(body.slice(body.indexOf('{')))
  if (!data.downloadUrl) throw new Error('Se excedió el número de descargas del link')

  return {
    fileName: data.fileName,
    bytes: Number(data.sizeBytes || 0),
    mimetype: (await headType(data.downloadUrl)) || 'application/octet-stream',
    downloadUrl: data.downloadUrl
  }
}

export default define({
  name: 'gdrive',
  aliases: ['drive'],
  description: 'Descarga un archivo de Google Drive',
  run: async ctx => {
    const link = ctx.args[0]
    if (!link) return usage(ctx, 'Por favor, ingresa un link de Google Drive.', 'https://drive.google.com/file/d/xxxx/view')
    if (!LINK_RE.test(link)) return ctx.reply('ꕥ La URL no parece válida de Google Drive.')

    await mark(ctx, '🕒')
    const file = await scrape(link)
    const limit = (config.downloads?.maxFileMb ?? 500) * 1024 * 1024

    if (file.bytes > limit) {
      await mark(ctx, '✖️')
      return ctx.reply(`ꕥ El archivo es demasiado grande (${formatBytes(file.bytes)}).\n> Descárgalo directamente desde aquí:\n${link}`)
    }

    const caption = cap('Google Drive', [
      ['Nombre', file.fileName],
      ['Tamaño', formatBytes(file.bytes)],
      ['Tipo', file.mimetype],
      ['Enlace', link]
    ])

    await sendWithRetry(ctx, {
      document: { url: file.downloadUrl },
      mimetype: file.mimetype,
      fileName: cleanName(file.fileName),
      caption
    })
    return mark(ctx, '✔️')
  }
})
