import { api, cap, chain, define, fetchRaw, getJson, mark, sendAlbum, usage } from '../../utils/downloads.js'
import banned from '../../utils/dlwords.js'
import { isBlocked } from '../../utils/nsfw.js'
import { isEnabled } from '../../utils/settings.js'

const SINGLE = new Set(banned.filter(word => !/[\s.]/.test(word)).map(word => word.toLowerCase()))
const MULTI = banned.filter(word => /[\s.]/.test(word)).map(word => word.toLowerCase())
const MAX_CHECK = 15
const MAX_IMAGES = 10

const tokens = text => text.toLowerCase().split(/[^\p{L}\p{N}@_$]+/u).filter(Boolean)

const isAdultQuery = text => {
  const lower = text.toLowerCase()
  return MULTI.some(word => lower.includes(word)) || tokens(lower).some(token => SINGLE.has(token))
}

const isMinorQuery = text => tokens(text).some(isBlocked)

const accessible = async url => {
  try {
    const response = await fetchRaw(url, { method: 'HEAD', timeout: 5000 })
    if (response.status < 400) return String(response.headers.get('content-type') || '').startsWith('image/')
  } catch {}

  try {
    const response = await fetchRaw(url, { headers: { Range: 'bytes=0-1023' }, timeout: 5000 })
    await response.body?.cancel?.().catch(() => {})
    return response.status < 400 && String(response.headers.get('content-type') || '').startsWith('image/')
  } catch {
    return false
  }
}

const providers = query => {
  const params = new URLSearchParams({ query })
  return [
    async () => {
      const res = await getJson(`${api('delirius').url}/search/gimage?${params}`)
      if (!res?.status || !Array.isArray(res.data)) return null
      const list = res.data.map(item => ({
        url: item.url,
        title: item.origin?.title || null,
        domain: item.origin?.website?.domain || null,
        resolution: item.width && item.height ? `${item.width}x${item.height}` : null
      }))
      return list.length ? list : null
    },
    async () => {
      const res = await getJson(`${api('siputzx').url}/api/images?${params}`)
      const raw = Array.isArray(res?.data) ? res.data : []
      const list = raw
        .map(item => ({ url: item.url || item.image || item.imageUrl, title: item.title || null, domain: null, resolution: null }))
        .filter(item => item.url)
      return list.length ? list : null
    },
    async () => {
      const res = await getJson(`${api('vreden').url}/api/v1/search/google/image?${params}`)
      const raw = res?.result?.results ?? res?.result ?? []
      const list = (Array.isArray(raw) ? raw : [])
        .map(item => ({ url: item.url || item.image || item.original, title: item.title || null, domain: null, resolution: null }))
        .filter(item => item.url)
      return list.length ? list : null
    }
  ]
}

export default define({
  name: 'imagen',
  aliases: ['img', 'image'],
  description: 'Busca y descarga imágenes de Google',
  run: async ctx => {
    const { text } = ctx
    if (!text) return usage(ctx, 'Por favor, ingresa un término de búsqueda.', 'gatos graciosos')

    if (isMinorQuery(text)) return ctx.reply('ꕥ Ese término de búsqueda está bloqueado.')

    if (ctx.isGroup && !isEnabled(ctx.chat, 'nsfw') && isAdultQuery(text)) {
      return ctx.reply('ꕥ Este comando no permite búsquedas de contenido *+18* o *NSFW* en este grupo.')
    }

    await mark(ctx, '🕒')
    const results = await chain(providers(text))
    if (!results?.length) {
      await mark(ctx, '✖️')
      return ctx.reply(`ꕥ No se encontraron imágenes para *${text}*.`)
    }

    const checks = await Promise.allSettled(results.slice(0, MAX_CHECK).map(async item => ((await accessible(item.url)) ? item : null)))
    const valid = checks.filter(check => check.status === 'fulfilled' && check.value).map(check => check.value)

    if (!valid.length) {
      await mark(ctx, '✖️')
      return ctx.reply(`ꕥ No se encontraron imágenes accesibles para *${text}*.`)
    }

    await sendAlbum(
      ctx,
      valid.slice(0, MAX_IMAGES).map(item => ({
        type: 'image',
        data: { url: item.url },
        caption: cap('Google Image Search', [
          ['Título', item.title],
          ['Fuente', item.domain],
          ['Resolución', item.resolution],
          ['Búsqueda', text]
        ])
      }))
    )
    return mark(ctx, '✔️')
  }
})
