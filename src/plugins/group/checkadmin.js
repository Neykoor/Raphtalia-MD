import { isLidJid, jidNumber, normalizeJid } from '../../utils/jid.js'

const lookupPn = async (sock, jid) => {
  try {
    const found = await sock.signalRepository?.lidMapping?.getPNForLID?.(jid)
    if (!found) return ''
    const value = String(found)
    return normalizeJid(value.includes('@') ? value : `${value}@s.whatsapp.net`)
  } catch {
    return ''
  }
}

const findParticipant = (group, ids) =>
  group.participants.find(item =>
    [item.id, item.lid, item.phoneNumber].some(value => value && ids.has(normalizeJid(value)))
  )

const roleOf = participant => {
  if (!participant) return '✗ No encontrado en el grupo'
  if (participant.admin === 'superadmin' || participant.isSuperAdmin) return '♛ Superadmin'
  if (participant.admin || participant.isAdmin) return '◆ Admin'
  return '◇ Miembro'
}

const isAdminRole = role => role.includes('Admin') || role.includes('Superadmin')

const yesNo = value => (value ? '✓ Sí' : '✗ No')

export default {
  name: 'checkadmin',
  aliases: ['soyadmin', 'isadmin'],
  description: 'Detecta si eres admin y si se resuelve tu número',
  run: async ctx => {
    const { sock } = ctx
    const raw = ctx.senderRaw
    const lid = isLidJid(raw)
    const alt = normalizeJid(ctx.key.participantAlt || ctx.key.remoteJidAlt)
    const mapped = lid ? await lookupPn(sock, raw) : ''
    const resolved = lid ? Boolean(alt || mapped) : true
    const number = lid ? jidNumber(alt || mapped) : jidNumber(ctx.sender)
    const source = !lid ? 'El JID ya es un número' : alt ? 'Alt del mensaje' : mapped ? 'Mapeo LID a número' : 'Ninguno'

    const lines = [
      '✦ *DIAGNÓSTICO DE ADMINISTRADOR* ✦',
      '',
      '❖ *Tu identidad*',
      `> ◈ JID original: ${raw || 'desconocido'}`,
      `> ◈ Tipo: ${lid ? 'LID' : 'Número'}`,
      `> ◈ Número resuelto: ${resolved && number ? `✓ ${number}` : '✗ No se pudo resolver'}`,
      `> ◈ Fuente: ${source}`,
      `> ◈ Owner: ${yesNo(ctx.isOwner)}`
    ]

    if (!ctx.isGroup) {
      lines.push('', '➤ Estás en un chat privado, el estado de administrador solo aplica en grupos.')
      return ctx.reply(lines.join('\n'))
    }

    const group = await ctx.getGroup()

    if (!group) {
      lines.push('', '✗ No se pudo obtener la información del grupo.')
      return ctx.reply(lines.join('\n'))
    }

    const botIds = new Set([normalizeJid(sock.user?.id), normalizeJid(sock.user?.lid)].filter(Boolean))
    const me = findParticipant(group, new Set(ctx.senderIds))
    const bot = findParticipant(group, botIds)
    const myRole = roleOf(me)
    const botRole = roleOf(bot)

    lines.push(
      `> ◈ Rol en el grupo: ${myRole}`,
      `> ◈ Eres admin: ${yesNo(isAdminRole(myRole))}`,
      '',
      '❖ *Bot*',
      `> ◈ JID: ${normalizeJid(sock.user?.id) || 'desconocido'}`,
      `> ◈ LID: ${normalizeJid(sock.user?.lid) || 'desconocido'}`,
      `> ◈ Rol en el grupo: ${botRole}`,
      `> ◈ Es admin: ${yesNo(isAdminRole(botRole))}`,
      '',
      '❖ *Grupo*',
      `> ◈ Modo de direccionamiento: ${group.addressingMode || 'desconocido'}`,
      `> ◈ Participantes: ${group.participants.length}`
    )

    await ctx.reply(lines.join('\n'))
  }
}
