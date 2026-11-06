import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { main, subs } from './bots.js'
import { jidNumber } from './jid.js'

const file = fileURLToPath(new URL('../../data/primary.json', import.meta.url))

const load = () => {
  try {
    if (!existsSync(file)) return new Map()
    const data = JSON.parse(readFileSync(file, 'utf8'))
    return new Map(Object.entries(data && typeof data === 'object' ? data : {}))
  } catch {
    return new Map()
  }
}

const primaries = load()

const save = () => {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify(Object.fromEntries(primaries), null, 2))
  renameSync(temp, file)
}

export const getPrimary = chat => primaries.get(chat) ?? null

export const setPrimary = (chat, number) => {
  primaries.set(chat, number)
  save()
}

export const clearPrimary = chat => {
  const had = primaries.delete(chat)
  if (had) save()
  return had
}

export const botsOnline = () =>
  [main.sock, ...[...subs.values()].filter(sub => sub.online).map(sub => sub.sock)].filter(sock => sock?.user?.id)

export const primaryAlive = number => botsOnline().some(sock => jidNumber(sock.user.id) === number)
