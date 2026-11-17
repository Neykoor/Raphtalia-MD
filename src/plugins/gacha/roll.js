import * as gacha from '../../utils/gacha.js'
import * as yandere from '../../utils/yandere.js'

const locks = new Map()
const LOCK_MS = 15000
const ATTEMPTS = 3

export default gacha.define({
  name: 'roll',
  aliases: ['rw', 'rollwaifu'],
  description: 'Tira un personaje aleatorio del catálogo gacha.',
  run: async ctx => {
    const me = ctx.senderNumber
    const now = Date.now()
    for (const [key, lockedAt] of locks) {
      if (now - lockedAt > LOCK_MS) locks.delete(key)
    }
    if (locks.has(me)) return
    locks.set(me, now)

    try {
      if (gacha.countCharacters() === 0) {
        return ctx.reply('⚠️ Aún no hay personajes en el catálogo. Un owner puede generarlos con *genchar*.')
      }

      const cooldown = gacha.checkRollCooldown(me)
      if (!cooldown.ready) return ctx.reply(`⏳ Debes esperar *${gacha.formatTime(cooldown.remainingMs)}* para volver a tirar.`)

      gacha.react(ctx, '🕒')

      let character = null
      let post = null
      for (let i = 0; i < ATTEMPTS && !post?.url; i++) {
        character = gacha.getRandomCharacter()
        if (!character) break
        post = await yandere.getRandomPost(character.tag)
      }

      if (!character || !post?.url) {
        gacha.react(ctx, '✖️')
        return ctx.reply('✐ No se encontraron imágenes para el personaje, intenta de nuevo.')
      }

      const owner = gacha.getOwner(character.id)
      const estado = owner ? `Reclamado por ${gacha.displayName(owner)}` : 'Libre'

      const caption =
        `➩ ¡Un personaje salvaje apareció!\n\n` +
        `✿ Nombre » *${character.name}*\n` +
        `✦ ID » \`${character.id}\`\n` +
        `⚥ Género » *${character.gender}*\n` +
        `❖ Serie » *${character.series}*\n` +
        `✰ Valor » *${gacha.money(character.value)}*\n` +
        `♡ Estado » *${estado}*`

      const sent = await ctx.reply({ image: { url: post.url }, caption })

      if (sent?.key?.id) {
        gacha.recordRoll({
          messageId: sent.key.id,
          chatId: ctx.chat,
          characterId: character.id,
          name: character.name,
          value: character.value,
          rolledBy: me
        })
      }
      gacha.setRollCooldown(me, Date.now())
      gacha.react(ctx, '🌸')
    } finally {
      locks.delete(me)
    }
  }
})
