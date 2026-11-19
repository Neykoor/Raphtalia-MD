import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import log from './logger.js'
import { displayName, getUser, targetRaw, whoIs } from './profiles.js'
import { isEnabled } from './settings.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const USER_AGENT = 'Mozilla/5.0 (compatible; Raphtalia-MD)'
const BROWSER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const DANBOORU = 'https://danbooru.donmai.us'
const REFERERS = {
  'donmai.us': 'https://danbooru.donmai.us/',
  'yande.re': 'https://yande.re/',
  'konachan.com': 'https://konachan.com/',
  'xbooru.com': 'https://xbooru.com/',
  'paheal.net': 'https://rule34.paheal.net/',
  'gelbooru.com': 'https://gelbooru.com/'
}
const TAG_CACHE_LIMIT = 300
const API_TIMEOUT = 15000
const DOWNLOAD_TIMEOUT = 45000
const FFMPEG_TIMEOUT = 60000
const MAX_BYTES = 15 * 1024 * 1024
const MAX_CANDIDATES = 6
const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp'])
const ANIMATED_EXTENSIONS = new Set(['gif', 'mp4', 'webm'])
const BLOCKED_PREFIX = /^(loli|shota|toddler|underage|infant|preteen|prepubescent|kindergarten)/
const BLOCKED_WORD = /(^|_)(loli|lolicon|shota|shotacon)(_|$)/
const BLOCKED_EXACT = new Set([
  'child',
  'children',
  'little_girl',
  'little_boy',
  'toddlercon',
  'baby',
  'minor',
  'aged_down',
  'age_regression',
  'school_age'
])
const NON_ANIME_TAGS = new Set([
  '3d',
  '3d_animation',
  '3dcg',
  'mmd',
  'mikumikudance',
  'source_filmmaker',
  'sfm',
  'gmod',
  'blender_(medium)',
  'koikatsu',
  'second_life',
  'realistic',
  'photorealistic',
  'real_life',
  'real_life_insert',
  'real_person',
  'photo_(medium)',
  'photo',
  'cosplay',
  'cosplay_photo',
  'live_action',
  'irl',
  'real',
  'western',
  'western_animation',
  'comic_(western)',
  'cartoon',
  'furry',
  'anthro',
  'pixel_art',
  'pornstar',
  'amateur',
  'webcam'
])
const EXPLICIT_RATINGS = new Set(['e', 'q'])

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

const tokensOf = tags => String(tags || '').toLowerCase().split(/\s+/).filter(Boolean)

const hasBlockedTag = tags => tokensOf(tags).some(isBlocked)

const isNonAnime = tags => tokensOf(tags).some(token => NON_ANIME_TAGS.has(token))

export const isBlockedQuery = list => {
  const tokens = list
    .flatMap(item => String(item).toLowerCase().split(/[\s,+]+/))
    .filter(Boolean)
  return tokens.some(isBlocked) || isBlocked(tokens.join('_'))
}

const refererFor = url => {
  try {
    const { hostname, origin } = new URL(url)
    const key = Object.keys(REFERERS).find(domain => hostname === domain || hostname.endsWith(`.${domain}`))
    return key ? REFERERS[key] : `${origin}/`
  } catch {
    return undefined
  }
}

const danbooruAuth = () =>
  process.env.DANBOORU_LOGIN && process.env.DANBOORU_API_KEY
    ? `&login=${encodeURIComponent(process.env.DANBOORU_LOGIN)}&api_key=${encodeURIComponent(process.env.DANBOORU_API_KEY)}`
    : ''

const extensionOf = url => {
  try {
    return new URL(url).pathname.split('.').pop().toLowerCase()
  } catch {
    return ''
  }
}

const fetchText = async (url, accept) => {
  let lastError = null

  for (const agent of [USER_AGENT, BROWSER_AGENT]) {
    const response = await fetch(url, {
      headers: { 'User-Agent': agent, Accept: accept },
      signal: AbortSignal.timeout(API_TIMEOUT)
    })
    if (response.ok) return response.text()
    lastError = new Error(`HTTP ${response.status}`)
    if (response.status !== 403) throw lastError
  }

  throw lastError
}

