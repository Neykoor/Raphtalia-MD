import config from './config.js'
import { start } from './src/core/connection.js'
import { restoreJadibots } from './src/core/jadibot.js'
import log from './src/utils/logger.js'

process.on('unhandledRejection', error => {
  log.error('Promesa rechazada sin manejar:', error?.message ?? error)
})

process.on('uncaughtException', error => {
  log.error('Excepción no capturada:', error?.message ?? error)
})

let jadibotsStarted = false

const startJadibots = () => {
  if (jadibotsStarted) return
  jadibotsStarted = true
  restoreJadibots().catch(error => {
    log.error('No se pudieron restaurar los jadibots:', error?.message ?? error)
  })
}

start({
  onOpen: startJadibots,
  onRegistered: () => {
    const timer = setTimeout(startJadibots, config.jadibotBootDelayMs)
    timer.unref()
  }
}).catch(error => {
  log.error('No se pudo iniciar el bot:', error?.message ?? error)
  process.exit(1)
})
