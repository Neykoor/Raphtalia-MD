import { jidNumber, normalizeJid } from '../../utils/jid.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

export default {
  name: 'revoke',
  aliases: ['restablecer', 'resetlink'],
  description: 'Restablece el enlace de invitación del grupo',
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  run: async ctx => {
    const group = await ctx.getGroup()
    const senderIds = new Set(ctx.senderIds)
    const author = group?.participants.find(item =>
      [item.id, item.lid, item.phoneNumber].some(id => id && senderIds.has(normalizeJid(id)))
    )
    const mention = author?.id || ctx.sender

    await ctx.sock.groupRevokeInvite(ctx.chat)
    const code = await ctx.sock.groupInviteCode(ctx.chat)

    await ctx.reply({
      text: box('Nuevo link del grupo', [
        `Solicitado por: @${jidNumber(mention)} ❀`,
        `Enlace: https://chat.whatsapp.com/${code} ✿`,
        'El enlace anterior ya no funciona ♡'
      ]),
      mentions: [mention]
    })
  }
}
