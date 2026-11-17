import { cleanName, define, mark, sendWithRetry, usage } from '../../utils/downloads.js'
import { fetchAudio, resolve } from '../../utils/ytdl.js'

const card = (title, url, info) =>
  [
    `➩ Descargando › *${title}*`,
    '',
    `> ❖ Canal › *${info.author?.name || info.author || 'Desconocido'}*`,
    `> ⴵ Duración › *${info.timestamp || 'Desconocido'}*`,
    `> ❀ Vistas › *${Number(info.views || 0).toLocaleString('es-HN')}*`,
    `> ✩ Publicado › *${info.ago || 'Desconocido'}*`,
    `> ❒ Enlace › *${url}*`
  ].join('\n')

export default define({
  name: 'play',
  aliases: ['mp3', 'ytmp3', 'ytaudio', 'playaudio'],
  description: 'Descarga el audio de un video de YouTube por nombre o enlace',
  run: async ctx => {
    if (!ctx.text) return usage(ctx, 'Por favor, menciona el nombre o URL del video que deseas descargar.', 'bad bunny monaco')

    await mark(ctx, '🕒')
    const { url, info } = await resolve(ctx.text)
    const job = fetchAudio(url, info?.title)
    job.catch(() => {})

    if (info) {
      const caption = card(info.title, url, info)
      const thumb = info.image || info.thumbnail
      if (thumb) await ctx.reply({ image: { url: thumb }, caption }).catch(() => ctx.reply(caption))
      else await ctx.reply(caption)
    }

    const { media, audio } = await job
    const title = info?.title || media.meta?.title || 'audio'

    await sendWithRetry(ctx, {
      audio: audio.buffer,
      fileName: `${cleanName(title, 'audio')}.${audio.ext}`,
      mimetype: audio.mimetype,
      ptt: false
    })
    return mark(ctx, '✔️')
  }
})
