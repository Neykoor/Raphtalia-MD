import { groupCache } from './groups.js'
import { jidNumber, normalizeJid } from './jid.js'

const matches = (participant, ids) =>
  [participant.id, participant.lid, participant.phoneNumber].some(value => value && ids.has(normalizeJid(value)))

const hasAdmin = participant => Boolean(participant.admin || participant.isAdmin || participant.isSuperAdmin)

const isSuperAdmin = participant => participant.admin === 'superadmin' || Boolean(participant.isSuperAdmin)

const pickTarget = async (ctx, selfMessage) => {
  const target = ctx.mentions[0] || ctx.quoted?.sender

  if (!target) {
    await ctx.reply(
      `✧ Menciona a alguien con @ o responde a su mensaje, por favor ✿\n❀ Ejemplo: ${ctx.prefix}${ctx.command} @usuario`
    )
    return null
  }

  const group = await ctx.getGroup()

  if (!group) {
    await ctx.reply('✧ No pude obtener la información del grupo ✗')
    return null
  }

  const participant = group.participants.find(item => matches(item, new Set([normalizeJid(target)])))

  if (!participant) {
    await ctx.reply('✧ Esa persona no está en el grupo ✗')
    return null
  }

  const botIds = new Set([normalizeJid(ctx.sock.user?.id), normalizeJid(ctx.sock.user?.lid)].filter(Boolean))

  if (matches(participant, botIds)) {
    await ctx.reply(selfMessage)
    return null
  }

  return participant
}

const mentionReply = (ctx, participant) => {
  const tag = `@${jidNumber(participant.id)}`
  const reply = text => ctx.reply({ text, mentions: [participant.id] })
  return { tag, reply }
}

const update = async (ctx, participant, action) => {
  const [result] = await ctx.sock.groupParticipantsUpdate(ctx.chat, [participant.id], action)
  groupCache.del(ctx.chat)
  return result
}

export const setAdmin = async (ctx, action) => {
  const participant = await pickTarget(ctx, '✧ No puedo cambiar mi propio rol ✧')
  if (!participant) return

  const { tag, reply } = mentionReply(ctx, participant)
  const admin = hasAdmin(participant)

  if (action === 'promote' && admin) return reply(`❀ ${tag} ya es administrador ✿`)
  if (action === 'demote' && !admin) return reply(`❀ ${tag} no es administrador ✿`)
  if (action === 'demote' && isSuperAdmin(participant)) {
    return reply(`♕ ${tag} es quien creó el grupo, no puedo quitarle el rol ✧`)
  }

  const result = await update(ctx, participant, action)

  if (result?.status && String(result.status) !== '200') {
    return reply(`✧ No pude actualizar a ${tag} (código ${result.status}) ✗`)
  }

  await reply(
    action === 'promote'
      ? `₊˚✧ Listo  ${tag} ahora es administrador ✧˚₊`
      : `₊˚✧ Hecho  ${tag} ya no es administrador ✧˚₊`
  )
}

export const kickMember = async ctx => {
  const participant = await pickTarget(ctx, '✧ No puedo expulsarme a mí misma ✧')
  if (!participant) return

  const { tag, reply } = mentionReply(ctx, participant)

  if (isSuperAdmin(participant)) {
    return reply(`♕ ${tag} creó el grupo, no puedo expulsar a quien lo creó ✧`)
  }

  const result = await update(ctx, participant, 'remove')

  if (result?.status && String(result.status) !== '200') {
    return reply(`✧ No pude expulsar a ${tag} (código ${result.status}) ✗`)
  }

  await reply(`₊˚✧ Hecho ♡ ${tag} ya no está en el grupo ✧˚₊`)
}
