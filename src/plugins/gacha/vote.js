import * as gacha from '../../utils/gacha.js'

export default gacha.define({
  name: 'vote',
  aliases: ['votar'],
  description: 'Vota por un personaje para subir su valor.',
  run: async ctx => {
    const me = ctx.senderNumber
    const { text, prefix, command } = ctx

    const cooldown = gacha.checkVoteCooldown(me)
    if (!cooldown.ready) return ctx.reply(`ꕥ Debes esperar *${gacha.formatTime(cooldown.remainingMs)}* para volver a votar.`)

    if (!text) return ctx.reply(`❀ Debes especificar un personaje para votarlo.\n> Ejemplo » *${prefix}${command} Rem*`)

    const character = gacha.findCharacterExact(text)
    if (!character) return ctx.reply('ꕥ Personaje no encontrado. Asegúrate de que el nombre esté correcto.')

    const charCooldown = gacha.checkCharacterVoteCooldown(character.id)
    if (!charCooldown.ready) {
      return ctx.reply(
        `ꕥ *${character.name}* ha sido votada recientemente.\n> Debes esperar *${gacha.formatTime(charCooldown.remainingMs)}* para votarla de nuevo.`
      )
    }

    const result = gacha.voteForCharacter(character.id, me, Date.now())
    if (!result) return ctx.reply(`ꕥ El personaje *${character.name}* ya alcanzó el valor máximo por hoy.`)

    return ctx.reply(`❀ Votaste por *${character.name}* (*${character.series}*)\n> Su nuevo valor es *${gacha.money(result.newValue)}*`)
  }
})