const getJson = async url => {
  const text = (await fetchText(url, 'application/json')).trim()
  return text ? JSON.parse(text) : []
}

const getText = url => fetchText(url, '*/*')

const parseXml = xml =>
  [...xml.matchAll(/<tag\s([^>]*?)\/?>/g)].map(([, attributes]) => {
    const read = name => attributes.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1]?.replaceAll('&amp;', '&') ?? ''
    return { file_url: read('file_url'), tags: read('tags'), rating: read('rating') }
  })

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

const moebooru = (base, label) => ({
  label,
  maxTags: 4,
  urls: tags => [
    `${base}/post.json?limit=100&tags=${encodeURIComponent(`-rating:safe order:random ${tags.join(' ')}`)}`
  ],
  parse: posts => posts.map(post => ({ url: post.file_url, tags: post.tags, rating: post.rating }))
})

const sites = {
  gelbooru: {
    label: 'Gelbooru',
    maxTags: 4,
    list: data => data?.post,
    urls: tags => [
      `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=60&tags=${encodeURIComponent(`rating:explicit sort:random ${tags.join(' ')}`)}`
    ],
    parse: posts => posts.map(post => ({ url: post.file_url, tags: post.tags, rating: post.rating }))
  },
  paheal: {
    label: 'Rule34 Paheal',
    maxTags: 3,
    xml: true,
    urls: tags => [`https://rule34.paheal.net/api/danbooru/find_posts?limit=100&tags=${encodeURIComponent(tags.join(' '))}`],
    parse: posts => posts.map(post => ({ url: post.file_url, tags: post.tags, rating: post.rating }))
  },
  danbooru: {
    label: 'Danbooru',
    maxTags: 1,
    urls: tags =>
      ['rating:e', 'rating:q'].map(
        rating =>
          `${DANBOORU}/posts.json?limit=60&random=true&tags=${encodeURIComponent(`${rating} ${tags.join(' ')}`)}${danbooruAuth()}`
      ),
    parse: posts =>
      posts.map(post => ({
        url: ['jpg', 'jpeg', 'png'].includes(String(post.file_ext).toLowerCase())
          ? post.large_file_url || post.file_url
          : post.file_url,
        tags: post.tag_string,
        rating: post.rating
      }))
  },
  yandere: moebooru('https://yande.re', 'Yande.re'),
  konachan: moebooru('https://konachan.com', 'Konachan'),
  xbooru: {
    label: 'Xbooru',
    maxTags: 4,
    urls: tags => [
      `https://xbooru.com/index.php?page=dapi&s=post&q=index&json=1&limit=100&tags=${encodeURIComponent(tags.join(' '))}`
    ],
    parse: posts =>
      posts.map(post => ({
        url: post.file_url || (post.directory && post.image ? `https://xbooru.com/images/${post.directory}/${post.image}` : ''),
        tags: post.tags,
        rating: post.rating
      }))
  }
}

export const booruSites = ['danbooru', 'yandere', 'konachan', 'gelbooru']

const rank = (items, { stillFirst = false, animeOnly = false } = {}) => {
  const valid = items.filter(item => {
    if (typeof item.url !== 'string' || !item.url.startsWith('http')) return false
    const extension = extensionOf(item.url)
    if (!IMAGE_EXTENSIONS.has(extension) && !ANIMATED_EXTENSIONS.has(extension)) return false
    if (hasBlockedTag(item.tags)) return false
    if (animeOnly && isNonAnime(item.tags)) return false
    const rating = String(item.rating || '').toLowerCase()
    return !rating || EXPLICIT_RATINGS.has(rating[0])
  })

  const unique = [...new Map(valid.map(item => [item.url, item])).values()]
  const animated = shuffle(unique.filter(item => ANIMATED_EXTENSIONS.has(extensionOf(item.url))))
  const still = shuffle(unique.filter(item => !ANIMATED_EXTENSIONS.has(extensionOf(item.url))))
  const ordered = stillFirst ? [...still, ...animated] : [...animated, ...still]

  return ordered.slice(0, MAX_CANDIDATES).map(item => item.url)
}

