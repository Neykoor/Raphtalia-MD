import { cap, chain, api, define, deepUrl, getJson, mark, sendVideo, sendWithRetry, usage } from '../../utils/downloads.js'

const LINK_RE = /instagram\.com\/(p|reel|reels|share|tv|stories)\//i

const providers = url => {
  const encoded = encodeURIComponent(url)
  return [
    async () => {
      const res = await getJson(`${api('ootaizumi').url}/downloader/instagram/v1?url=${encoded}`)
      const media = res?.status && res.result?.media?.[0]
      if (!media?.url) return null
      const meta = res.result.metadata ?? {}
      return {
        type: media.isVideo ? 'video' : 'image',
        url: media.url,
        author: meta.author || null,
        like: meta.like === -1 ? null : meta.like,
        views: meta.views || null,
        duration: meta.duration ? `${Math.round(meta.duration)}s` : null
      }
    },
    async () => {
      const res = await getJson(`${api('delirius').url}/download/instagram?url=${encoded}`)
      const media = res?.status && res.data?.[0]
      if (!media?.url) return null
      return { type: media.type || (media.url.includes('.mp4') ? 'video' : 'image'), url: media.url }
    },
    async () => {
      const res = await getJson(`${api('zenzxz').url}/download/instagram?url=${encoded}`)
      if (!res?.status || !res.result?.url) return null
      return {
        type: res.result.is_video ? 'video' : 'image',
        url: res.result.url,
        author: res.result.username || null,
        caption: res.result.caption || null
      }
    },
    async () => {
      const res = await getJson(`${api('siputzx').url}/api/d/igdl?url=${encoded}`)
      const found = deepUrl(res, ['url', 'download', 'dl'])
      return found ? { type: /\.mp4|video/i.test(found) ? 'video' : 'image', url: found } : null
    }
  ]
}

export default define({
  name: 'instagram',
  aliases: ['ig', 'reel'],
  description: 'Descarga un reel, video o imagen de Instagram',
  run: async ctx => {
    const link = ctx.args[0]
    if (!link) return usage(ctx, 'Por favor, ingresa un enlace de Instagram.', 'https://www.instagram.com/reel/xxxx')
    if (!LINK_RE.test(link)) return ctx.reply('ꕥ El enlace no parece *válido*. Asegúrate de que sea de *Instagram*.')

    await mark(ctx, '🕒')
    const data = await chain(providers(link))
    if (!data) {
      await mark(ctx, '✖️')
      return ctx.reply('ꕥ No se pudo obtener el contenido.')
    }

    const caption = cap('Instagram Download', [
      ['Usuario', data.author],
      ['Descripción', data.caption],
      ['Likes', data.like],
      ['Vistas', data.views],
      ['Duración', data.duration],
      ['Enlace', link]
    ])

    if (data.type === 'video') await sendVideo(ctx, { url: data.url, caption, fileName: 'ig.mp4' })
    else await sendWithRetry(ctx, { image: { url: data.url }, caption })

    return mark(ctx, '✔️')
  }
})
