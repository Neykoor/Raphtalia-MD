import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import config from '../../config.js'
import log from './logger.js'
import { displayName, getUser, targetRaw, whoIs } from './profiles.js'
import { isEnabled } from './settings.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const API_TIMEOUT = 12000
const DOWNLOAD_TIMEOUT = 45000
const FFMPEG_TIMEOUT = 60000
const MAX_BYTES = 15 * 1024 * 1024
const MAX_CANDIDATES = 10
const SITE_COOLDOWN_MS = 60000
const MAX_SUGGESTIONS = 8
const MAX_RETRY_SUGGESTIONS = 3
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])
const ANIMATED_EXTENSIONS = new Set(['gif', 'mp4', 'webm'])
const BLOCKED_PREFIX = /^(loli|shota|toddler|underage|infant|preteen|prepubescent|kindergarten)/
const BLOCKED_WORD = /(^|_)(loli|lolicon|shota|shotacon)(_|$)/
const BLOCKED_EXACT = new Set([
  'child',
  'children',
  'little_girl',
  'little_boy',
  'cub',
  'young',
  'young_girl',
  'young_boy',
  'kid',
  'kids',
  'minor',
  'baby',
  'newborn'
])

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

export const isBlocked = tag => BLOCKED_PREFIX.test(tag) || BLOCKED_WORD.test(tag) || BLOCKED_EXACT.has(tag)

const hasBlockedTag = tags => String(tags || '').toLowerCase().split(/\s+/).some(isBlocked)

const extensionOf = url => {
  try {
    return new URL(url).pathname.split('.').pop().toLowerCase()
  } catch {
    return ''
  }
}

const getText = async url => {
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: '*/*' }, signal: AbortSignal.timeout(API_TIMEOUT) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

const parseJson = text => {
  const body = String(text ?? '').trim()
  if (!body) return null

  let data
  try {
    data = JSON.parse(body)
  } catch {
    throw new Error(body.startsWith('<') ? 'respuesta HTML (bloqueo o API caída)' : `respuesta no válida: ${body.slice(0, 80)}`)
  }

  if (data && !Array.isArray(data) && data.success === false) throw new Error(String(data.message || 'la API rechazó la petición'))
  return data
}

const getJson = async url => parseJson(await getText(url))

