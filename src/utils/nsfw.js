import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import log from './logger.js'
import { displayName, getUser, targetRaw, whoIs } from './profiles.js'
import { isEnabled } from './settings.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const USER_AGENT = 'Mozilla/5.0 (compatible; Raphtalia-MD)'
const API_TIMEOUT = 15000
const DOWNLOAD_TIMEOUT = 45000
const FFMPEG_TIMEOUT = 60000
const MAX_BYTES = 15 * 1024 * 1024
const MAX_CANDIDATES = 6
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])
const ANIMATED_EXTENSIONS = new Set(['gif', 'mp4', 'webm'])
const BLOCKED_PREFIX = /^(loli|shota|toddler|underage|infant|preteen|prepubescent|kindergarten)/
const BLOCKED_WORD = /(^|_)(loli|lolicon|shota|shotacon)(_|$)/
const BLOCKED_EXACT = new Set(['child', 'children', 'little_girl', 'little_boy'])

const mark = (ctx, emoji) => ctx.react(emoji).catch(() => {})

const shuffle = list => {
  const copy = [...list]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}

const pick = value => (Array.isArray(value) ? value[Math.floor(Math.random() * value.length)] : value)

const isBlocked = tag => BLOCKED_PREFIX.test(tag) || BLOCKED_WORD.test(tag) || BLOCKED_EXACT.has(tag)

const hasBlockedTag = tags => String(tags || '').toLowerCase().split(/\s+/).some(isBlocked)

const extensionOf = url => {
  try {
    return new URL(url).pathname.split('.').pop().toLowerCase()
  } catch {
    return ''
  }
}

const getJson = async url => {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(API_TIMEOUT)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

const purrbot = async category => {
  const bases = ['https://purrbot.site/api/img/nsfw', 'https://api.purrbot.site/v2/img/nsfw']

  for (const base of bases) {
    try {
      const data = await getJson(`${base}/${pick(category)}/gif`)
      if (data?.link) return [data.link]
    } catch {}
  }

  return []
}

const waifupics = async category => {
  const data = await getJson(`https://api.waifu.pics/nsfw/${pick(category)}`)
  return data?.url ? [data.url] : []
}

const nekobot = async type => {
  const data = await getJson(`https://nekobot.xyz/api/image?type=${pick(type)}`)
  return data?.success && data.message ? [data.message] : []
}

const sites = {
  danbooru: {
    maxTags: 1,
    url: tags =>
      `https://danbooru.donmai.us/posts.json?limit=60&random=true&tags=${encodeURIComponent(`rating:e ${tags.join(' ')}`)}`,
    parse: posts => posts.map(post => ({ url: post.file_url || post.large_file_url, tags: post.tag_string }))
  },
  yandere: {
    maxTags: 4,
    url: tags =>
      `https://yande.re/post.json?limit=100&tags=${encodeURIComponent(`rating:explicit order:random ${tags.join(' ')}`)}`,
    parse: posts => posts.map(post => ({ url: post.file_url, tags: post.tags }))
  },
  konachan: {
    maxTags: 4,
    url: tags =>
      `https://konachan.com/post.json?limit=100&tags=${encodeURIComponent(`rating:explicit order:random ${tags.join(' ')}`)}`,
    parse: posts => posts.map(post => ({ url: post.file_url, tags: post.tags }))
  }
}

export const booruSites = Object.keys(sites)

const rank = items => {
  const valid = items.filter(item => {
    if (typeof item.url !== 'string' || !item.url.startsWith('http')) return false
    const extension = extensionOf(item.url)
    if (!IMAGE_EXTENSIONS.has(extension) && !ANIMATED_EXTENSIONS.has(extension)) return false
    return !hasBlockedTag(item.tags)
  })

  const unique = [...new Map(valid.map(item => [item.url, item])).values()]
  const animated = shuffle(unique.filter(item => ANIMATED_EXTENSIONS.has(extensionOf(item.url))))
  const still = shuffle(unique.filter(item => !ANIMATED_EXTENSIONS.has(extensionOf(item.url))))

  return [...animated, ...still].slice(0, MAX_CANDIDATES).map(item => item.url)
}

const searchSites = async (tags, names) => {
  for (const name of shuffle(names)) {
    const site = sites[name]
    try {
      const data = await getJson(site.url(tags.slice(0, site.maxTags)))
      const urls = rank(site.parse(Array.isArray(data) ? data : []))
      if (urls.length) return urls
    } catch (error) {
      log.warn(`nsfw ${name}: ${error.message}`)
    }
  }

  return []
}

const booru = async tags => {
  for (const tag of tags) {
    const urls = await searchSites([tag], booruSites)
    if (urls.length) return urls
  }

  return []
}

const resolvers = { purrbot, waifupics, nekobot, booru }

async function* candidates(sources) {
  for (const source of sources) {
    const [key, value] = Object.entries(source)[0]
    try {
      for (const url of await resolvers[key](value)) yield url
    } catch (error) {
      log.warn(`nsfw ${key}: ${error.message}`)
    }
  }
}

const download = async url => {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Referer: `${new URL(url).origin}/` },
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT)
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('archivo demasiado grande')

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_BYTES) throw new Error('archivo demasiado grande')
  return buffer
}

