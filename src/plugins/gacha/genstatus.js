import * as gacha from '../../utils/gacha.js'
import * as job from '../../utils/genjob.js'
import * as yandere from '../../utils/yandere.js'

export default gacha.define({
  name: 'genstatus',
  aliases: ['genestado'],
  description: 'Muestra el avance de la generación en curso y el estado de yande.re.',
  ownerOnly: true,
  run: async ctx => {
    const active = job.getJob()
    const health = yandere.getHealth()
    const lines = []

    if (active) {
      const p = active.progress
      lines.push('*< GENERACIÓN EN CURSO />*')
      lines.push(`✎ Trabajo › *${active.label}*`)
      lines.push(`✎ Serie ${p.seriesIndex}/${p.seriesTotal} › *${p.series}*`)
      lines.push(`✐ Fase › ${job.PHASE_LABEL[p.phase]}${job.phaseDetail(p)}`)
      lines.push(`✿ Agregados › *${p.added}* · Omitidos › *${p.skipped}*`)
      lines.push(`⏱ ${job.formatElapsed(Date.now() - active.startedAt)}`)
      lines.push(active.controller.signal.aborted ? '🛑 Cancelando...' : `Usa *${ctx.prefix}gencancel* para detenerla.`)
    } else {
      lines.push('💤 No hay ninguna generación en curso.')
    }

    lines.push('')
    lines.push('*< YANDE.RE />*')
    lines.push(health.blockedForMs > 0 ? `⛔ En pausa ${Math.ceil(health.blockedForMs / 1000)}s` : '✅ Disponible')
    lines.push(`✐ Peticiones OK › ${health.ok} · Fallidas › ${health.failed}`)
    if (health.lastStatus && health.lastStatus !== 200) lines.push(`✐ Último estado › HTTP ${health.lastStatus}`)
    if (health.lastError && health.consecutiveFails > 0) lines.push(`✐ Último error › ${health.lastError.slice(0, 80)}`)

    return ctx.reply(lines.join('\n'))
  }
})
