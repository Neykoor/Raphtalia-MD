import { downloadMediaMessage } from 'baileys'
import { silent } from '../../utils/logger.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const EZGIF = 'https://ezgif.com'
const TIMEOUT = 60000

const mark = (ctx, emoji) => ctx.react(emoji).catch(() => {})

const decode = value =>
  value.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

const readFields = html => {
  const fields = new Map()

  for (const tag of html.match(/<input\b[^>]*>/gi) ?? []) {
    const name = tag.match(/\bname=["']([^"']*)["']/i)?.[1]
    if (!name) continue
    fields.set(name, decode(tag.match(/\bvalue=["']([^"']*)["']/i)?.[1] ?? ''))
  }

  return fields
}

const readOutput = (html, pattern) => {
  const start = html.search(/id=["']output["']/i)
  return (start === -1 ? html : html.slice(start)).match(pattern)?.[1] ?? null
}

const convert = async (tool, buffer, pattern) => {
  const upload = new FormData()
  upload.append('new-image-url', '')
  upload.append('new-image', new Blob([buffer], { type: 'image/webp' }), 'image.webp')

  const first = await fetch(`${EZGIF}/${tool}`, { method: 'POST', body: upload, signal: AbortSignal.timeout(TIMEOUT) })
  if (!first.ok) throw new Error(`ezgif respondió ${first.status}`)

  const fields = readFields(await first.text())
  const file = fields.get('file')
  if (!file) throw new Error('ezgif no aceptó el archivo')

  const form = new FormData()
  for (const [name, value] of fields) form.append(name, value)

  const second = await fetch(`${EZGIF}/${tool}/${file}`, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT) })
  if (!second.ok) throw new Error(`ezgif respondió ${second.status}`)

  const source = readOutput(await second.text(), pattern)
  if (!source) throw new Error('ezgif no devolvió el resultado')

  const url = new URL(decode(source), second.url)
  if (url.protocol !== 'https:' || !url.hostname.endsWith('ezgif.com')) throw new Error('origen de resultado no válido')

  const result = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) })
  if (!result.ok) throw new Error(`ezgif respondió ${result.status}`)

  return Buffer.from(await result.arrayBuffer())
}

const toVideo = buffer => convert('webp-to-mp4', buffer, /<video\b[\s\S]*?<source\b[^>]*\bsrc=["']([^"']+)["']/i)

const toPhoto = buffer => convert('webp-to-png', buffer, /<img\b[^>]*\bsrc=["']([^"']+)["']/i)

export default {
  name: 'toimg',
  aliases: ['toimage'],
  description: 'Convierte un sticker en imagen o GIF',
  run: async ctx => {
    const quoted = ctx.quoted
    const sticker = quoted?.message?.stickerMessage

    if (!sticker) {
      return ctx.reply(
        box('Falta un sticker', [
          'Responde a un sticker ✿',
          `Ejemplo: ${ctx.prefix}${ctx.command} ❀`
        ])
      )
    }

    await mark(ctx, '🕒')

    try {
      const source = { key: { remoteJid: ctx.chat, id: quoted.id, participant: quoted.sender }, message: quoted.message }
      const buffer = await downloadMediaMessage(source, 'buffer', {}, { logger: silent, reuploadRequest: ctx.sock.updateMediaMessage })

      if (!buffer?.length) {
        await mark(ctx, '✖️')
        return ctx.reply(box('No se pudo completar', ['No pude descargar el sticker ✗']))
      }

      const caption = box('Sticker convertido', ['Aquí tienes ❀'])

      if (sticker.isAnimated) {
        await ctx.reply({ video: await toVideo(buffer), caption, gifPlayback: true })
      } else {
        await ctx.reply({ image: await toPhoto(buffer), caption })
      }

      await mark(ctx, '✔️')
    } catch (error) {
      await mark(ctx, '✖️')
      await ctx.reply(box('No se pudo completar', ['No pude convertir el sticker ✗', `Motivo: ${error?.message ?? 'desconocido'} ✧`]))
    }
  }
}
