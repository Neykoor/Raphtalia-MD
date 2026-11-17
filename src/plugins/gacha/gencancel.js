import * as gacha from '../../utils/gacha.js'
import * as job from '../../utils/genjob.js'

export default gacha.define({
  name: 'gencancel',
  aliases: ['gencancelar', 'genstop'],
  description: 'Cancela la generación de personajes en curso.',
  ownerOnly: true,
  run: async ctx => {
    const active = job.getJob()
    if (!active) return ctx.reply('💤 No hay ninguna generación en curso.')
    if (!job.cancelJob()) return ctx.reply('🛑 La generación ya se está cancelando.')
    return ctx.reply(`🛑 Cancelando *${active.label}*. Se detendrá en unos segundos.`)
  }
})
