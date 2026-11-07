import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { downloadMediaMessage } from 'baileys'
import config from '../../../config.js'
import log, { silent } from '../../utils/logger.js'
import { getStickerInfo } from '../../utils/stickerinfo.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const FFMPEG_TIMEOUT = 90000
const MAX_INPUT = 25 * 1024 * 1024
const MAX_SECONDS = 10
const MAX_STATIC = 100 * 1024
const MAX_ANIMATED = 500 * 1024
const MAX_NAME = 64
const STATIC_ATTEMPTS = [{ quality: 80 }, { quality: 60 }, { quality: 40 }]
const ANIMATED_ATTEMPTS = [
  { quality: 50, fps: 15 },
  { quality: 40, fps: 12 },
  { quality: 30, fps: 10 },
  { quality: 20, fps: 8 }
]
const FRAME = 'scale=512:512:force_original_aspect_ratio=increase,crop=512:512,format=rgba'

const DOWNLOAD_TIMEOUT = 60000

const mark = (ctx, emoji) => ctx.react(emoji).catch(() => {})

const withTimeout = (promise, ms, message) => {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const pickSource = ctx => {
  const own = ctx.content
  if (own.imageMessage || own.videoMessage) return { content: own, source: ctx.raw }

  const quoted = ctx.quoted
  if (!quoted?.message?.imageMessage && !quoted?.message?.videoMessage && !quoted?.message?.stickerMessage) return null

  return {
    content: quoted.message,
    source: { key: { remoteJid: ctx.chat, id: quoted.id, participant: quoted.sender }, message: quoted.message }
  }
}

const extensionOf = mimetype => {
  if (/png/i.test(mimetype)) return 'png'
  if (/webp/i.test(mimetype)) return 'webp'
  return 'jpg'
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

const buildExif = (pack, author) => {
  const json = Buffer.from(
    JSON.stringify({
      'sticker-pack-id': randomBytes(16).toString('hex'),
      'sticker-pack-name': pack,
      'sticker-pack-publisher': author,
      emojis: ['']
    })
  )

  const head = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
  const exif = Buffer.concat([head, json])
  exif.writeUInt32LE(json.length, 14)
  return exif
}

const stripExif = webp => {
  const parts = []
  let offset = 12

  while (offset + 8 <= webp.length) {
    const id = webp.toString('latin1', offset, offset + 4)
    const size = webp.readUInt32LE(offset + 4)
    const end = Math.min(offset + 8 + size + (size % 2), webp.length)
    if (id !== 'EXIF') parts.push(webp.subarray(offset, end))
    offset = end
  }

  return Buffer.concat(parts)
}

const addExif = (webp, exif) => {
  if (webp.toString('latin1', 0, 4) !== 'RIFF' || webp.toString('latin1', 8, 12) !== 'WEBP') {
    throw new Error('el archivo no es un WEBP válido')
  }

  let body = stripExif(webp)
  const first = body.toString('latin1', 0, 4)

  if (first === 'VP8X') {
    body[8] |= 0x08
  } else {
    const header = Buffer.alloc(18)
    header.write('VP8X', 0, 'latin1')
    header.writeUInt32LE(10, 4)
    header[8] = 0x08 | (first === 'VP8L' ? 0x10 : 0)
    header.writeUIntLE(511, 12, 3)
    header.writeUIntLE(511, 15, 3)
    body = Buffer.concat([header, body])
  }

  const chunk = Buffer.alloc(8)
  chunk.write('EXIF', 0, 'latin1')
  chunk.writeUInt32LE(exif.length, 4)

  const out = Buffer.concat([Buffer.from('RIFF', 'latin1'), Buffer.alloc(4), Buffer.from('WEBP', 'latin1'), body, chunk, exif, Buffer.alloc(exif.length % 2)])
  out.writeUInt32LE(out.length - 8, 4)
  return out
}

const encode = async (input, animated) => {
  const dir = await mkdtemp(join(tmpdir(), 'raphtalia-sticker-'))

  try {
    const inputPath = join(dir, `in.${input.extension}`)
    const outputPath = join(dir, 'out.webp')
    await writeFile(inputPath, input.buffer)

    const attempts = animated ? ANIMATED_ATTEMPTS : STATIC_ATTEMPTS
    const limit = animated ? MAX_ANIMATED : MAX_STATIC

    for (const attempt of attempts) {
      const args = animated
        ? ['-y', '-t', String(MAX_SECONDS), '-i', inputPath, '-vf', `fps=${attempt.fps},${FRAME}`, '-an', '-c:v', 'libwebp', '-loop', '0', '-quality', String(attempt.quality), '-compression_level', '6', outputPath]
        : ['-y', '-i', inputPath, '-vf', FRAME, '-frames:v', '1', '-c:v', 'libwebp', '-quality', String(attempt.quality), '-compression_level', '6', outputPath]

      await runFfmpeg(args)
      const output = await readFile(outputPath)
      if (output.length <= limit) return output
    }

    throw new Error('el sticker pesa demasiado, prueba con un archivo más corto')
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

export default {
  name: 'sticker',
  aliases: ['s', 'stiker'],
  description: 'Crea un sticker desde una imagen, video o GIF',
  run: async ctx => {
    const picked = pickSource(ctx)

    if (!picked) {
      return ctx.reply(
        box('Falta una imagen o video', [
          'Envía una imagen, video o GIF con el comando ✿',
          'O responde a uno, o a un sticker para cambiarle el paquete y autor ❀',
          `Ejemplo: ${ctx.prefix}${ctx.command} Paquete | Autor ✧`,
          `Guarda tus datos con ${ctx.prefix}setsticker Paquete | Autor ♡`
        ])
      )
    }

    const { content, source } = picked
    const video = content.videoMessage
    const image = content.imageMessage
    const existing = content.stickerMessage

    if (Number(video?.fileLength ?? image?.fileLength ?? existing?.fileLength) > MAX_INPUT) {
      return ctx.reply(box('Archivo muy pesado', [`El máximo es ${MAX_INPUT / 1024 / 1024} MB ✗`]))
    }

    const [packText, authorText] = ctx.text.split('|')
    const saved = getStickerInfo(ctx.senderNumber)
    const pack = (packText || '').trim().slice(0, MAX_NAME) || saved?.pack || config.botName
    const author = (authorText || '').trim().slice(0, MAX_NAME) || saved?.author || ctx.pushName || config.botName

    log.info(`Sticker: procesando ${existing ? 'sticker' : video ? 'video' : 'imagen'}`)

    await mark(ctx, '🕒')

    try {
      const buffer = await withTimeout(
        downloadMediaMessage(source, 'buffer', {}, { logger: silent, reuploadRequest: ctx.sock.updateMediaMessage }),
        DOWNLOAD_TIMEOUT,
        'la descarga tardó demasiado'
      )

      if (!buffer?.length) {
        await mark(ctx, '✖️')
        return ctx.reply(box('No se pudo completar', ['No pude descargar el archivo ✗']))
      }

      const webp = existing ? buffer : await encode({ buffer, extension: video ? 'mp4' : extensionOf(image.mimetype) }, Boolean(video))

      await ctx.reply({ sticker: addExif(webp, buildExif(pack, author)) })
      await mark(ctx, '✔️')
      log.success('Sticker: enviado')
    } catch (error) {
      log.error('Sticker:', error?.message ?? error)
      await mark(ctx, '✖️')
      await ctx.reply(box('No se pudo completar', ['No pude crear el sticker ✗', `Motivo: ${error?.message ?? 'desconocido'} ✧`]))
    }
  }
}