const runFfmpeg = args =>
  new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''

    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(new Error('ffmpeg tardó demasiado'))
    }, FFMPEG_TIMEOUT)

    proc.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    proc.on('error', error => {
      clearTimeout(timer)
      reject(error.code === 'ENOENT' ? new Error('ffmpeg no está instalado') : error)
    })

    proc.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(stderr.trim().split('\n').pop() || `ffmpeg salió con código ${code}`))
    })
  })

const toMp4 = async (buffer, extension) => {
  const dir = await mkdtemp(join(tmpdir(), 'raphtalia-nsfw-'))

  try {
    const input = join(dir, `input.${extension}`)
    const output = join(dir, 'output.mp4')
    await writeFile(input, buffer)
    await runFfmpeg([
      '-y',
      '-i',
      input,
      '-t',
      '20',
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '28',
      '-pix_fmt',
      'yuv420p',
      '-vf',
      'scale=trunc(iw/2)*2:trunc(ih/2)*2',
      '-movflags',
      '+faststart',
      output
    ])
    return await readFile(output)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

const prepare = async url => {
  const extension = extensionOf(url)
  const buffer = await download(url)

  if (IMAGE_EXTENSIONS.has(extension)) return { image: buffer }
  if (extension === 'mp4') return { video: buffer, mimetype: 'video/mp4', gifPlayback: true }

  try {
    return { video: await toMp4(buffer, extension), mimetype: 'video/mp4', gifPlayback: true }
  } catch (error) {
    if (extension !== 'gif') throw error
    log.warn(`nsfw conversión: ${error.message}`)
    return { image: buffer }
  }
}

export const deliver = async (ctx, sources, caption, mentions = []) => {
  for await (const url of candidates(sources)) {
    try {
      const media = await prepare(url)
      await ctx.reply({ ...media, caption, mentions })
      return true
    } catch (error) {
      log.warn(`nsfw envío: ${error.message}`)
    }
  }

  return false
}

export const guard = async ctx => {
  if (!ctx.isGroup || isEnabled(ctx.chat, 'nsfw')) return true

  await ctx.reply(
    box('NSFW desactivado', [
      'El contenido +18 está desactivado en este grupo ✗',
      `Un administrador puede activarlo con ${ctx.prefix}on nsfw ✿`
    ])
  )
  return false
}

const failure = ctx =>
  ctx.reply(box('Sin resultados', ['No pude obtener contenido en este momento ✗', 'Intenta de nuevo en unos segundos ❀']))

export const reactions = list => {
  const byCommand = new Map()
  for (const item of list) for (const key of [item.name, ...item.aliases]) byCommand.set(key, item)

  const [first, ...rest] = list

  return {
    name: 'reacciones',
    aliases: ['reactions18', ...first.aliases, ...rest.flatMap(item => [item.name, ...item.aliases]), first.name],
    description: 'Reacciones +18 entre usuarios (usa .reacciones para ver la lista)',
    groupOnly: true,
    run: async ctx => {
      if (!(await guard(ctx))) return

      const item = byCommand.get(ctx.command)

      if (!item) {
        return ctx.reply(
          box('Reacciones +18', [
            `Uso: ${ctx.prefix}<reacción> @usuario o responder ✿`,
            ...list.map(entry => `${[entry.name, ...entry.aliases].join(' / ')}`)
          ])
        )
      }

      const target = await whoIs(ctx, targetRaw(ctx))
      const senderName = displayName(getUser(ctx.senderNumber), ctx.pushName || ctx.senderNumber)
      const targetName = displayName(getUser(target.number), target.number)

      const caption = target.own
        ? `*${senderName}* ${item.self} ✿`
        : `*${senderName}* ${item.other} *${targetName}* ✿`

      await mark(ctx, '🕒')

      const sent = await deliver(ctx, item.sources, caption, [ctx.sender, target.jid])

      if (!sent) {
        await mark(ctx, '✖️')
        return failure(ctx)
      }

      await mark(ctx, '✔️')
    }
  }
}

export const search = ({ name, aliases = [], description, names }) => ({
  name,
  aliases,
  description,
  run: async ctx => {
    if (!(await guard(ctx))) return

    const tags = ctx.args.map(tag => tag.toLowerCase()).filter(Boolean).slice(0, 4)

    if (!tags.length) {
      return ctx.reply(box('Falta una etiqueta', [`Ejemplo: ${ctx.prefix}${ctx.command} neko ✿`]))
    }

    if (tags.some(isBlocked)) {
      return ctx.reply(box('Búsqueda no permitida', ['Esa etiqueta está bloqueada ✗']))
    }

    await mark(ctx, '🕒')

    const urls = await searchSites(tags, names)
    let sent = false

    for (const url of urls) {
      try {
        await ctx.reply({ ...(await prepare(url)), caption: `Resultados para » ${tags.join(' ')}` })
        sent = true
        break
      } catch (error) {
        log.warn(`nsfw envío: ${error.message}`)
      }
    }

    if (!sent) {
      await mark(ctx, '✖️')
      return ctx.reply(box('Sin resultados', [`No encontré nada para "${tags.join(' ')}" ✗`]))
    }

    await mark(ctx, '✔️')
  }
})

export const random = ({ name, aliases = [], description, sources }) => ({
  name,
  aliases,
  description,
  run: async ctx => {
    if (!(await guard(ctx))) return

    await mark(ctx, '🕒')

    if (!(await deliver(ctx, sources, `${ctx.prefix}${name} ✿`))) {
      await mark(ctx, '✖️')
      return failure(ctx)
    }

    await mark(ctx, '✔️')
  }
})
