import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const file = fileURLToPath(new URL('../../data/stickers.json', import.meta.url))

const load = () => {
  try {
    if (!existsSync(file)) return {}
    const data = JSON.parse(readFileSync(file, 'utf8'))
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

const users = load()

const save = () => {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify(users, null, 2))
  renameSync(temp, file)
}

export const getStickerInfo = number => users[number] ?? null

export const setStickerInfo = (number, pack, author) => {
  users[number] = { pack, author }
  save()
}

export const clearStickerInfo = number => {
  if (!users[number]) return false
  delete users[number]
  save()
  return true
}
