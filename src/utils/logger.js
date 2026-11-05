import pino from 'pino'

export const colors = {
  reset: '\x1b[0m',
  gray: '\x1b[90m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
}

export const stamp = () => new Date().toLocaleTimeString('es-MX', { hour12: false })

const write = (color, label, args) => {
  console.log(`${colors.gray}${stamp()}${colors.reset} ${color}${label}${colors.reset}`, ...args)
}

export const silent = pino({ level: 'silent' })

export default {
  info: (...args) => write(colors.cyan, 'INFO ', args),
  success: (...args) => write(colors.green, 'OK   ', args),
  warn: (...args) => write(colors.yellow, 'WARN ', args),
  error: (...args) => write(colors.red, 'ERROR', args)
}
