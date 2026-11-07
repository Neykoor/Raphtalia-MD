import { randomBytes } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { downloadMediaMessage } from 'baileys'
import { silent } from '../../utils/logger.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const BASE = 'https://image-upscaling.net'
const MODEL = 'general'
const SCALE = 2
const FACE_ENHANCE = true
const REQUEST_TIMEOUT = 60000
const MAX_WAIT = 150000
const POLL_INTERVAL = 2000
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

const mark = (ctx, emoji) => ctx.react(emoji).catch(() => {})

const newClientId = () =>
  Array.from(randomBytes(32), byte => ALPHABET[byte % ALPHABET.length]).join('')

const detectFormat = buffer => {
  if (buffer.length < 12) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg'
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp'
  return null
}

const pickSource = ctx => {
  if (ctx.content.imageMessage || ctx.content.stickerMessage) return ctx.raw

  const quoted = ctx.quoted
  if (!quoted?.message?.imageMessage && !quoted?.message?.stickerMessage) return null

  return {
    key: { remoteJid: ctx.chat, id: quoted.id, participant: quoted.sender },
    message: quoted.message
  }
}

const request = async (path, clientId, options = {}) => {
  const response = await fetch(new URL(path, BASE), {
    ...options,
    headers: { ...options.headers, cookie: `client_id=${clientId}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT)
  })

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).trim().slice(0, 120)
    throw new Error(`el servicio respondió ${response.status}${detail ? `: ${detail}` : ''}`)
  }

  return response
}

const enhance = async (image, format) => {
  const clientId = newClientId()

  const form = new FormData()
  form.append('scale', String(SCALE))
  form.append('model', MODEL)
  if (FACE_ENHANCE) form.append('fx', '')
  form.append('image', new Blob([image], { type: `image/${format}` }), `image.${format === 'jpeg' ? 'jpg' : format}`)

  const upload = await request('/upscaling_upload', clientId, { method: 'POST', body: form })
  const originalName = (await upload.text()).trim()

  if (!originalName) throw new Error('el servicio no aceptó la imagen')

  const deadline = Date.now() + MAX_WAIT

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL)

    const status = await request('/upscaling_get_status_v2', clientId)
    const entries = await status.json().catch(() => [])
    const entry = Array.isArray(entries) ? entries.find(item => item.original_filename === originalName) : null

    if (!entry?.completed || !entry.image_url) continue

    const url = new URL(entry.image_url, BASE)
    if (url.origin !== BASE) throw new Error('origen de resultado no válido')
    url.searchParams.set('delete_after_download', '')

    const download = await request(url.pathname + url.search, clientId)
    const output = Buffer.from(await download.arrayBuffer())

    if (!detectFormat(output)) throw new Error('el servicio devolvió un archivo inválido')

    return output
  }

  throw new Error('el servicio tardó demasiado')
}

export default {
  name: 'hd',
  aliases: ['enhance', 'remini'],
  description: 'Mejora la calidad de una imagen',
  run: async ctx => {
    const source = pickSource(ctx)

    if (!source) {
      return ctx.reply(
        box('Falta una imagen', [
          'Envía una imagen con el comando ✿',
          'O responde a una imagen ❀',
          `Ejemplo: ${ctx.prefix}${ctx.command} ✧`
        ])
      )
    }

    let image

    try {
      image = await downloadMediaMessage(source, 'buffer', {}, { logger: silent, reuploadRequest: ctx.sock.updateMediaMessage })
    } catch {
      return ctx.reply(box('No se pudo completar', ['No pude descargar la imagen ✗']))
    }

    if (!image?.length) return ctx.reply(box('No se pudo completar', ['No pude descargar la imagen ✗']))

    const format = detectFormat(image)

    if (!format) return ctx.reply(box('Formato no compatible', ['Usa una imagen JPG, PNG o WEBP ✗']))

    await mark(ctx, '🕒')

    try {
      await ctx.reply({ image: await enhance(image, format) })
      await mark(ctx, '✔️')
    } catch (error) {
      await mark(ctx, '✖️')
      await ctx.reply(box('No se pudo completar', ['No pude mejorar la imagen ✗', `Motivo: ${error?.message ?? 'desconocido'} ✧`]))
    }
  }
}
