import * as gacha from '../../utils/gacha.js'

const formatElapsed = ms => {
  if (!ms || ms <= 0) return '—'
  const sec = Math.floor(ms / 1000)
  const parts = []
  const w = Math.floor(sec / 604800)
  const d = Math.floor((sec % 604800) / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (w) parts.push(`${w}w`)
  if (d) parts.push(`${d}d`)
  if (h) parts.push(`${h}h`)
  if (m) parts.push(`${m}m`)
  if (s) parts.push(`${s}s`)
  return parts.join(' ')
}

export default gacha.define({
  name: 'charinfo',
  aliases: ['winfo', 'waifuinfo'],
  description: 'Muestra información detallada de un personaje.',
  run: async ctx => {
    const { text, prefix, command } = ctx
    if (!text) return ctx.reply(`❀ Por favor, proporciona el nombre de un personaje.\n> Ejemplo » *${prefix}${command} Rem*`)

    const character = gacha.findCharacterByQuery(text)
    if (!character) return ctx.reply(`ꕥ No se encontró el personaje *${text}*.`)

    const ownership = gacha.getOwnership(character.id)
    let statusLine = '*Libre*'
    let claimedLine = ''
    const mentions = []
    if (ownership) {
      statusLine = `Reclamado por *${gacha.displayName(ownership.owner)}*`
      mentions.push(gacha.mentionJid(ownership.owner))
      claimedLine = `\nⴵ Fecha de reclamo » *${new Date(ownership.claimedAt).toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}*`
    }

    const rank = gacha.getCharactersByValue().findIndex(c => c.id === character.id) + 1
    const stats = gacha.getCharacterVoteStats(character.id)
    const lastVote = stats.lastVotedAt ? `hace *${formatElapsed(Date.now() - stats.lastVotedAt)}*` : '*Nunca*'

    const caption =
      `❀ Nombre » *${character.name}*\n` +
      `✎ ID » \`${character.id}\`\n` +
      `⚥ Género » *${character.gender}*\n` +
      `✰ Valor » *${gacha.money(character.value)}*\n` +
      `♡ Estado » ${statusLine}${claimedLine}\n` +
      `❖ Serie » *${character.series}*\n` +
      `❏ Puesto » *#${rank || '—'}*\n` +
      `ⴵ Último voto » ${lastVote}`

    return ctx.reply({ text: caption, mentions })
  }
})
