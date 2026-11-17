import {
  api,
  cap,
  decodeHtml,
  define,
  fetchRaw,
  getBuffer,
  getJson,
  getText,
  mark,
  sendVideo,
  sendWithRetry,
  usage
} from '../../utils/downloads.js'

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const SESSION_TTL_MS = 30 * 60 * 1000
const MAX_HISTORY = 500
const MAX_PIN_ATTEMPTS = 5
const MAX_IMAGE_BYTES = 30 * 1024 * 1024
const PINIMG_SIZE_RE = /(https?:\/\/[a-z0-9.-]*\.?pinimg\.com\/)(\d+x\d*|originals)(\/)/i
const IMAGE_EXT_RE = /\.(?:jpe?g|png|webp|gif)(?=$|[?#])/i
const VIDEO_RE = /\.mp4(?:$|\?)/i
const IMAGE_FALLBACK_SIZES = ['originals', '1200x', '736x', '564x', '474x', '345x', '236x']

const usedByChat = new Map()

let session = null
let sessionAt = 0

const getUsed = chat => {
  if (!usedByChat.has(chat)) usedByChat.set(chat, new Set())
  return usedByChat.get(chat)
}

const markUsed = (used, url) => {
  used.add(url)
  if (used.size > MAX_HISTORY) used.delete(used.values().next().value)
}

const cleanText = value => {
  if (typeof value !== 'string') return ''
  const text = value.replace(/\s+/g, ' ').trim()
  return /^[-✿]*$/.test(text) ? '' : text.slice(0, 300)
}

const pickImageUrl = pin =>
  pin?.image ||
  pin?.imageUrl ||
  pin?.image_url ||
  pin?.images?.orig?.url ||
  pin?.images?.['736x']?.url ||
  pin?.images?.['345x']?.url ||
  pin?.images?.['236x']?.url ||
  pin?.media?.images?.orig?.url ||
  pin?.thumbnail

const pickAuthorName = pin => {
  const name =
    (typeof pin?.author === 'string' ? pin.author : null) ||
    pin?.native_creator?.full_name ||
    pin?.pinner?.full_name ||
    pin?.pinner?.username ||
    pin?.author?.name ||
    pin?.author?.full_name ||
    pin?.author?.username ||
    pin?.board?.owner?.full_name ||
    pin?.board?.owner?.username ||
    pin?.originator?.full_name ||
    pin?.creator?.full_name ||
    pin?.name ||
    pin?.username
  return typeof name === 'string' && name.trim() ? name.trim() : 'Desconocido'
}

const toPinterestSize = (url, size) =>
  PINIMG_SIZE_RE.test(url) ? url.replace(PINIMG_SIZE_RE, (_match, prefix, _size, slash) => `${prefix}${size}${slash}`) : url

const withJpgExtension = url => url.replace(IMAGE_EXT_RE, '.jpg')

const pickRandomPins = (pins, count) => {
  const pool = [...pins]
  const picked = []
  while (pool.length && picked.length < count) picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0])
  return picked
}

const collectImageCandidates = (pin, primaryUrl) => {
  const seen = new Set()
  const candidates = []
  const add = url => {
    if (url && !seen.has(url)) {
      seen.add(url)
      candidates.push(url)
    }
  }

  if (PINIMG_SIZE_RE.test(primaryUrl)) {
    add(toPinterestSize(primaryUrl, 'originals'))
    add(primaryUrl)
    for (const size of IMAGE_FALLBACK_SIZES) {
      if (size !== 'originals') add(withJpgExtension(toPinterestSize(primaryUrl, size)))
    }
  } else {
    add(primaryUrl)
  }

  add(pin?.images?.orig?.url)
  add(pin?.images?.['736x']?.url)
  add(pin?.images?.['345x']?.url)
  add(pin?.images?.['236x']?.url)
  add(pin?.media?.images?.orig?.url)
  add(pin?.thumbnail)
  return candidates
}

