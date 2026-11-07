import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadMediaMessage } from 'baileys'
import { silent } from '../../utils/logger.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const API = 'https://us-central1-vector-ink.cloudfunctions.net/upscaleImage'
const ORIGIN = 'https://vectorink.io'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
const API_TIMEOUT = 120000
const FFMPEG_TIMEOUT = 60000

const mark = (ctx, emoji) => ctx.react(emoji).catch(() => {})

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

const webpToPng = async buffer => {
  const dir = await mkdtemp(join(tmpdir(), 'raphtalia-hd-'))

  try {
    const input = join(dir, 'in.webp')
    const output = join(dir, 'out.png')
    await writeFile(input, buffer)
    await runFfmpeg(['-y', '-i', input, '-frames:v', '1', output])
    return await readFile(output)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

const parseJson = text => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const enhance = async image => {
  const response = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: '*/*', origin: ORIGIN, referer: `${ORIGIN}/`, 'user-agent': USER_AGENT },
    body: JSON.stringify({ data: { image: image.toString('base64') } }),
    signal: AbortSignal.timeout(API_TIMEOUT)
  })

  const body = parseJson(await response.text().catch(() => ''))

  if (!response.ok) throw new Error(`la API respondió ${response.status}`)
  if (typeof body?.result !== 'string' || body.result.length < 10) throw new Error('la API no devolvió resultado')

  const inner = parseJson(body.result)
  const encoded = inner?.image?.b64_json

  if (typeof encoded !== 'string' || !encoded) throw new Error('la API devolvió una respuesta inválida')

  const output = Buffer.from(encoded, 'base64')
  const format = detectFormat(output)

  if (!format) throw new Error('la API devolvió un formato inesperado')

  return format === 'webp' ? webpToPng(output) : output
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

    if (!detectFormat(image)) {
      return ctx.reply(box('Formato no compatible', ['Usa una imagen JPG, PNG o WEBP ✗']))
    }

    await mark(ctx, '🕒')

    try {
      const result = await enhance(image)
      await ctx.reply({ image: result })
      await mark(ctx, '✔️')
    } catch (error) {
      await mark(ctx, '✖️')
      await ctx.reply(box('No se pudo completar', ['No pude mejorar la imagen ✗', `Motivo: ${error?.message ?? 'desconocido'} ✧`]))
    }
  }
}
