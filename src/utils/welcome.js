import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../../config.js'
import { main } from './bots.js'
import { isBotOff } from './botstate.js'
import { makeCache } from './cache.js'
import { getGreetingMedia, getGreetingText } from './greetings.js'
import { getGroupMetadata, groupCache } from './groups.js'
import { jidNumber, normalizeJid } from './jid.js'
import log from './logger.js'
import { getPrimary, primaryAlive } from './primary.js'
import { isEnabled } from './settings.js'

const mediaDir = fileURLToPath(new URL('../../media/', import.meta.url))
const imageExtensions = ['jpg', 'jpeg', 'png', 'webp']
const maxPerEvent = 5
const pictureTimeoutMs = 8000

const recent = makeCache(1000, 20000)

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const idsOf = participant => [participant.id, participant.lid, participant.phoneNumber].filter(Boolean).map(normalizeJid)

const render = (template, values) =>
  template.replace(/\{(user|group|members|desc|author)\}/gi, (_, key) => values[key.toLowerCase()])

const findMedia = async names => {
  try {
    const files = await readdir(mediaDir)

    for (const wanted of names) {
      const found = files.find(file => {
        const [name, extension] = file.toLowerCase().split(/\.(?=[^.]+$)/)
        return name === wanted && imageExtensions.includes(extension)
      })
      if (found) return join(mediaDir, found)
    }
  } catch {
    return null
  }

  return null
}

const pictureOf = async (sock, participant) => {
  for (const id of [...new Set(idsOf(participant))].slice(0, 2)) {
    try {
      const url = await sock.profilePictureUrl(id, 'image', pictureTimeoutMs)
      if (url) return url
    } catch {
      continue
    }
  }

  return null
}

const send = async (sock, chat, text, mentions, custom, picture, fallback) => {
  if (custom) {
    try {
      const payload =
        custom.type === 'video'
          ? { video: { url: custom.path }, gifPlayback: custom.gif, caption: text, mentions }
          : { image: { url: custom.path }, caption: text, mentions }
      await sock.sendMessage(chat, payload)
      return
    } catch (error) {
      log.warn('No se pudo enviar el archivo personalizado:', error?.message ?? error)
    }
  }

  const sources = [picture, fallback].filter(Boolean)

  for (const url of sources) {
    try {
      await sock.sendMessage(chat, { image: { url }, caption: text, mentions })
      return
    } catch (error) {
      log.warn('No se pudo enviar la imagen de bienvenida:', error?.message ?? error)
    }
  }

  await sock.sendMessage(chat, { text, mentions })
}

const mainIsHere = group => {
  const mainIds = new Set([normalizeJid(main.sock?.user?.id), normalizeJid(main.sock?.user?.lid)].filter(Boolean))
  if (!mainIds.size) return false
  return group.participants.some(item => idsOf(item).some(id => mainIds.has(id)))
}

const handle = async (sock, update) => {
  const { id: chat, participants, action, author } = update

  if (action !== 'add' && action !== 'remove') return
  if (!Array.isArray(participants) || !participants.length) return
  if (!isEnabled(chat, 'welcome')) return

  const botNumber = jidNumber(sock.user?.id)

  if (isBotOff(botNumber, chat)) return

  const primary = getPrimary(chat)
  const primaryActive = Boolean(primary) && primaryAlive(primary)

  if (primaryActive && botNumber !== primary) return

  groupCache.del(chat)
  const group = await getGroupMetadata(sock, chat)

  if (!group) return
  if (sock.isJadibot && !primaryActive && config.jadibotYieldToMain && mainIsHere(group)) return

  const botIds = new Set([normalizeJid(sock.user?.id), normalizeJid(sock.user?.lid)].filter(Boolean))
  const members = group.participants.length
  const subject = group.subject || 'este grupo'
  const authorId = normalizeJid(author)
  const kind = action === 'add' ? 'welcome' : 'goodbye'
  const template = getGreetingText(chat, kind)
  const custom = getGreetingMedia(chat, kind)

  let sent = 0

  for (const item of participants) {
    if (sent >= maxPerEvent) break

    const participant = typeof item === 'string' ? { id: item } : item
    if (!participant?.id) continue

    const ids = idsOf(participant)
    if (ids.some(id => botIds.has(id))) continue

    const key = `${botNumber}|${chat}|${action}|${jidNumber(participant.id)}`
    if (recent.get(key)) continue
    recent.set(key, true)

    sent += 1

    const tag = `@${jidNumber(participant.id)}`
    const mentions = [participant.id]
    const actor = authorId && !ids.includes(authorId) ? authorId : ''
    const picture = custom ? null : await pictureOf(sock, participant)
    const fallback = custom ? null : await findMedia(action === 'add' ? ['welcome', 'default'] : ['goodbye', 'default'])

    let text

    if (template) {
      if (actor && /\{author\}/i.test(template)) mentions.push(actor)

      text = render(template, {
        user: tag,
        group: subject,
        members: String(members),
        desc: group.desc || '',
        author: actor ? `@${jidNumber(actor)}` : ''
      })
    } else if (action === 'add') {
      text = box('Bienvenido', [`Usuario: ${tag} ❀`, `Grupo: ${subject} ✿`, `Miembros: ${members} ♡`])
    } else if (actor) {
      mentions.push(actor)
      text = box('Hasta nunca', [`Usuario: ${tag} ❀`, `Eliminado por: @${jidNumber(actor)} ✧`, `Miembros: ${members} ♡`])
    } else {
      text = box('Hasta pronto', [`Usuario: ${tag} ❀`, `Salió de ${subject} ✿`, `Miembros: ${members} ♡`])
    }

    await send(sock, chat, text, mentions, custom, picture, fallback)
  }
}

export const bindWelcome = sock => {
  sock.ev.on('group-participants.update', update => {
    handle(sock, update).catch(error => {
      log.error('Error en bienvenidas y despedidas:', error?.message ?? error)
    })
  })
      }
