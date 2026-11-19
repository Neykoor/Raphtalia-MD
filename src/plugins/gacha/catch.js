import * as gacha from '../../utils/gacha.js'
import { economyGate, getChatUser, setChatUser } from '../../utils/economy.js'
import { TICKET_CHANCE } from '../../utils/tickets.js'

export default gacha.define({
  name: 'catch',
  aliases: ['atraparchar', 'capturar'],
  description: 'Usa un ticket para intentar atrapar un personaje libre con probabilidad.',
  run: async ctx => {
    if (!(await economyGate(ctx))) return

    const me = ctx.senderNumber
    const { chat, text, prefix, command } = ctx

    if (!text) {
      return ctx.reply(`❀ Debes escribir el nombre del personaje que quieres atrapar.\n> Ejemplo » *${prefix}${command} Eris*`)
    }

    let character = gacha.findCharacterExact(text)
    if (!character) {
      const q = text.toLowerCase().trim()
      const matches = gacha.getAllCharacters().filter(c => c.name.toLowerCase().includes(q))
      if (!matches.length) return ctx.reply(`ꕥ No se ha encontrado al personaje *${text}*.`)
      if (matches.length > 1) {
        const list = matches
          .slice(0, 8)
          .map(c => `» *${c.name}* \`${c.id}\``)
          .join('\n')
        const extra = matches.length > 8 ? `\n> y *${matches.length - 8}* más...` : ''
        return ctx.reply(`ꕥ Hay *${matches.length}* personajes que coinciden con *${text}*. Usa el ID para elegir uno:\n\n${list}${extra}\n\n✐ Ejemplo: *${prefix}${command} ${matches[0].id}*`)
      }
      character = matches[0]
    }

    const owner = gacha.getOwner(character.id)
    if (owner) {
      return ctx.reply({
        text: `ꕥ *${character.name}* ya ha sido reclamado por *${gacha.displayName(owner)}*. No se gastó ningún ticket.`,
        mentions: [gacha.mentionJid(owner)]
      })
    }

    const user = getChatUser(chat, me)
    const tickets = user.inventory?.ticket || 0
    if (tickets < 1) {
      return ctx.reply(`ꕥ No tienes tickets.\n> Compra uno con *${prefix}buy ticket* (puedes usar *${prefix}buy ticket 5*).`)
    }

    const inventory = { ...user.inventory }
    if (tickets - 1 <= 0) delete inventory.ticket
    else inventory.ticket = tickets - 1
    setChatUser(chat, me, 'inventory', inventory)

    const percent = Math.round(TICKET_CHANCE * 100)
    const left = tickets - 1

    if (Math.random() >= TICKET_CHANCE) {
      gacha.react(ctx, '💨')
      return ctx.reply(
        `ꕥ *${character.name}* se escapó.\n> ✦ Probabilidad » *${percent}%*\n> ⛁ Tickets restantes » *${left}*`
      )
    }

    if (!gacha.claimCharacter(character.id, me, Date.now())) {
      inventory.ticket = (inventory.ticket || 0) + 1
      setChatUser(chat, me, 'inventory', inventory)
      return ctx.reply('ꕥ No se pudo atrapar al personaje, tu ticket fue devuelto.')
    }

    gacha.react(ctx, '🌸')
    return ctx.reply({
      text:
        `❀ *${gacha.displayName(me)}* atrapó a *${character.name}*!\n` +
        `✦ ID » \`${character.id}\`\n` +
        `✰ Valor » *${gacha.money(character.value)}*\n` +
        `⛁ Tickets restantes » *${left}*`,
      mentions: [ctx.sender]
    })
  }
})
