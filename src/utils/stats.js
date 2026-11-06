import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../../config.js'

const file = fileURLToPath(new URL('../../data/stats.json', import.meta.url))
const saveDelayMs = 30000
const retentionDays = 365
const dayMs = 86400000

export const dayKey = (at = Date.now()) =>
  new Date(at).toLocaleDateString('en-CA', { timeZone: config.timezone || 'UTC' })

const load = () => {
  try {
    if (!existsSync(file)) return {}
    const data = JSON.parse(readFileSync(file, 'utf8'))
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

const stats = load()
let timer = null

const prune = () => {
  const oldest = dayKey(Date.now() - retentionDays * dayMs)

  for (const [chat, users] of Object.entries(stats)) {
    for (const [number, days] of Object.entries(users)) {
      for (const day of Object.keys(days)) if (day < oldest) delete days[day]
      if (!Object.keys(days).length) delete users[number]
    }
    if (!Object.keys(users).length) delete stats[chat]
  }
}

const flush = () => {
  clearTimeout(timer)
  timer = null
  prune()
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify(stats))
  renameSync(temp, file)
}

const schedule = () => {
  if (timer) return
  timer = setTimeout(() => {
    try {
      flush()
    } catch {
      timer = null
    }
  }, saveDelayMs)
  timer.unref?.()
}

process.on('exit', () => {
  if (!timer) return
  try {
    flush()
  } catch {}
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => process.exit(0))
}

export const record = (chat, numbers, isCommand) => {
  const day = dayKey()
  const users = (stats[chat] ??= {})

  for (const number of new Set(numbers)) {
    if (!number) continue
    const days = (users[number] ??= {})
    const entry = (days[day] ??= [0, 0])
    entry[0] += 1
    if (isCommand) entry[1] += 1
  }

  schedule()
}

export const history = (chat, numbers, since) => {
  const users = stats[chat]
  if (!users) return []

  const merged = new Map()

  for (const number of numbers) {
    for (const [day, [msgs, cmds]] of Object.entries(users[number] ?? {})) {
      if (day < since) continue
      const current = merged.get(day) ?? [0, 0]
      merged.set(day, [Math.max(current[0], msgs), Math.max(current[1], cmds)])
    }
  }

  return [...merged.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
}
