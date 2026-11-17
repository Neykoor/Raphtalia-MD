import { cleanName, define, formatBytes, headSize, mark, parseSize, sendVideo, usage } from '../../utils/downloads.js'
import { fetchMedia, resolve } from '../../utils/ytdl.js'

export default define({
  name: 'play2',
  aliases: ['mp4', 'ytmp4', 'ytvideo', 'playvideo'],
  description: 'Descarga un video de YouTube por nombre o enlace',
  run: async ctx => {
    if (!ctx.text) return usage(ctx, 'Por favor, menciona el nombre o URL del video que deseas descargar.', 'bad bunny monaco')

    await mark(ctx, '🕒')
    const { url, info } = await resolve(ctx.text)
    const media = await fetchMedia('video', url)

    const title = info?.title || media.meta?.title || 'video'
    const channel = info?.author?.name || media.meta?.channel || 'Desconocido'
    const duration = info?.timestamp || media.meta?.duration || 'Desconocido'
    const views = Number(info?.views || media.meta?.views || 0).toLocaleString('es-HN')
    const thumb = info?.image || info?.thumbnail || media.meta?.thumbnail || null
    const quality = media.quality || '360p'
    const bytes = parseSize(media.size) || (await headSize(media.url))
    const sizeText = bytes ? formatBytes(bytes) : media.size || 'Desconocido'

    const caption = [
      `➩ Descargando › *${title}*`,
      '',
      `> ❖ Canal › *${channel}*`,
      `> ⴵ Duración › *${duration}*`,
      `> ❀ Vistas › *${views}*`,
      `> ❒ Calidad › *${quality}*`,
      `> ❒ Tamaño › *${sizeText}*`,
      `> ❒ Enlace › *${url}*`
    ].join('\n')

    if (thumb) await ctx.reply({ image: { url: thumb }, caption }).catch(() => ctx.reply(caption))
    else await ctx.reply(caption)

    await sendVideo(ctx, {
      url: media.url,
      bytes,
      fileName: `${cleanName(title, 'video')}.mp4`,
      caption: `✦ Video descargado\n\n> ❒ Calidad › *${quality}*\n> ❒ Tamaño › *${sizeText}*`
    })
    return mark(ctx, '✔️')
  }
})
