import { api, cap, chain, define, deepUrl, getJson, mark, sendVideo, sendWithRetry, usage } from '../../utils/downloads.js'

const LINK_RE = /(?:twitter|x)\.com\/\w+\/status\/\d+/i

const providers = url => {
  const encoded = encodeURIComponent(url)
  return [
    async () => {
      const res = await getJson(`${api('delirius').url}/download/twitterdl?url=${encoded}`)
      if (!res?.found || !res.media?.length) return null
      return {
        type: res.type || 'video',
        url: res.media[0].url,
        title: res.info?.text || null,
        author: res.info?.user_name || res.info?.user_screen_name || null,
        date: res.info?.date || null,
        likes: res.info?.likes || null,
        retweets: res.info?.retweets || null
      }
    },
    async () => {
      const res = await getJson(`${api('zenzxz').url}/download/twitter?url=${encoded}`)
      if (!res?.status || !res.result?.length) return null
      const list = res.result
      const media =
        list.find(item => /1080|HD/i.test(item.quality || '')) || list.find(item => /720/.test(item.quality || '')) || list[0]
      return media?.url ? { type: 'video', url: media.url, resolution: media.quality || null } : null
    },
    async () => {
      const res = await getJson(`${api('siputzx').url}/api/d/twitter?url=${encoded}`)
      const found = deepUrl(res, ['hd', 'sd', 'url', 'download', 'dl'])
      return found ? { type: /\.(jpg|jpeg|png)/i.test(found) ? 'image' : 'video', url: found } : null
    }
  ]
}

export default define({
  name: 'twitter',
  aliases: ['x', 'tw'],
  description: 'Descarga un video o imagen de Twitter/X',
  run: async ctx => {
    const link = ctx.args[0]
    if (!link) return usage(ctx, 'Por favor, ingresa un enlace de Twitter/X.', 'https://x.com/usuario/status/123')
    if (!LINK_RE.test(link)) return ctx.reply('ꕥ El enlace no parece válido. Asegúrate de que sea de Twitter/X.')

    await mark(ctx, '🕒')
    const data = await chain(providers(link))
    if (!data?.url) {
      await mark(ctx, '✖️')
      return ctx.reply('ꕥ No se pudo obtener el contenido.')
    }

    const caption = cap('Twitter Download', [
      ['Título', data.title],
      ['Autor', data.author],
      ['Fecha', data.date],
      ['Resolución', data.resolution],
      ['Likes', data.likes],
      ['Retweets', data.retweets],
      ['Enlace', link]
    ])

    if (data.type === 'image') await sendWithRetry(ctx, { image: { url: data.url }, caption })
    else await sendVideo(ctx, { url: data.url, caption, fileName: 'twitter.mp4' })

    return mark(ctx, '✔️')
  }
})
