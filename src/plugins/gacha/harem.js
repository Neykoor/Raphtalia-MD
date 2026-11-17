import * as gacha from '../../utils/gacha.js'

const PER_PAGE = 20

export default gacha.define({
  name: 'harem',
  aliases: ['waifus', 'claims'],
  description: 'Muestra los personajes reclamados de un usuario.',
  run: async ctx => {
    const me = ctx.senderNumber
    const picked = await gacha.target(ctx)
    const targetId = picked ? picked.id : me
    const targetJid = picked ? picked.jid : gacha.mentionJid(me)
    const name = gacha.displayName(targetId)

    const owned = gacha.getUserCharacters(targetId)
    if (!owned.length) {
      const text = targetId === me ? 'ꕥ No tienes personajes reclamados.' : `ꕥ *${name}* no tiene personajes reclamados.`
      return ctx.reply({ text, mentions: [targetJid] })
    }

    const primaryId = gacha.getPrimaryCharacter(targetId)
    const pageArg = ctx.args.find(arg => /^\d+$/.test(arg))
    const page = pageArg ? parseInt(pageArg, 10) : 1
    const totalPages = Math.ceil(owned.length / PER_PAGE)
    if (page < 1 || page > totalPages) return ctx.reply(`❀ Página no válida. Hay un total de *${totalPages}* páginas.`)

    const start = (page - 1) * PER_PAGE
    const end = Math.min(start + PER_PAGE, owned.length)

    let message = `✿ Personajes reclamados ✿\n⌦ Usuario: *${name}*\n♡ Personajes: *(${owned.length})*\n\n`
    for (let i = start; i < end; i++) {
      const c = owned[i]
      message += `${c.id === primaryId ? '★' : '»'} *${c.name}* \`${c.id}\` (*${gacha.money(c.value)}*)\n`
    }
    message += `\n⌦ _Página *${page}* de *${totalPages}*_`
    if (page < totalPages) message += `\n> Usa *${ctx.prefix}${ctx.command} ${page + 1}* para ver la siguiente página.`

    return ctx.reply({ text: message.trim(), mentions: [targetJid] })
  }
})
