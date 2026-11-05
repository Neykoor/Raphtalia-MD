import { getContentType } from 'baileys'
import { isLidJid, jidNumber } from './jid.js'
import { colors, stamp } from './logger.js'

const labels = {
  conversation: 'texto',
  extendedTextMessage: 'texto',
  imageMessage: 'imagen',
  videoMessage: 'video',
  audioMessage: 'audio',
  stickerMessage: 'sticker',
  documentMessage: 'documento',
  contactMessage: 'contacto',
  contactsArrayMessage: 'contactos',
  locationMessage: 'ubicación',
  liveLocationMessage: 'ubicación en vivo',
  reactionMessage: 'reacción',
  pollCreationMessage: 'encuesta',
  buttonsResponseMessage: 'botón',
  listResponseMessage: 'lista',
  templateButtonReplyMessage: 'botón'
}

const maxLength = 200

const clean = text => {
  const flat = text.replace(/\s*\n\s*/g, ' ↵ ').trim()
  return flat.length > maxLength ? `${flat.slice(0, maxLength)}…` : flat
}

export const printMessage = async (ctx, isCommand) => {
  try {
    const { gray, cyan, yellow, green, reset } = colors

    const group = ctx.isGroup ? await ctx.getGroup() : null
    const place = ctx.isGroup ? `Grupo: ${group?.subject || jidNumber(ctx.chat)}` : 'Privado'

    const type = getContentType(ctx.content)
    const kind = labels[type] ?? (type ? type.replace(/Message$/, '') : 'desconocido')

    const number = jidNumber(ctx.sender) || jidNumber(ctx.senderRaw)
    const who = isLidJid(ctx.sender) ? `${number} (lid)` : number
    const name = ctx.pushName || 'Sin nombre'
    const self = ctx.fromMe ? ' (yo)' : ''

    const text = ctx.body ? clean(ctx.body) : '(sin texto)'
    const body = isCommand ? `${green}${text}${reset}` : text

    console.log(
      [
        `${gray}╭${reset} ${gray}${stamp()}${reset} ${cyan}${place}${reset} ${gray}·${reset} ${kind}`,
        `${gray}│${reset} ${yellow}${name}${self}${reset} ${gray}${who}${reset}`,
        `${gray}╰${reset} ${body}`
      ].join('\n')
    )
  } catch {
    return
  }
}
