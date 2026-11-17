import { api, cap, chain, define, deepUrl, getJson, getText, mark, sendVideo, usage } from '../../utils/downloads.js'

const LINK_RE = /facebook\.com|fb\.watch|video\.fb\.com/i

const unescapeJson = value =>
  String(value || '')
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')

const scrape = async url => {
  const html = await getText(url, {
    headers: {
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    timeout: 45000
  })
  const hd = html.match(/"browser_native_hd_url":"((?:\\.|[^"\\])+)"/)?.[1]
  const sd = html.match(/"browser_native_sd_url":"((?:\\.|[^"\\])+)"/)?.[1]
  const best = unescapeJson(hd || sd || '')
  if (!best) return null
  const title = html.match(/property="og:title" content="([^"]+)"/i)?.[1] ?? null
  return { url: best, title: title ? unescapeJson(title) : null, resolution: hd ? 'HD' : 'SD' }
}

const providers = url => {
  const encoded = encodeURIComponent(url)
  return [
    () => scrape(url),
    async () => {
      const res = await getJson(`${api('delirius').url}/download/facebook?url=${encoded}`)
      const found = res?.urls?.[0]?.hd || res?.urls?.[0]?.sd || deepUrl(res, ['hd', 'sd', 'url'])
      return found ? { url: found, title: res?.title || null, resolution: res?.urls?.[0]?.hd ? 'HD' : 'SD' } : null
    },
    async () => {
      const res = await getJson(`${api('zenzxz').url}/download/facebook?url=${encoded}`)
      const found = deepUrl(res, ['hd', 'sd', 'url', 'download'])
      return found ? { url: found } : null
    },
    async () => {
      const res = await getJson(`${api('siputzx').url}/api/d/facebook?url=${encoded}`)
      const found = deepUrl(res, ['hd', 'sd', 'url', 'download', 'dl'])
      return found ? { url: found } : null
    }
  ]
}

export default define({
  name: 'facebook',
  aliases: ['fb'],
  description: 'Descarga un video de Facebook',
  run: async ctx => {
    const link = ctx.args[0]
    if (!link) return usage(ctx, 'Por favor, ingresa un enlace de Facebook.', 'https://fb.watch/xxxx')
    if (!LINK_RE.test(link)) return ctx.reply('ꕥ El enlace es inválido, envía un link de Facebook válido.')

    await mark(ctx, '🕒')
    const data = await chain(providers(link))
    if (!data?.url) {
      await mark(ctx, '✖️')
      return ctx.reply('ꕥ No se pudo obtener el contenido.')
    }

    const caption = cap('Facebook Download', [
      ['Título', data.title],
      ['Resolución', data.resolution],
      ['Enlace', link]
    ])
    await sendVideo(ctx, { url: data.url, caption, fileName: 'fb.mp4' })
    return mark(ctx, '✔️')
  }
})
