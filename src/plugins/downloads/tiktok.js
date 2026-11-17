import { apiBase, cap, define, mark, postForm, sendAlbum, sendWithRetry, sleep, usage } from '../../utils/downloads.js'

const URL_RE = /(?:https?:\/\/)?(?:www\.|vm\.|vt\.|m\.)?tiktok\.com\/\S+/i
const MAX_ITEMS = 10

const count = value => Number(value || 0).toLocaleString('es-HN')

const describe = video =>
  cap('TikTok Download', [
    ['Título', video.title || 'Sin título'],
    ['Autor', `${video.author?.nickname || 'Desconocido'}${video.author?.unique_id ? ` @${video.author.unique_id}` : ''}`],
    ['Duración', video.duration ? `${video.duration}s` : null],
    ['Likes', count(video.digg_count)],
    ['Comentarios', count(video.comment_count)],
    ['Vistas', count(video.play_count)],
    ['Compartidos', count(video.share_count)],
    ['Audio', video.music_info?.title || null]
  ])

const tikwm = async (path, fields) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const json = await postForm(`${apiBase('tikwm')}${path}`, fields)
    if (json?.code === 0) return json.data
    if (!/limit/i.test(String(json?.msg))) return null
    await sleep(1500)
  }
  return null
}

export default define({
  name: 'tiktok',
  aliases: ['tt'],
  description: 'Descarga un video de TikTok por enlace o busca videos por texto',
  run: async ctx => {
    const { text } = ctx
    if (!text) return usage(ctx, 'Por favor, ingresa un término de búsqueda o enlace de TikTok.', 'https://vm.tiktok.com/xxxx')

    await mark(ctx, '🕒')
    const link = text.match(URL_RE)

    if (link) {
      const data = await tikwm('/api/', { url: link[0], hd: '1' })
      if (!data) {
        await mark(ctx, '✖️')
        return ctx.reply('ꕥ No se encontró contenido válido en TikTok.')
      }

      const caption = describe(data)

      if (Array.isArray(data.images) && data.images.length) {
        const items = data.images.slice(0, MAX_ITEMS).map((url, index) => ({
          type: 'image',
          data: { url },
          caption: index === 0 ? caption : ''
        }))
        await sendAlbum(ctx, items)
        if (data.music) {
          await ctx.reply({ audio: { url: data.music }, mimetype: 'audio/mp4', fileName: 'tiktok_audio.mp4' }).catch(() => {})
        }
      } else {
        const url = data.hdplay || data.play
        if (!url) {
          await mark(ctx, '✖️')
          return ctx.reply('ꕥ Enlace inválido o sin contenido descargable.')
        }
        await sendWithRetry(ctx, { video: { url }, caption })
      }

      return mark(ctx, '✔️')
    }

    const data = await tikwm('/api/feed/search', { keywords: text, count: '10', cursor: '0', HD: '1' })
    const videos = (data?.videos ?? []).filter(video => video.play).slice(0, MAX_ITEMS)

    if (!videos.length) {
      await mark(ctx, '✖️')
      return ctx.reply(`ꕥ No se encontraron videos para *${text}*.`)
    }

    await sendAlbum(
      ctx,
      videos.map(video => ({ type: 'video', data: { url: video.play }, caption: describe(video) }))
    )
    return mark(ctx, '✔️')
  }
})