const sniffImage = buffer => {
  const head = buffer.subarray(0, 12)
  if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg'
  if (head.toString('latin1', 1, 4) === 'PNG') return 'image/png'
  if (head.toString('latin1', 0, 4) === 'GIF8') return 'image/gif'
  if (head.toString('latin1', 0, 4) === 'RIFF' && head.toString('latin1', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

const fetchPinterestImage = async (pin, primaryUrl) => {
  let lastError = new Error('No se pudo descargar la imagen en ninguna calidad disponible')

  for (const candidate of collectImageCandidates(pin, primaryUrl)) {
    try {
      const buffer = await getBuffer(candidate, { timeout: 30000, max: MAX_IMAGE_BYTES })
      const mime = sniffImage(buffer)
      if (!mime) {
        lastError = new Error(`Respuesta inválida (no es imagen) en ${candidate}`)
        continue
      }
      return { buffer, mime }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

const download = async url => {
  const res = await getJson(`${api('fare').url}/dl/pin?${new URLSearchParams({ url })}`)
  const data = res?.status && res.resultado
  if (!data?.url) return null
  const isVideo = VIDEO_RE.test(data.filename || '') || VIDEO_RE.test(data.url)
  return {
    type: isVideo ? 'video' : 'image',
    url: data.url,
    title: data.titulo || null,
    author: data.autor || null,
    filename: data.filename || (isVideo ? 'pin.mp4' : 'pin.jpg')
  }
}

const getSession = async (force = false) => {
  if (!force && session && Date.now() - sessionAt < SESSION_TTL_MS) return session

  const response = await fetchRaw('https://www.pinterest.com/', {
    headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
    timeout: 15000
  })
  const html = await response.text()
  const cookies = (response.headers.getSetCookie?.() ?? []).map(cookie => cookie.split(';')[0])
  const csrf = cookies.find(cookie => cookie.startsWith('csrftoken='))?.split('=')[1] ?? ''
  const version = html.match(/"appVersion"\s*:\s*"([^"]+)"/)?.[1] ?? ''

  session = { cookie: cookies.join('; '), csrf, version }
  sessionAt = Date.now()
  return session
}

const requestPinterest = (query, current) => {
  const source = `/search/pins/?q=${encodeURIComponent(query)}`
  const params = new URLSearchParams({
    source_url: source,
    data: JSON.stringify({ options: { query, scope: 'pins', page_size: 50, gated: false }, context: {} })
  })
  const headers = {
    'User-Agent': BROWSER_UA,
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-Requested-With': 'XMLHttpRequest',
    'X-Pinterest-PWS-Handler': 'www/index.js',
    Referer: `https://www.pinterest.com${source}`
  }
  if (current.version) headers['X-APP-VERSION'] = current.version
  if (current.csrf) headers['X-CSRFToken'] = current.csrf
  if (current.cookie) headers.Cookie = current.cookie

  return getJson(`https://www.pinterest.com/resource/BaseSearchResource/get/?${params}`, { headers, timeout: 15000 })
}

const searchPinterestDirect = async query => {
  let data
  try {
    data = await requestPinterest(query, await getSession())
  } catch (error) {
    if (![401, 403].includes(error?.status)) throw error
    data = await requestPinterest(query, await getSession(true))
  }

  const results = data?.resource_response?.data?.results
  if (!Array.isArray(results)) return []

  return results
    .filter(pin => pin?.type === 'pin' && (pin.images?.orig?.url || pin.images?.['736x']?.url))
    .map(pin => ({
      ...pin,
      image: pin.images?.orig?.url || pin.images?.['736x']?.url,
      title: pin.title || pin.grid_title || '',
      description: pin.description || pin.auto_alt_text || '',
      author: pin.pinner?.full_name || pin.pinner?.username || pin.native_creator?.full_name || ''
    }))
}

const searchBing = async query => {
  const url = `https://www.bing.com/images/async?${new URLSearchParams({
    q: `site:pinterest.com ${query}`,
    first: '0',
    count: '50',
    mmasync: '1'
  })}`
  const body = await getText(url, { headers: { 'Accept-Language': 'en-US,en;q=0.9' }, timeout: 20000 })
  const pins = []

  for (const match of body.matchAll(/\sm="(\{.*?\})"/g)) {
    try {
      const item = JSON.parse(decodeHtml(match[1]))
      if (typeof item.murl === 'string' && /^https?:\/\//i.test(item.murl)) {
        pins.push({ image: item.murl, thumbnail: item.turl, title: item.t || '', description: item.desc || item.t || '', author: '' })
      }
    } catch {}
  }

  return pins
}

const searchDelirius = async query => {
  const data = await getJson(`${api('delirius').url}/search/pinterestv2?${new URLSearchParams({ text: query })}`, { timeout: 15000 })
  if (!data?.status || !Array.isArray(data?.data)) return []
  return data.data.filter(pin => typeof pin?.image === 'string' && pin.image)
}

const searchFare = async query => {
  const res = await getJson(`${api('fare').url}/search/pin?${new URLSearchParams({ q: query, limit: '20' })}`)
  if (!res?.status || !Array.isArray(res.results)) return []
  return res.results
    .filter(item => item?.descarga && !VIDEO_RE.test(item.descarga) && String(item.tipo || '').toLowerCase() !== 'video')
    .map(item => ({ image: item.descarga, title: item.titulo || '', description: item.titulo || '', author: item.autor || '' }))
}

const searchPins = async query => {
  const sources = [
    ['pinterest', searchPinterestDirect],
    ['bing', searchBing],
    ['delirius', searchDelirius],
    ['fare', searchFare]
  ]
  const errors = []

  for (const [name, run] of sources) {
    try {
      const pins = await run(query)
      if (pins.length) return pins
    } catch (error) {
      errors.push(`${name}: ${error?.status || error?.message || error}`)
    }
  }

  if (errors.length === sources.length) throw new Error(`Ninguna fuente respondió (${errors.join(' | ')})`)
  return []
}

export default define({
  name: 'pinterest',
  aliases: ['pin'],
  description: 'Busca y descarga imágenes y videos de Pinterest',
  run: async ctx => {
    const { text } = ctx
    if (!text) return usage(ctx, 'Por favor, ingresa un término de búsqueda o un enlace de Pinterest.', 'anime aesthetic')

    await mark(ctx, '🕒')

    if (/^https?:\/\//i.test(text)) {
      const data = await download(text)
      if (!data) {
        await mark(ctx, '✖️')
        return ctx.reply('ꕥ No se pudo obtener el contenido.')
      }

      const caption = cap('Pinterest Download', [
        ['Título', data.title],
        ['Autor', data.author],
        ['Enlace', text]
      ])

      if (data.type === 'video') await sendVideo(ctx, { url: data.url, caption, fileName: data.filename })
      else await sendWithRetry(ctx, { image: { url: data.url }, caption })
      return mark(ctx, '✔️')
    }

    const results = await searchPins(text)
    if (!results.length) {
      await mark(ctx, '✖️')
      return ctx.reply(`ꕥ No se encontraron resultados para *${text}*.`)
    }

    const used = getUsed(ctx.chat)
    const available = results.filter(pin => {
      const url = pickImageUrl(pin)
      return url && !used.has(url)
    })

    if (!available.length) {
      await mark(ctx, '✖️')
      return ctx.reply(`ꕥ Ya te envié todas las imágenes disponibles para *${text}*. Intenta con otra búsqueda.`)
    }

    let media = null
    let chosen = null
    let lastError = null

    for (const pin of pickRandomPins(available, MAX_PIN_ATTEMPTS)) {
      const imageUrl = pickImageUrl(pin)
      if (!imageUrl) continue
      markUsed(used, imageUrl)
      try {
        media = await fetchPinterestImage(pin, imageUrl)
        chosen = pin
        break
      } catch (error) {
        lastError = error
      }
    }

    if (!media || !chosen) {
      throw lastError || new Error('Las imágenes encontradas ya no están disponibles, intenta de nuevo en unos segundos.')
    }

    const caption = cap('Pinterest Search', [
      ['Descripción', cleanText(chosen.description) || cleanText(chosen.title) || 'Sin descripción'],
      ['Autor', pickAuthorName(chosen)],
      ['Búsqueda', text]
    ])

    await sendWithRetry(ctx, { image: media.buffer, mimetype: media.mime, caption })
    return mark(ctx, '✔️')
  }
})