const decodeEntities = value =>
  String(value ?? '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

const parseXml = xml =>
  [...xml.matchAll(/<tag\s+((?:[^>"]|"[^"]*")*?)\s*\/?>/g)].map(([, attributes]) => {
    const read = name => decodeEntities(attributes.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1])
    return { file_url: read('file_url'), tags: read('tags') }
  })

const absolute = (value, base) => {
  if (typeof value !== 'string' || !value) return ''
  if (value.startsWith('//')) return `https:${value}`
  if (value.startsWith('/')) return `${base}${value}`
  return value
}

const normalizeTag = tag => String(tag ?? '').toLowerCase().trim().replace(/\s+/g, '_')

const creds = name => {
  const { userId, apiKey } = config.nsfw?.[name] ?? {}
  return userId && apiKey ? `&user_id=${encodeURIComponent(userId)}&api_key=${encodeURIComponent(apiKey)}` : ''
}

const warned = new Set()
const warnOnce = message => {
  if (warned.has(message)) return
  warned.add(message)
  log.warn(message)
}

const REFERERS = [
  ['rule34.xxx', 'https://rule34.xxx/'],
  ['paheal-cdn.net', 'https://rule34.paheal.net/'],
  ['paheal.net', 'https://rule34.paheal.net/'],
  ['gelbooru.com', 'https://gelbooru.com/'],
  ['donmai.us', 'https://danbooru.donmai.us/'],
  ['yande.re', 'https://yande.re/'],
  ['konachan.com', 'https://konachan.com/']
]

const refererFor = url => {
  const { hostname, origin } = new URL(url)
  return REFERERS.find(([suffix]) => hostname === suffix || hostname.endsWith(`.${suffix}`))?.[1] ?? `${origin}/`
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

const withCount = (tag, count) => ({ tag: normalizeTag(tag), count: Number(count) || 0 })

const sites = {
  rule34: {
    label: 'Rule34',
    base: 'https://api-cdn.rule34.xxx',
    maxTags: 5,
    enabled: () => Boolean(creds('rule34')),
    url: tags =>
      `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeURIComponent(tags.join(' '))}${creds('rule34')}`,
    parse: posts =>
      posts.map(post => ({
        url: post.file_url || (post.directory && post.image ? `https://api-cdn.rule34.xxx/images/${post.directory}/${post.image}` : ''),
        alt: post.sample_url,
        tags: post.tags
      })),
    suggest: async term => {
      const data = await getJson(`https://api.rule34.xxx/autocomplete.php?q=${encodeURIComponent(term)}${creds('rule34')}`)
      return (Array.isArray(data) ? data : []).map(item =>
        withCount(item.value ?? item.label, String(item.label ?? '').match(/\((\d+)\)\s*$/)?.[1])
      )
    }
  },
  paheal: {
    label: 'Rule34 (Paheal)',
    base: 'https://rule34.paheal.net',
    maxTags: 3,
    xml: true,
    url: tags => `https://rule34.paheal.net/api/danbooru/find_posts?limit=100&tags=${encodeURIComponent(tags.join(' '))}`,
    parse: posts => posts.map(post => ({ url: post.file_url, tags: post.tags })),
    suggest: async term => {
      const data = await getJson(`https://rule34.paheal.net/api/internal/autocomplete?s=${encodeURIComponent(term)}`)
      return Object.entries(data && !Array.isArray(data) ? data : {}).map(([tag, count]) => withCount(tag, count))
    }
  },
  gelbooru: {
    label: 'Gelbooru',
    base: 'https://gelbooru.com',
    maxTags: 4,
    list: data => data?.post,
    url: tags =>
      `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeURIComponent(`rating:explicit sort:random ${tags.join(' ')}`)}${creds('gelbooru')}`,
    parse: posts => posts.map(post => ({ url: post.file_url, alt: post.sample_url, tags: post.tags })),
    suggest: async term => {
      const data = await getJson(
        `https://gelbooru.com/index.php?page=autocomplete2&term=${encodeURIComponent(term)}&type=tag_query&limit=10${creds('gelbooru')}`
      )
      return (Array.isArray(data) ? data : []).map(item => withCount(item.value ?? item.label, item.post_count))
    }
  },
  danbooru: {
    label: 'Danbooru',
    base: 'https://danbooru.donmai.us',
    maxTags: 1,
    url: tags =>
      `https://danbooru.donmai.us/posts.json?limit=60&random=true&tags=${encodeURIComponent(`rating:e ${tags.join(' ')}`)}`,
    parse: posts =>
      posts.map(post => ({ url: post.file_url || post.large_file_url, alt: post.large_file_url, tags: post.tag_string })),
    suggest: async term => {
      const data = await getJson(
        `https://danbooru.donmai.us/tags.json?search[name_matches]=${encodeURIComponent(`${term}*`)}&search[order]=count&search[hide_empty]=true&limit=10`
      )
      return (Array.isArray(data) ? data : []).map(item => withCount(item.name, item.post_count))
    }
  },
  yandere: {
    label: 'Yande.re',
    base: 'https://yande.re',
    maxTags: 4,
    url: tags =>
      `https://yande.re/post.json?limit=100&tags=${encodeURIComponent(`rating:explicit order:random ${tags.join(' ')}`)}`,
    parse: posts => posts.map(post => ({ url: post.file_url, alt: post.sample_url, tags: post.tags })),
    suggest: async term => {
      const data = await getJson(`https://yande.re/tag.json?name=${encodeURIComponent(term)}&order=count&limit=10`)
      return (Array.isArray(data) ? data : []).map(item => withCount(item.name, item.count))
    }
  },
  konachan: {
    label: 'Konachan',
    base: 'https://konachan.com',
    maxTags: 4,
    url: tags =>
      `https://konachan.com/post.json?limit=100&tags=${encodeURIComponent(`rating:explicit order:random ${tags.join(' ')}`)}`,
    parse: posts => posts.map(post => ({ url: post.file_url, alt: post.sample_url, tags: post.tags })),
    suggest: async term => {
      const data = await getJson(`https://konachan.com/tag.json?name=${encodeURIComponent(term)}&order=count&limit=10`)
      return (Array.isArray(data) ? data : []).map(item => withCount(item.name, item.count))
    }
  }
}

export const booruSites = ['danbooru', 'yandere', 'konachan', 'gelbooru']

const isUsable = name => Boolean(sites[name]) && (sites[name].enabled?.() ?? true)

const down = new Map()
const isDown = name => (down.get(name) ?? 0) > Date.now()

const rank = (items, base) => {
  const valid = []

  for (const item of items) {
    const url = absolute(item.url, base)
    if (!url.startsWith('http')) continue

    const extension = extensionOf(url)
    if (!IMAGE_EXTENSIONS.has(extension) && !ANIMATED_EXTENSIONS.has(extension)) continue
    if (hasBlockedTag(item.tags)) continue

    const alt = absolute(item.alt, base)
    valid.push({ url, alt: alt.startsWith('http') && alt !== url && IMAGE_EXTENSIONS.has(extensionOf(alt)) ? alt : undefined })
  }

  const unique = [...new Map(valid.map(item => [item.url, item])).values()]
  const animated = shuffle(unique.filter(item => ANIMATED_EXTENSIONS.has(extensionOf(item.url))))
  const still = shuffle(unique.filter(item => !ANIMATED_EXTENSIONS.has(extensionOf(item.url))))

  return [...animated, ...still].slice(0, MAX_CANDIDATES)
}

const lookup = async (tags, names) => {
  const pool = names.filter(name => {
    if (!sites[name]) return false
    if (isUsable(name)) return true
    if (name === 'rule34') {
      warnOnce('nsfw rule34: falta config.nsfw.rule34.userId y apiKey (rule34.xxx los exige); se omite ese sitio')
    }
    return false
  })
  const active = pool.filter(name => !isDown(name))
  const order = active.length ? active : pool
  let failed = 0

  for (const name of order) {
    const site = sites[name]

    try {
      const url = site.url(tags.slice(0, site.maxTags))
      const data = site.xml ? parseXml(await getText(url)) : await getJson(url)
      const posts = site.list ? site.list(data) : data
      const items = rank(site.parse(Array.isArray(posts) ? posts : []), site.base)
      down.delete(name)
      if (items.length) return { items, site: site.label, failed, tried: order.length }
    } catch (error) {
      failed += 1
      down.set(name, Date.now() + SITE_COOLDOWN_MS)
      log.warn(`nsfw ${name}: ${error.message}`)
    }
  }

  return { items: [], site: '', failed, tried: order.length }
}

const suggestTags = async (term, names) => {
  const pool = names.filter(name => isUsable(name) && !isDown(name) && sites[name].suggest).slice(0, 4)
  const results = await Promise.allSettled(pool.map(name => sites[name].suggest(term)))
  const merged = new Map()

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      log.warn(`nsfw ${pool[index]} autocompletar: ${result.reason?.message ?? result.reason}`)
      return
    }

    for (const { tag, count } of result.value) {
      if (!tag || tag === term || isBlocked(tag) || /^[a-z_]+:/.test(tag)) continue
      merged.set(tag, Math.max(merged.get(tag) ?? 0, count))
    }
  })

  return [...merged.entries()]
    .map(([tag, count]) => ({ tag, count, starts: tag.startsWith(term) ? 1 : 0 }))
    .sort((a, b) => b.starts - a.starts || b.count - a.count)
    .slice(0, MAX_SUGGESTIONS)
    .map(item => item.tag)
}

