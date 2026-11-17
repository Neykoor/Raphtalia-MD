import * as gacha from '../../utils/gacha.js'

export default gacha.define({
  name: 'claim',
  aliases: ['c', 'reclamar'],
  description: 'Reclama el personaje de un roll citado.',
  run: async ctx => {
    const me = ctx.senderNumber
    const now = Date.now()

    const cooldown = gacha.checkClaimCooldown(me)
    if (!cooldown.ready) return ctx.reply(`ꕥ Debes esperar *${gacha.formatTime(cooldown.remainingMs)}* para volver a reclamar.`)

    const roll = ctx.quoted?.id ? gacha.getRoll(ctx.quoted.id) : null
    if (!roll || roll.chatId !== ctx.chat) return ctx.reply('❀ Debes citar un personaje válido para reclamar.')

    const character = gacha.getCharacterById(roll.characterId)
    if (!character) return ctx.reply('ꕥ Personaje no encontrado en el catálogo.')

    const alreadyClaimed = ownerId =>
      ctx.reply({
        text: `ꕥ El personaje *${character.name}* \`${character.id}\` ya ha sido reclamado por *${gacha.displayName(ownerId)}*`,
        mentions: [gacha.mentionJid(ownerId)]
      })

    const currentOwner = gacha.getOwner(character.id)
    if (currentOwner) return alreadyClaimed(currentOwner)

    if (now < roll.reservedUntil && me !== roll.rolledBy) {
      const left = ((roll.reservedUntil - now) / 1000).toFixed(1)
      return ctx.reply(`ꕥ Este personaje está protegido durante *${left}s*, solo quien lo tiró puede reclamarlo.`)
    }

    if (now > roll.expiresAt) {
      const expired = ((now - roll.expiresAt) / 1000).toFixed(1)
      return ctx.reply(`ꕥ El personaje ha expirado » ${expired}s.`)
    }

    if (!gacha.claimCharacter(character.id, me, now)) {
      const winner = gacha.getOwner(character.id)
      return winner ? alreadyClaimed(winner) : ctx.reply('ꕥ No se pudo reclamar el personaje, intenta de nuevo.')
    }

    gacha.setClaimCooldown(me, now)
    gacha.react(ctx, '🌸')

    const name = gacha.displayName(me)
    const duration = ((now - roll.createdAt) / 1000).toFixed(1)
    const template = gacha.getClaimMessage(me)
    const caption = template
      ? gacha.renderClaimMessage(template, { user: name, character: character.name })
      : `❀ *${character.name}* ha sido reclamado por *${name}*\n` +
        `✦ ID » \`${character.id}\`\n` +
        `✰ Valor » *${gacha.money(character.value)}*\n` +
        `⏱ Tiempo » *${duration}s*`

    return ctx.reply({ text: caption, mentions: [ctx.sender] })
  }
})
