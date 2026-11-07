import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { downloadMediaMessage } from 'baileys'
import { jidNumber } from './jid.js'
import { silent } from './logger.js'

const file = fileURLToPath(new URL('../../data/greetings.json', import.meta.url))
const mediaDir = fileURLToPath(new URL('../../data/greetings/', import.meta.url))

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const labels = {
  welcome: { name: 'Bienvenida', article: 'la bienvenida' },
  goodbye: { name: 'Despedida', article: 'la despedida' }
}

const variables = '{user} {group} {members} {desc} {author}'
const maxText = 1500
const maxMedia = 15 * 1024 * 1024

const load = () => {
  try {
    if (!existsSync(file)) return {}
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const data = load()

const save = () => {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify(data, null, 2))
  renameSync(temp, file)
}

const removeFile = name => {
  if (!name) return
  try {
    unlinkSync(join(mediaDir, name))
  } catch {
    return
  }
}

const update = (chat, kind, change) => {
  const current = { ...data[chat]?.[kind] }
  change(current)

  const entry = { ...data[chat] }

  if (Object.keys(current).length) entry[kind] = current
  else delete entry[kind]

  if (Object.keys(entry).length) data[chat] = entry
  else delete data[chat]

  save()
}

export const getGreetingText = (chat, kind) => data[chat]?.[kind]?.text || ''

export const getGreetingMedia = (chat, kind) => {
  const media = data[chat]?.[kind]?.media
  if (!media?.file) return null

  const path = join(mediaDir, media.file)
  return existsSync(path) ? { path, type: media.type, gif: Boolean(media.gif) } : null
}

const setText = (chat, kind, text) => update(chat, kind, current => {
  current.text = text
})

const setMedia = (chat, kind, buffer, info) => {
  mkdirSync(mediaDir, { recursive: true })

  const name = `${jidNumber(chat)}-${kind}-${Date.now()}.${info.extension}`
  const previous = data[chat]?.[kind]?.media?.file

  writeFileSync(join(mediaDir, name), buffer)

  update(chat, kind, current => {
    current.media = { file: name, type: info.type, gif: info.gif }
  })

  if (previous && previous !== name) removeFile(previous)
}

const reset = (chat, kind, part) => {
  const current = data[chat]?.[kind]
  if (!current) return false

  const dropText = part !== 'media' && current.text !== undefined
  const dropMedia = part !== 'text' && Boolean(current.media)

  if (!dropText && !dropMedia) return false

  const previous = dropMedia ? current.media.file : null

  update(chat, kind, entry => {
    if (dropText) delete entry.text
    if (dropMedia) delete entry.media
  })

  removeFile(previous)
  return true
}

const extensionOf = mimetype => {
  if (/png/i.test(mimetype)) return 'png'
  if (/webp/i.test(mimetype)) return 'webp'
  return 'jpg'
}

const pickMedia = ctx => {
  const own = ctx.content
  if (own.imageMessage || own.videoMessage) return { content: own, source: ctx.raw }

  const quoted = ctx.quoted
  if (!quoted?.message?.imageMessage && !quoted?.message?.videoMessage) return null

  return {
    content: quoted.message,
    source: { key: { remoteJid: ctx.chat, id: quoted.id, participant: quoted.sender }, message: quoted.message }
  }
}

export const runSetText = async (ctx, kind) => {
  const label = labels[kind]
  const text = ctx.text || ctx.quoted?.text?.trim() || ''

  if (!text) {
    return ctx.reply(
      box('Falta el texto', [
        `Escribe el texto de ${label.article} ✿`,
        `Variables: ${variables} ❀`,
        `Ejemplo: ${ctx.prefix}${ctx.command} Hola {user}, bienvenido a {group} ♡`
      ])
    )
  }

  if (text.length > maxText) {
    return ctx.reply(box('Texto muy largo', [`El máximo es ${maxText} caracteres ✗`, `Enviaste ${text.length} ✧`]))
  }

  try {
    setText(ctx.chat, kind, text)
  } catch (error) {
    return ctx.reply(box('No se pudo completar', ['No pude guardar el texto ✗', `Motivo: ${error?.message ?? 'desconocido'} ✧`]))
  }

  await ctx.reply(box(`${label.name} actualizada`, ['El texto se guardó correctamente ❀', 'Hecho ♡']))
}

export const runSetMedia = async (ctx, kind) => {
  const label = labels[kind]
  const picked = pickMedia(ctx)

  if (!picked) {
    return ctx.reply(
      box('Falta una imagen o GIF', [
        'Envía una imagen o GIF con el comando ✿',
        'O responde a una imagen o GIF ❀',
        `Ejemplo: ${ctx.prefix}${ctx.command} ✧`
      ])
    )
  }

  const { content, source } = picked
  const video = content.videoMessage
  const image = content.imageMessage

  if (Number(video?.fileLength ?? image?.fileLength) > maxMedia) {
    return ctx.reply(box('Archivo muy pesado', [`El máximo es ${maxMedia / 1024 / 1024} MB ✗`]))
  }

  let buffer

  try {
    buffer = await downloadMediaMessage(source, 'buffer', {}, { logger: silent, reuploadRequest: ctx.sock.updateMediaMessage })
  } catch {
    return ctx.reply(box('No se pudo completar', ['No pude descargar el archivo ✗']))
  }

  if (!buffer?.length) return ctx.reply(box('No se pudo completar', ['No pude descargar el archivo ✗']))

  if (buffer.length > maxMedia) {
    return ctx.reply(box('Archivo muy pesado', [`El máximo es ${maxMedia / 1024 / 1024} MB ✗`]))
  }

  const info = video
    ? { type: 'video', gif: Boolean(video.gifPlayback), extension: 'mp4' }
    : { type: 'image', gif: false, extension: extensionOf(image.mimetype) }

  try {
    setMedia(ctx.chat, kind, buffer, info)
  } catch (error) {
    return ctx.reply(box('No se pudo completar', ['No pude guardar el archivo ✗', `Motivo: ${error?.message ?? 'desconocido'} ✧`]))
  }

  await ctx.reply(box(`${label.name} actualizada`, [`${info.gif ? 'El GIF' : info.type === 'video' ? 'El video' : 'La imagen'} se guardó correctamente ❀`, 'Hecho ♡']))
}

const parts = {
  text: 'text',
  texto: 'text',
  desc: 'text',
  media: 'media',
  imagen: 'media',
  img: 'media',
  gif: 'media',
  todo: 'all',
  all: 'all'
}

export const runReset = async (ctx, kind) => {
  const label = labels[kind]
  const option = (ctx.args[0] || '').toLowerCase()
  const part = option ? parts[option] : 'all'

  if (!part) {
    return ctx.reply(
      box('Opción inválida', [
        `No existe "${option}" ✗`,
        'Opciones: texto, imagen, todo ✿',
        `Ejemplo: ${ctx.prefix}${ctx.command} imagen ❀`
      ])
    )
  }

  let changed

  try {
    changed = reset(ctx.chat, kind, part)
  } catch (error) {
    return ctx.reply(box('No se pudo completar', ['No pude restablecer la configuración ✗', `Motivo: ${error?.message ?? 'desconocido'} ✧`]))
  }

  if (!changed) {
    return ctx.reply(box('Sin cambios', [`${label.name} ya usa la configuración por defecto ❀`]))
  }

  await ctx.reply(box(`${label.name} restablecida`, ['Volvió a la configuración por defecto ❀', 'Hecho ♡']))
}
