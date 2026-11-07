import { jidNumber } from '../../utils/jid.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

export default {
  name: 'getpic',
  aliases: ['pfp'],
  description: 'Muestra la foto de perfil de un usuario',
  run: async ctx => {
    const who = ctx.mentions[0] || ctx.quoted?.sender || null

    if (!who) {
      return ctx.reply(
        box('Falta un usuario', [
          'Menciona o responde al usuario ✿',
          `Ejemplo: ${ctx.prefix}${ctx.command} @usuario ❀`
        ])
      )
    }

    const url = await ctx.sock.profilePictureUrl(who, 'image').catch(() => null)

    if (!url) {
      return ctx.reply({
        text: box('No se pudo completar', [`No pude obtener la foto de @${jidNumber(who)} ✗`]),
        mentions: [who]
      })
    }

    await ctx.reply({ image: { url } })
  }
}
