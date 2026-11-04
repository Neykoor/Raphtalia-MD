import { start } from './src/core/connection.js'
import log from './src/utils/logger.js'

process.on('unhandledRejection', error => {
  log.error('Promesa rechazada sin manejar:', error?.message ?? error)
})

process.on('uncaughtException', error => {
  log.error('Excepción no capturada:', error?.message ?? error)
})

start().catch(error => {
  log.error('No se pudo iniciar el bot:', error?.message ?? error)
  process.exit(1)
})