async function* siteResults(tags, names, { shuffled = true, ...rankOptions } = {}) {
  for (const name of shuffled ? shuffle(names) : names) {
    const site = sites[name]
    if (!site) continue

    for (const url of site.urls(tags.slice(0, site.maxTags))) {
      try {
        const data = site.xml ? parseXml(await getText(url)) : await getJson(url)
        const posts = site.list ? site.list(data) : data
        const urls = rank(site.parse(Array.isArray(posts) ? posts : []), rankOptions)

        if (urls.length) {
          yield { name, label: site.label, urls }
          break
        }
      } catch (error) {
        log.warn(`nsfw ${name}: ${error.message}`)
      }
    }
  }
}

const searchSites = async (tags, names) => {
  for await (const found of siteResults(tags, names)) return found.urls
  return []
}

const tagName = text =>
  String(text || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\w:().'!-]/g, '')

const danbooruApi = async (path, params) => {
  const query = new URLSearchParams(params).toString()
  return getJson(`${DANBOORU}/${path}.json?${query}${danbooruAuth()}`)
}

const danbooruTags = async params => {
  const data = await danbooruApi('tags', { limit: '30', ...params })
  return (Array.isArray(data) ? data : []).filter(
    tag => tag?.name && Number(tag.post_count) > 0 && !isBlocked(tag.name)
  )
}

const danbooruAlias = async name => {
  const data = await danbooruApi('tag_aliases', {
    'search[antecedent_name]': name,
    'search[status]': 'active',
    limit: '1'
  })
  return Array.isArray(data) && data[0]?.consequent_name ? data[0].consequent_name : null
}

const rankTags = list =>
  [...list].sort((a, b) => {
    const characterA = a.category === 4 ? 1 : 0
    const characterB = b.category === 4 ? 1 : 0
    return characterB - characterA || Number(b.post_count) - Number(a.post_count)
  })

const tagCache = new Map()

const resolveOne = async text => {
  const name = tagName(text)
  if (name.length < 2) return null
  if (tagCache.has(name)) return tagCache.get(name)

  let result = null

  try {
    const exact = (await danbooruTags({ 'search[name]': name, limit: '1' }))[0] || null

    if (exact && (exact.category === 4 || Number(exact.post_count) >= 200)) {
      result = { tag: exact.name, alternatives: [] }
    } else {
      const aliased = await danbooruAlias(name).catch(() => null)
      const pool = new Map()

      for (const query of [`${name}*`, `*${name}*`]) {
        const list = await danbooruTags({ 'search[name_matches]': query, 'search[order]': 'count' }).catch(() => [])
        for (const tag of list) pool.set(tag.name, tag)
        if ([...pool.values()].some(tag => tag.category === 4)) break
      }

      if (aliased) {
        const target = (await danbooruTags({ 'search[name]': aliased, limit: '1' }).catch(() => []))[0]
        if (target) pool.set(target.name, { ...target, post_count: Number(target.post_count) + 1e9 })
      }

      const ranked = rankTags([...pool.values()])
      const best = ranked[0] || exact

      if (best) {
        const alternatives = ranked
          .filter(tag => tag.name !== best.name && tag.category === 4)
          .slice(0, 3)
          .map(tag => tag.name)
        result = { tag: best.name, alternatives }
      }
    }
  } catch (error) {
    log.warn(`nsfw tags: ${error.message}`)
    result = null
  }

  if (result) {
    if (tagCache.size >= TAG_CACHE_LIMIT) tagCache.delete(tagCache.keys().next().value)
    tagCache.set(name, result)
  }

  return result
}

const rawTags = list => list.map(tag => tag.replace(/[^\w:().'!-]/g, '')).filter(Boolean)

const resolveQuery = async words => {
  const joined = words.join(' ').trim()

  if (joined.includes(',')) {
    const tags = []
    let alternatives = []

    for (const group of joined.split(',').map(item => item.trim()).filter(Boolean)) {
      const hit = await resolveOne(group)
      tags.push(hit ? hit.tag : tagName(group))
      if (hit && !alternatives.length) alternatives = hit.alternatives
    }

    return { tags: tags.filter(Boolean).slice(0, 3), alternatives }
  }

  if (words.some(word => /[_:()]/.test(word))) {
    const rest = rawTags(words)

    if (words[0] && !/[_:()]/.test(words[0])) {
      const head = await resolveOne(words[0])
      if (head) return { tags: [head.tag, ...rest.slice(1)].slice(0, 3), alternatives: head.alternatives }
    }

    return { tags: rest.slice(0, 3), alternatives: [] }
  }

  const whole = await resolveOne(joined)
  if (whole) return { tags: [whole.tag], alternatives: whole.alternatives }

  if (words.length > 1) {
    const first = await resolveOne(words[0])
    if (first) return { tags: [first.tag, ...rawTags(words.slice(1))].slice(0, 3), alternatives: first.alternatives }
  }

  return { tags: rawTags(words).slice(0, 3), alternatives: [] }
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
  const referer = refererFor(url)
  const attempts = [
    { 'User-Agent': BROWSER_AGENT, ...(referer ? { Referer: referer } : {}) },
    { 'User-Agent': BROWSER_AGENT },
    { 'User-Agent': USER_AGENT, Accept: '*/*' }
  ]
  let lastError = null

  for (const headers of attempts) {
    try {
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) throw new Error('archivo demasiado grande')

      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length > MAX_BYTES) throw new Error('archivo demasiado grande')
      return buffer
    } catch (error) {
      lastError = error
      if (error.message !== 'HTTP 403') throw error
    }
  }

  throw lastError
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

export const search = ({ name, aliases = [], description, names, smart = false }) => ({
  name,
  aliases,
  description,
  run: async ctx => {
    if (!(await guard(ctx))) return

    const words = ctx.args.map(word => word.toLowerCase()).filter(Boolean)

    if (!words.length) {
      return ctx.reply(box('Falta una etiqueta', [`Ejemplo: ${ctx.prefix}${ctx.command} neko ✿`]))
    }

    if (isBlockedQuery(words)) {
      return ctx.reply(box('Búsqueda no permitida', ['Esa etiqueta está bloqueada ✗']))
    }

    await mark(ctx, '🕒')

    const resolved = smart ? await resolveQuery(words.slice(0, 6)) : { tags: words.slice(0, 4), alternatives: [] }
    const { tags, alternatives } = resolved

    if (!tags.length) {
      await mark(ctx, '✖️')
      return ctx.reply(box('Búsqueda inválida', ['No pude interpretar la búsqueda ✗']))
    }

    if (isBlockedQuery(tags)) {
      await mark(ctx, '✖️')
      return ctx.reply(box('Búsqueda no permitida', ['Esa etiqueta está bloqueada ✗']))
    }

    const options = smart ? { shuffled: false, stillFirst: true, animeOnly: true } : {}
    let sent = false

    for await (const found of siteResults(tags, names, options)) {
      const lines = [`Resultados para » ${tags.join(' ')}`, `Fuente » ${found.label}`]
      if (alternatives.length) lines.push(`Coincidencias » ${alternatives.join(', ')}`)
      const caption = lines.join('\n')

      for (const url of found.urls) {
        try {
          await ctx.reply({ ...(await prepare(url)), caption })
          sent = true
          break
        } catch (error) {
          log.warn(`nsfw envío: ${error.message}`)
        }
      }

      if (sent) break
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
