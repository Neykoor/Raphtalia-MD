import config from '../../config.js'

const EDIT_INTERVAL_MS = 4000
const EDIT_WINDOW_MS = 14 * 60000

export const PHASE_LABEL = {
  iniciando: 'Iniciando',
  posts: 'Descargando posts',
  tags: 'Identificando personajes',
  personajes: 'Guardando personajes',
  finalizando: 'Finalizando'
}

let current = null

export const beginJob = label => {
  if (current) return null
  current = {
    label,
    startedAt: Date.now(),
    controller: new AbortController(),
    progress: {
      series: label,
      seriesIndex: 1,
      seriesTotal: 1,
      phase: 'iniciando',
      pagesDone: 0,
      pagesTotal: 0,
      posts: 0,
      tagsChecked: 0,
      tagsTotal: 0,
      charsDone: 0,
      charsTotal: 0,
      added: 0,
      skipped: 0
    }
  }
  return current
}

export const endJob = job => {
  if (current === job) current = null
}

export const getJob = () => current

export const cancelJob = () => {
  if (!current || current.controller.signal.aborted) return null
  current.controller.abort()
  return current
}

export const formatElapsed = ms => {
  const total = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export const phaseDetail = p => {
  if (p.phase === 'posts' && p.pagesDone) return ` (pág. ${p.pagesDone}${p.pagesTotal ? `/${p.pagesTotal}` : ''} · ${p.posts} posts)`
  if (p.phase === 'tags' && p.tagsTotal) return ` (${p.tagsChecked}/${p.tagsTotal})`
  if (p.phase === 'personajes' && p.charsTotal) return ` (${p.charsDone}/${p.charsTotal})`
  return ''
}

export const renderProgress = job => {
  const p = job.progress
  const cancelling = job.controller.signal.aborted ? '\n🛑 Cancelando...' : ''
  return (
    `🔄 *Generando personajes*\n` +
    `✎ Serie ${p.seriesIndex}/${p.seriesTotal} › *${p.series}*\n` +
    `✐ Fase › ${PHASE_LABEL[p.phase]}${phaseDetail(p)}\n` +
    `✿ Agregados › *${p.added}* · Omitidos › *${p.skipped}*\n` +
    `⏱ ${formatElapsed(Date.now() - job.startedAt)}\n` +
    `Usa *${config.prefixes[0]}gencancel* para detener.${cancelling}`
  )
}

export const createReporter = ({ sock, chatId, msg }, job) => {
  let key
  let lastEdit = 0
  let timer = null
  let closed = false

  const edit = async text => {
    if (!key) return
    lastEdit = Date.now()
    await sock.sendMessage(chatId, { text, edit: key }).catch(() => undefined)
  }

  const flushEdit = async () => {
    timer = null
    if (closed) return
    if (Date.now() - job.startedAt > EDIT_WINDOW_MS) {
      closed = true
      return
    }
    await edit(renderProgress(job))
  }

  return {
    async start() {
      const sent = await sock.sendMessage(chatId, { text: renderProgress(job) }, { quoted: msg }).catch(() => undefined)
      key = sent?.key
    },
    touch() {
      if (closed || !key || timer) return
      const wait = Math.max(0, EDIT_INTERVAL_MS - (Date.now() - lastEdit))
      timer = setTimeout(() => void flushEdit(), wait)
      timer.unref?.()
    },
    async finish(text) {
      closed = true
      if (timer) clearTimeout(timer)
      timer = null
      if (Date.now() - job.startedAt <= EDIT_WINDOW_MS) {
        const headline = job.controller.signal.aborted ? '🛑 Proceso cancelado' : '✅ Proceso terminado'
        await edit(`${headline} en ${formatElapsed(Date.now() - job.startedAt)}`)
      }
      await sock.sendMessage(chatId, { text }, { quoted: msg }).catch(() => undefined)
    }
  }
}