const booru = async tags => {
  for (const tag of tags) {
    const { items } = await lookup([normalizeTag(tag)], [...shuffle(booruSites), 'rule34', 'paheal'])
    if (items.length) return items
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
    headers: { 'User-Agent': USER_AGENT, Referer: refererFor(url) },
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

const prepareUrl = async url => {
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

const prepare = async entry => {
  const { url, alt } = typeof entry === 'string' ? { url: entry } : entry

  try {
    return await prepareUrl(url)
  } catch (error) {
    if (!alt) throw error
    log.warn(`nsfw original: ${error.message}; probando la versión reducida`)
    return prepareUrl(alt)
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
    reactionNames: list.map(item => item.name),
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

const MAX_TAGS = 4

export const parseQuery = text => {
  const raw = String(text ?? '').toLowerCase().trim()
  if (!raw) return { attempts: [], words: [], term: '' }

  const words = raw.split(/[\s,]+/).filter(Boolean).slice(0, 8)

  if (raw.includes(',')) {
    const groups = raw.split(',').map(normalizeTag).filter(Boolean).slice(0, MAX_TAGS)
    return { attempts: [groups], words: [...words, ...groups], term: groups.length === 1 ? groups[0] : '' }
  }

  const split = words.slice(0, MAX_TAGS)
  const joined = [words.join('_')]
  const attempts = words.length > 1 ? [split, joined] : [split]

  return { attempts, words: [...words, joined[0]], term: joined[0] }
}

export const search = ({ name, aliases = [], description, names }) => ({
  name,
  aliases,
  description,
  run: async ctx => {
    if (!(await guard(ctx))) return

    const query = parseQuery(ctx.text)

    if (!query.attempts.length) {
      return ctx.reply(
        box('Falta una etiqueta', [
          `Ejemplo: ${ctx.prefix}${ctx.command} neko ✿`,
          `Varias etiquetas: ${ctx.prefix}${ctx.command} neko, blonde hair ✿`
        ])
      )
    }

    if (query.words.some(isBlocked)) {
      return ctx.reply(box('Búsqueda no permitida', ['Esa etiqueta está bloqueada ✗']))
    }

    await mark(ctx, '🕒')

    let found = null
    let failed = 0
    let tried = 0

    const attempt = async tags => {
      const result = await lookup(tags, names)
      failed += result.failed
      tried += result.tried
      if (result.items.length) found = { ...result, tags }
      return Boolean(found)
    }

    for (const tags of query.attempts) if (await attempt(tags)) break

    let suggestions = []

    if (!found && query.term) {
      suggestions = await suggestTags(query.term, names)
      for (const tag of suggestions.slice(0, MAX_RETRY_SUGGESTIONS)) if (await attempt([tag])) break
    }

    if (!found) {
      await mark(ctx, '✖️')

      if (tried > 0 && failed >= tried) {
        return ctx.reply(
          box('Sitios sin respuesta', ['Los sitios no respondieron en este momento ✗', 'Intenta de nuevo en unos segundos ❀'])
        )
      }

      return ctx.reply(
        box('Sin resultados', [
          `No encontré nada para "${query.attempts[0].join(' ')}" ✗`,
          ...(suggestions.length ? [`Prueba con: ${suggestions.slice(0, 5).join(', ')} ❀`] : [`Revisa el tag o usa guiones bajos: ejemplo_de_tag ❀`])
        ])
      )
    }

    const label = found.tags.join(' ')
    const requested = query.attempts[0].join(' ')
    const caption = [`Resultados para » ${label}${label === requested ? '' : ` (buscaste: ${requested})`}`, `Fuente » ${found.site}`].join('\n')

    for (const item of found.items) {
      try {
        await ctx.reply({ ...(await prepare(item)), caption })
        return mark(ctx, '✔️')
      } catch (error) {
        log.warn(`nsfw envío: ${error.message}`)
      }
    }

    await mark(ctx, '✖️')
    return ctx.reply(box('No se pudo enviar', ['Encontré resultados pero no pude descargarlos ✗', 'Intenta de nuevo ❀']))
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
