import * as gacha from '../../utils/gacha.js'

const PER_PAGE = 10

export default gacha.define({
  name: 'favboard',
  aliases: ['favtop', 'favoritetop'],
  description: 'Muestra el top global de personajes favoritos.',
  run: async ctx => {
    const { args, prefix, command } = ctx
    const empty = `⚠️ Aún nadie tiene un personaje favorito. Márcalo con *${prefix}principal*.`

    const entries = []
    for (const item of gacha.getPrimaryCounts()) {
      const character = gacha.getCharacterById(item.characterId)
      if (character) entries.push({ character, total: item.total })
    }
    if (!entries.length) return ctx.reply(empty)

    const pageArg = args.find(arg => /^\d+$/.test(arg))
    const page = pageArg ? parseInt(pageArg, 10) : 1
    const totalPages = Math.max(1, Math.ceil(entries.length / PER_PAGE))

    if (page < 1 || page > totalPages) return ctx.reply(`ꕥ Página no válida. Hay un total de *${totalPages}* páginas.`)

    const start = (page - 1) * PER_PAGE
    const end = Math.min(start + PER_PAGE, entries.length)

    let message = '✰ *Top de personajes favoritos:*\n\n'
    for (let i = start; i < end; i++) {
      const { character, total } = entries[i]
      message += `#${i + 1} » *${character.name}*\n`
      message += `   ♡ ${total} favorito${total !== 1 ? 's' : ''}\n`
    }

    message += `\n⌦ Página *${page}* de *${totalPages}*`
    if (page < totalPages) message += `\n> Para ver la siguiente página » *${prefix}${command} ${page + 1}*`

    return ctx.reply(message.trim())
  }
})
