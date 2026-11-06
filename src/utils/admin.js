import { groupCache } from './groups.js'
import { jidNumber, normalizeJid } from './jid.js'

const matches = (participant, ids) =>
  [participant.id, participant.lid, participant.phoneNumber].some(value => value && ids.has(normalizeJid(value)))

const hasAdmin = participant => Boolean(participant.admin || participant.isAdmin || participant.isSuperAdmin)

const isSuperAdmin = participant => participant.admin === 'superadmin' || Boolean(participant.isSuperAdmin)

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const pickTarget = async (ctx, selfMessage) => {
  const target = ctx.mentions[0] || ctx.quoted?.sender

  if (!target) {
    await ctx.reply(
      box('Falta un usuario', [
        'Menciona a alguien con @ ✿',
        'O responde a su mensaje ❀',
        `Ejemplo: ${ctx.prefix}${ctx.command} @usuario ✧`
      ])
    )
    return null
  }

  const group = await ctx.getGroup()

  if (!group) {
    await ctx.reply(box('Sin información', ['No pude ver el grupo ✗']))
    return null
  }

  const participant = group.participants.find(item => matches(item, new Set([normalizeJid(target)])))

  if (!participant) {
    await ctx.reply(box('Usuario no encontrado', ['No está en el grupo ✗']))
    return null
  }

  const botIds = new Set([normalizeJid(ctx.sock.user?.id), normalizeJid(ctx.sock.user?.lid)].filter(Boolean))

  if (matches(participant, botIds)) {
    await ctx.reply(box('Acción no permitida', [selfMessage]))
    return null
  }

  return participant
}

const mentionReply = (ctx, participant) => {
  const tag = `@${jidNumber(participant.id)}`
  const reply = (title, lines) => ctx.reply({ text: box(title, lines), mentions: [participant.id] })
  return { tag, reply }
}

const update = async (ctx, participant, action) => {
  const [result] = await ctx.sock.groupParticipantsUpdate(ctx.chat, [participant.id], action)
  groupCache.del(ctx.chat)
  return result
}

export const setAdmin = async (ctx, action) => {
  const participant = await pickTarget(ctx, 'No puedo cambiar mi rol ✧')
  if (!participant) return

  const { tag, reply } = mentionReply(ctx, participant)
  const admin = hasAdmin(participant)

  if (action === 'promote' && admin) return reply('Sin cambios', [`Usuario: ${tag}`, 'Ya es administrador ❀'])
  if (action === 'demote' && !admin) return reply('Sin cambios', [`Usuario: ${tag}`, 'No es administrador ✿'])
  if (action === 'demote' && isSuperAdmin(participant)) {
    return reply('Acción no permitida', [`Usuario: ${tag}`, 'Creó el grupo ♕', 'No se le puede quitar el rol ✗'])
  }

  const result = await update(ctx, participant, action)

  if (result?.status && String(result.status) !== '200') {
    return reply('No se pudo completar', [`Usuario: ${tag}`, `Código: ${result.status} ✗`])
  }

  if (action === 'promote') return reply('Administrador agregado', [`Usuario: ${tag}`, 'Rol: Admin ❀', 'Listo ♡'])

  await reply('Administrador removido', [`Usuario: ${tag}`, 'Rol: Miembro ✿', 'Hecho ♡'])
}

export const kickMember = async ctx => {
  const participant = await pickTarget(ctx, 'No puedo expulsarme ✧')
  if (!participant) return

  const { tag, reply } = mentionReply(ctx, participant)

  if (isSuperAdmin(participant)) {
    return reply('Acción no permitida', [`Usuario: ${tag}`, 'Creó el grupo ♕', 'No se le puede expulsar ✗'])
  }

  const result = await update(ctx, participant, 'remove')

  if (result?.status && String(result.status) !== '200') {
    return reply('No se pudo completar', [`Usuario: ${tag}`, `Código: ${result.status} ✗`])
  }

  await reply('Usuario expulsado', [`Usuario: ${tag}`, 'Estado: fuera del grupo ✓', 'Hecho ♡'])
}

export const setGroupOpen = async (ctx, open) => {
  const group = await ctx.getGroup()

  if (!group) return ctx.reply(box('Sin información', ['No pude ver el grupo ✗']))

  if (Boolean(group.announce) === !open) {
    return ctx.reply(
      open
        ? box('Sin cambios', ['El grupo ya está abierto ❀', 'Todos pueden escribir ✿'])
        : box('Sin cambios', ['El grupo ya está cerrado ❀', 'Solo los admins escriben ✿'])
    )
  }

  try {
    await ctx.sock.groupSettingUpdate(ctx.chat, open ? 'not_announcement' : 'announcement')
  } catch {
    return ctx.reply(box('No se pudo completar', ['No pude cambiar el grupo ✗']))
  }

  groupCache.del(ctx.chat)

  const senderIds = new Set(ctx.senderIds)
  const author = group.participants.find(item => matches(item, senderIds))
  const mention = author?.id || ctx.sender
  const tag = `@${jidNumber(mention)}`

  await ctx.reply({
    text: open
      ? box('Grupo abierto', [`Por: ${tag}`, 'Todos pueden escribir ✿', 'Hecho ♡'])
      : box('Grupo cerrado', [`Por: ${tag}`, 'Solo los admins pueden escribir ❀', 'Hecho ♡']),
    mentions: [mention]
  })
}
