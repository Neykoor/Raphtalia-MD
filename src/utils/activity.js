import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const file = fileURLToPath(new URL('../../data/activity.json', import.meta.url))
const saveDelayMs = 30000

const load = () => {
  const map = new Map()

  try {
    if (!existsSync(file)) return map
    const data = JSON.parse(readFileSync(file, 'utf8'))

    for (const [chat, users] of Object.entries(data && typeof data === 'object' ? data : {})) {
      map.set(chat, new Map(Object.entries(users && typeof users === 'object' ? users : {})))
    }
  } catch {
    return map
  }

  return map
}

const activity = load()
let timer = null

const flush = () => {
  clearTimeout(timer)
  timer = null
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  const data = Object.fromEntries([...activity.entries()].map(([chat, users]) => [chat, Object.fromEntries(users)]))
  writeFileSync(temp, JSON.stringify(data))
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

export const touch = (chat, numbers, at = Date.now()) => {
  let users = activity.get(chat)

  if (!users) {
    users = new Map()
    activity.set(chat, users)
  }

  for (const number of numbers) if (number) users.set(number, at)
  schedule()
}

export const lastSeen = (chat, numbers) => {
  const users = activity.get(chat)
  if (!users) return 0
  return Math.max(0, ...numbers.map(number => Number(users.get(number)) || 0))
}

export const forget = (chat, numbers) => {
  const users = activity.get(chat)
  if (!users) return
  for (const number of numbers) users.delete(number)
  schedule()
}
