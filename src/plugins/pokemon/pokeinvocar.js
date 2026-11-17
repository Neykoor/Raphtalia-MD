import * as pokemon from '../../utils/pokemon.js'

const locks = new Map()
const LOCK_MS = 20000

export default {
  name: 'pokeinvocar',
  aliases: ['pinvocar', 'invocarpokemon', 'pokesummon'],
  description: 'Invoca un Pokémon salvaje desde la niebla.',
  run: async ctx => {
    const me = ctx.senderNumber
    const now = Date.now()
    for (const [key, lockedAt] of locks) {
      if (now - lockedAt > LOCK_MS) locks.delete(key)
    }
    if (locks.has(me)) return
    locks.set(me, now)

    try {
      const cooldown = pokemon.checkSummonCooldown(me)
      if (!cooldown.ready) {
        return ctx.reply(`✧ La niebla aún no se disipa. Espera *${pokemon.formatTime(cooldown.remainingMs)}* para volver a invocar.`)
      }

      ctx.react('🕒').catch(() => null)

      const result = await pokemon.summon({ chatId: ctx.chat, userId: me })
      if (!result) {
        ctx.react('✖️').catch(() => null)
        return ctx.reply('✧ La niebla no respondió. No se pudo contactar con PokéAPI, intenta de nuevo en unos segundos.')
      }

      const caption = pokemon.spawnCaption({
        spawn: result.spawn,
        count: result.count,
        mentionNumber: me,
        prefix: ctx.prefix
      })

      const message = result.spawn.image
        ? { image: { url: result.spawn.image }, caption, mentions: [ctx.sender] }
        : { text: caption, mentions: [ctx.sender] }

      await ctx.reply(message)
      ctx.react('✨').catch(() => null)
    } finally {
      locks.delete(me)
    }
  }
}
