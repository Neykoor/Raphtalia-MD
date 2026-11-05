import { groupCache } from './groups.js'
import { jidNumber, normalizeJid } from './jid.js'

const matches = (participant, ids) =>
  [participant.id, participant.lid, participant.phoneNumber].some(value => value && ids.has(normalizeJid(value)))

const hasAdmin = participant => Boolean(participant.admin || participant.isAdmin || participant.isSuperAdmin)

const isSuperAdmin = participant => participant.admin === 'superadmin' || Boolean(participant.isSuperAdmin)

export const setAdmin = async (ctx, action) => {
  const target = ctx.mentions[0] || ctx.quoted?.sender

  if (!target) {
    return ctx.reply(`Menciona al usuario con @ o responde a su mensaje.\nEjemplo: ${ctx.prefix}${ctx.command} @usuario`)
  }

  const group = await ctx.getGroup()
  if (!group) return ctx.reply('No se pudo obtener la información del grupo.')

  const participant = group.participants.find(item => matches(item, new Set([normalizeJid(target)])))
  if (!participant) return ctx.reply('Ese usuario no está en el grupo.')

  const botIds = new Set([normalizeJid(ctx.sock.user?.id), normalizeJid(ctx.sock.user?.lid)].filter(Boolean))
  if (matches(participant, botIds)) return ctx.reply('No puedo cambiar mi propio rol.')

  const tag = `@${jidNumber(participant.id)}`
  const mentions = [participant.id]
  const reply = text => ctx.reply({ text, mentions })
  const admin = hasAdmin(participant)

  if (action === 'promote' && admin) return reply(`${tag} ya es administrador.`)
  if (action === 'demote' && !admin) return reply(`${tag} no es administrador.`)
  if (action === 'demote' && isSuperAdmin(participant)) {
    return reply(`${tag} es el creador del grupo y no se le puede quitar el rol.`)
  }

  const [result] = await ctx.sock.groupParticipantsUpdate(ctx.chat, [participant.id], action)
  groupCache.del(ctx.chat)

  if (result?.status && String(result.status) !== '200') {
    return reply(`No se pudo actualizar a ${tag} (código ${result.status}).`)
  }

  await reply(action === 'promote' ? `${tag} ahora es administrador.` : `${tag} ya no es administrador.`)
}
