import * as pokemon from '../../utils/pokemon.js'

export default {
  name: 'atrapar',
  aliases: ['pokeatrapar'],
  description: 'Atrapa el Pokémon que invocaste antes de que se desvanezca.',
  run: async ctx => {
    const me = ctx.senderNumber
    const now = Date.now()
    const spawn = pokemon.getActiveSpawn(ctx.chat, me)

    if (!spawn) {
      return ctx.reply(`✧ No hay ningún Pokémon esperándote aquí. Invoca uno con *${ctx.prefix}pokeinvocar*.`)
    }

    if (now > spawn.expiresAt) {
      const late = ((now - spawn.expiresAt) / 1000).toFixed(1)
      return ctx.reply(`✧ *${spawn.name}* ${pokemon.sceneOf(spawn.scene).vanish} hace *${late}s*.`)
    }

    const caught = pokemon.catchSpawn(spawn.id, me)
    if (!caught) return ctx.reply('✧ No se pudo atrapar al Pokémon, intenta de nuevo.')

    const elapsed = ((now - spawn.createdAt) / 1000).toFixed(1)

    return ctx.reply({
      text:
        `» ˚୨✿୧˚ \`ATRAPADO\` ˚୨✿୧˚\n\n` +
        `> *@${me}* atrapó a *${caught.name}* en *${elapsed}s*\n\n` +
        `✦ ID » #${caught.id}\n` +
        `❋ Tipo » ${caught.types.join(' ⟡ ')}\n` +
        `✪ Rareza » *${caught.rarity}*\n` +
        `✵ Valor » ${pokemon.money(caught.value)}\n` +
        `✰ Calidad » *${caught.quality}*`,
      mentions: [ctx.sender]
    })
  }
}
