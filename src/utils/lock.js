import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import log from './logger.js'

const heartbeatMs = 10000
const staleMs = 30000
const waitStepMs = 2000
const waitMaxMs = 45000

const isAlive = pid => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

const isHeld = file => {
  if (!existsSync(file)) return false
  try {
    const pid = Number(readFileSync(file, 'utf8'))
    if (!pid || pid === process.pid) return false
    if (Date.now() - statSync(file).mtimeMs > staleMs) return false
    return isAlive(pid)
  } catch {
    return false
  }
}

export const acquireLock = async dir => {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, '.lock')
  const startedAt = Date.now()

  while (isHeld(file)) {
    if (Date.now() - startedAt > waitMaxMs) return false
    if (Date.now() - startedAt < waitStepMs) log.warn('Otra instancia está usando la sesión, esperando a que se cierre...')
    await new Promise(resolve => setTimeout(resolve, waitStepMs))
  }

  writeFileSync(file, String(process.pid))

  const beat = setInterval(() => {
    try {
      utimesSync(file, new Date(), new Date())
    } catch {
      try {
        writeFileSync(file, String(process.pid))
      } catch {}
    }
  }, heartbeatMs)
  beat.unref()

  process.once('exit', () => {
    clearInterval(beat)
    try {
      if (Number(readFileSync(file, 'utf8')) === process.pid) unlinkSync(file)
    } catch {}
  })

  return true
}
