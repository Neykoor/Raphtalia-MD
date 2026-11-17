import { extname } from 'node:path'
import config from '../../../config.js'
import { cap, cleanName, decodeHtml, define, getText, mark, parseSize, sendWithRetry, usage } from '../../utils/downloads.js'

const LINK_RE = /^https?:\/\/(www\.)?mediafire\.com\/.+/i

const MIME = {
  apk: 'application/vnd.android.package-archive',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  txt: 'text/plain',
  json: 'application/json',
  mkv: 'video/x-matroska'
}

const clean = value => decodeHtml(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()

const absolute = link => {
  if (!link) return null
  if (link.startsWith('//')) return `https:${link}`
  if (link.startsWith('/')) return `https://www.mediafire.com${link}`
  return /^https?:\/\//i.test(link) ? link : null
}

const downloadLink = html => {
  const anchor = html.match(/<a\b[^>]*\bid=["']downloadButton["'][^>]*>/i)?.[0] ?? ''
  const href = decodeHtml(anchor.match(/\bhref=["']([^"']*)["']/i)?.[1])
  const scrambled = anchor.match(/data-scrambled-url=["']([^"']*)["']/i)?.[1]

  const direct = absolute(href)
  if (direct) return direct

  if (scrambled) {
    const decoded = Buffer.from(scrambled, 'base64').toString('utf8')
    if (/^https?:\/\//i.test(decoded)) return decoded
  }

  return html.match(/https?:\/\/download\d*\.mediafire\.com\/[^"'\s<>]+/i)?.[0] ?? null
}

const scrape = async url => {
  const html = await getText(url, { headers: { 'Accept-Language': 'en-US,en;q=0.9' }, timeout: 45000 })
  const link = downloadLink(html)
  if (!link) throw new Error('No se encontró el enlace de descarga')

  const filename =
    clean(html.match(/<div[^>]*class=["'][^"']*\bfilename\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]) ||
    clean(html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i)?.[1]) ||
    clean(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]) ||
    'archivo'

  const size = clean(html.match(/File size:\s*<span>([\s\S]*?)<\/span>/i)?.[1]) || null
  const uploaded = clean(html.match(/Uploaded:\s*<span>([\s\S]*?)<\/span>/i)?.[1]) || null

  return { link, filename, size, uploaded }
}

export default define({
  name: 'mediafire',
  aliases: ['mf'],
  description: 'Descarga un archivo de MediaFire',
  run: async ctx => {
    const link = ctx.args[0]
    if (!link) return usage(ctx, 'Por favor, ingresa el enlace de MediaFire.', 'https://www.mediafire.com/file/xxxx')
    if (!LINK_RE.test(link)) return ctx.reply('ꕥ Por favor, ingresa un enlace válido de MediaFire.')

    await mark(ctx, '🕒')
    const file = await scrape(link)
    const bytes = parseSize(file.size)
    const limit = (config.downloads?.maxFileMb ?? 500) * 1024 * 1024

    if (bytes > limit) {
      await mark(ctx, '✖️')
      return ctx.reply(`ꕥ El archivo es demasiado grande (${file.size}).\n> Descárgalo directamente desde aquí:\n${file.link}`)
    }

    const extension = extname(file.filename).replace('.', '').toLowerCase()
    const mimetype = MIME[extension] ?? 'application/octet-stream'
    const caption = cap('MediaFire', [
      ['Nombre', file.filename],
      ['Tipo', mimetype],
      ['Peso', file.size],
      ['Subido', file.uploaded]
    ])

    await sendWithRetry(ctx, { document: { url: file.link }, mimetype, fileName: cleanName(file.filename), caption })
    return mark(ctx, '✔️')
  }
})
