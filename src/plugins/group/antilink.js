import { groupCache } from '../../utils/groups.js'
import { jidNumber, normalizeJid } from '../../utils/jid.js'
import { isEnabled } from '../../utils/settings.js'
import { addWarn, box, clearWarns, getSettings, resolveTarget } from '../../utils/warns.js'

const groupLinks = /chat\.whatsapp\.com\/(?:invite\/)?([0-9A-Za-z]{16,32})/gi
const channelLink = /whatsapp\.com\/channel\/[0-9A-Za-z]+/i

const idsOf = participant => [participant.id, participant.lid, participant.phoneNumber].filter(Boolean).map(normalizeJid)

const ownCode = async ctx => {
  try {
    return await ctx.sock.groupInviteCode(ctx.chat)
  } catch {
    return null
  }
}

const detect = async ctx => {
  const invite = ctx.content.groupInviteMessage
  if (invite && normalizeJid(invite.groupJid) !== ctx.chat) return 'group'

  const text = ctx.body || ''
  if (!text) return null

  if (channelLink.test(text)) return 'channel'

  const codes = [...text.matchAll(groupLinks)].map(match => match[1])
  if (!codes.length) return null

  const own = await ownCode(ctx)
  return codes.some(code => code !== own) ? 'group' : null
}

export default {
  all: async ctx => {
    if (!ctx.isGroup || ctx.fromMe || ctx.isOwner) return
    if (!isEnabled(ctx.chat, 'antilink')) return

    const hasInvite = Boolean(ctx.content.groupInviteMessage)
    const hasText = (ctx.body || '').toLowerCase().includes('whatsapp.com/')
    if (!hasInvite && !hasText) return

    const group = await ctx.getGroup()
    if (!group) return

    const isAdmin = participant => Boolean(participant.admin || participant.isAdmin || participant.isSuperAdmin)
    const senderIds = new Set(ctx.senderIds.map(normalizeJid))
    const botIds = new Set([normalizeJid(ctx.sock.user?.id), normalizeJid(ctx.sock.user?.lid)].filter(Boolean))

    const sender = group.participants.find(item => idsOf(item).some(id => senderIds.has(id)))
    const bot = group.participants.find(item => idsOf(item).some(id => botIds.has(id)))

    if (!bot || !isAdmin(bot)) return
    if (sender && isAdmin(sender)) return

    const kind = await detect(ctx)
    if (!kind) return

    try {
      await ctx.sock.sendMessage(ctx.chat, { delete: ctx.key })
    } catch {
      return
    }

    const target = await resolveTarget({ mentions: [ctx.sender], quoted: null, getGroup: ctx.getGroup })
    if (!target) return

    const reason = kind === 'channel' ? 'Envió el enlace de un canal.' : 'Envió el enlace de otro grupo.'
    const warnings = addWarn(ctx.chat, target.keys, { reason, at: Date.now(), by: normalizeJid(ctx.sock.user?.id) })
    const total = warnings.length
    const { limit, kick } = getSettings(ctx.chat)

    const lines = [`Usuario: ${target.tag}`, `Motivo: ${reason} ❀`, `Advertencias: ${total}/${limit} ✿`]

    if (total >= limit && kick) {
      let removed = false

      if (target.participant) {
        try {
          const [result] = await ctx.sock.groupParticipantsUpdate(ctx.chat, [target.participant.id], 'remove')
          removed = !result?.status || String(result.status) === '200'
        } catch {
          removed = false
        }
      }

      if (removed) {
        clearWarns(ctx.chat, target.keys)
        groupCache.del(ctx.chat)
        lines.push('Llegó al límite y fue expulsado del grupo ♡')
      } else {
        lines.push('Llegó al límite, pero no pude expulsarlo ✗')
      }
    }

    await ctx.send({ text: box('Antilink', lines), mentions: [target.mention] })
  }
}
