import * as gacha from '../../utils/gacha.js'

const status = check => (check.ready ? 'Disponible' : gacha.formatTime(check.remainingMs))

export default gacha.define({
  name: 'gachainfo',
  aliases: ['ginfo', 'infogacha'],
  description: 'Muestra tu información y cooldowns de gacha.',
  run: async ctx => {
    const me = ctx.senderNumber
    const owned = gacha.getUserCharacters(me)
    const totalValue = owned.reduce((sum, c) => sum + c.value, 0)

    return ctx.reply(
      `*❀ Usuario \`<${gacha.displayName(me)}>\`*\n\n` +
        `ⴵ RollWaifu » *${status(gacha.checkRollCooldown(me))}*\n` +
        `ⴵ Claim » *${status(gacha.checkClaimCooldown(me))}*\n` +
        `ⴵ Vote » *${status(gacha.checkVoteCooldown(me))}*\n\n` +
        `♡ Personajes reclamados » *${owned.length}*\n` +
        `✰ Valor total » *${gacha.money(totalValue)}*\n` +
        `❏ Personajes totales » *${gacha.countCharacters()}*\n` +
        `❏ Series totales » *${gacha.getSeriesList().length}*`
    )
  }
})
