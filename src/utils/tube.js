import log from './logger.js'
import { guard, isBlocked } from './nsfw.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const TIMEOUT = 20000
const MAX_RESULTS = 10
const BLOCKED_TITLE = /\b(loli\w*|shota\w*|underage|child\w*|kids?|toddler|preteen|minor|niñ[oa]s?|menor(es)?)\b/i

const mark = (ctx, emoji) => ctx.react(emoji).catch(() => {})

const decode = value =>
  String(value ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

const getHtml = async url => {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

const meta = (html, property) =>
  decode(
    html.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'))?.[1] ??
      html.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i'))?.[1] ??
      ''
  )

const videoUrls = html => ({
  high: html.match(/html5player\.setVideoUrlHigh\('([^']*)'\)/)?.[1] || '',
  low: html.match(/html5player\.setVideoUrlLow\('([^']*)'\)/)?.[1] || ''
})

const formatSeconds = value => {
  const seconds = Number.parseInt(value, 10) || 0
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${seconds}s`
}

const xnxx = {
  host: 'xnxx.com',
  base: 'https://www.xnxx.com',
  search: async query => {
    const page = Math.floor(Math.random() * 3) + 1
    const html = await getHtml(`https://www.xnxx.com/search/${encodeURIComponent(query)}/${page}`)

    return html
      .split('class="thumb-under"')
      .slice(1)
      .map(block => {
        const href = block.match(/href="([^"]+)"/)?.[1]
        const title = block.match(/title="([^"]*)"/)?.[1]
        return href && title ? { title: decode(title), url: `https://www.xnxx.com${href.replace('/THUMBNUM/', '/')}` } : null
      })
      .filter(Boolean)
  },
  info: async url => {
    const html = await getHtml(url)
    const files = videoUrls(html)
    return {
      title: meta(html, 'og:title') || html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() || 'video',
      duration: formatSeconds(meta(html, 'og:duration')),
      file: files.high || files.low
    }
  }
}

const xvideos = {
  host: 'xvideos.com',
  base: 'https://www.xvideos.com',
  search: async query => {
    const html = await getHtml(`https://www.xvideos.com/?k=${encodeURIComponent(query)}`)

    return [...html.matchAll(/<p class="title">\s*<a href="([^"]+)"[^>]*title="([^"]*)"/g)].map(([, href, title]) => ({
      title: decode(title),
      url: `https://www.xvideos.com${href}`
    }))
  },
  info: async url => {
    const html = await getHtml(url)
    const files = videoUrls(html)
    return {
      title: meta(html, 'og:title') || 'video',
      duration: formatSeconds(meta(html, 'og:duration')),
      file: files.high || files.low
    }
  }
}

export const sources = { xnxx, xvideos }

export const tube = ({ name, aliases = [], description }) => {
  const source = sources[name]

  return {
    name,
    aliases,
    description,
    run: async ctx => {
      if (!(await guard(ctx))) return

      const query = ctx.text.trim()

      if (!query) {
        return ctx.reply(
          box('Falta el título', [`Ejemplo: ${ctx.prefix}${ctx.command} <título> o ${ctx.prefix}${ctx.command} <url> ✿`])
        )
      }

      let url = null

      if (/^https?:\/\//i.test(query)) {
        try {
          const host = new URL(query).hostname
          if (host !== source.host && !host.endsWith(`.${source.host}`)) throw new Error('host')
          url = query
        } catch {
          return ctx.reply(box('Enlace no válido', [`Solo acepto enlaces de ${source.host} ✗`]))
        }
      } else if (query.toLowerCase().split(/\s+/).some(isBlocked)) {
        return ctx.reply(box('Búsqueda no permitida', ['Ese término está bloqueado ✗']))
      }

      await mark(ctx, '🕒')

      try {
        if (!url) {
          const results = (await source.search(query)).filter(item => !BLOCKED_TITLE.test(item.title)).slice(0, MAX_RESULTS)

          if (!results.length) {
            await mark(ctx, '✖️')
            return ctx.reply(box('Sin resultados', [`No encontré nada para "${query}" ✗`]))
          }

          await mark(ctx, '✔️')
          return ctx.reply(
            box(
              `${name.toUpperCase()} - búsqueda`,
              [
                ...results.map((item, index) => `${index + 1}. ${item.title}\n> ✧ ${item.url}`),
                `Descarga con ${ctx.prefix}${ctx.command} <url> ✿`
              ]
            )
          )
        }

        const info = await source.info(url)

        if (BLOCKED_TITLE.test(info.title)) {
          await mark(ctx, '✖️')
          return ctx.reply(box('Contenido no permitido', ['Ese video está bloqueado ✗']))
        }

        if (!info.file) throw new Error('no se encontró el archivo de video')

        await ctx.reply({
          document: { url: info.file },
          mimetype: 'video/mp4',
          fileName: `${info.title.replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || 'video'}.mp4`,
          caption: box(`${name.toUpperCase()} - descarga`, [`Título: ${info.title}`, `Duración: ${info.duration}`])
        })
        await mark(ctx, '✔️')
      } catch (error) {
        log.warn(`${name}: ${error.message}`)
        await mark(ctx, '✖️')
        await ctx.reply(box('Sin resultados', ['No pude obtener el contenido en este momento ✗', 'Intenta de nuevo más tarde ❀']))
      }
    }
  }
}
