import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const file = fileURLToPath(new URL('../../data/botstate.json', import.meta.url))

const load = () => {
  try {
    if (!existsSync(file)) return new Set()
    const data = JSON.parse(readFileSync(file, 'utf8'))
    return new Set(Array.isArray(data.disabled) ? data.disabled : [])
  } catch {
    return new Set()
  }
}

const disabled = load()

const save = () => {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify({ disabled: [...disabled] }, null, 2))
  renameSync(temp, file)
}

export const isBotOff = (bot, jid) => disabled.has(`${bot}|${jid}`)

export const setBotOff = (bot, jid, off) => {
  if (off) disabled.add(`${bot}|${jid}`)
  else disabled.delete(`${bot}|${jid}`)
  save()
}
