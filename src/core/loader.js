import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import log from '../utils/logger.js'

const pluginsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugins')

export const registry = {
  commands: new Map(),
  list: [],
  listeners: []
}

const categoryOf = file => {
  const folder = dirname(file)
  return folder === '.' ? 'general' : folder.split(/[\\/]/)[0]
}

export const loadPlugins = async () => {
  const files = readdirSync(pluginsDir, { recursive: true })
    .filter(file => file.endsWith('.js'))
    .sort()
  const commands = new Map()
  const list = []
  const listeners = []
  const stamp = Date.now()

  for (const file of files) {
    try {
      const url = `${pathToFileURL(join(pluginsDir, file)).href}?v=${stamp}`
      const plugin = (await import(url)).default
      if (!plugin || typeof plugin !== 'object') continue

      const entry = { category: categoryOf(file), ...plugin, file }

      if (typeof entry.all === 'function') listeners.push(entry)

      if (entry.name && typeof entry.run === 'function') {
        list.push(entry)
        for (const alias of [entry.name, ...(entry.aliases ?? [])]) {
          const key = alias.toLowerCase()
          if (commands.has(key)) log.warn(`Comando duplicado: ${key} (${file})`)
          commands.set(key, entry)
        }
      }
    } catch (error) {
      log.error(`No se pudo cargar el plugin ${file}:`, error?.message ?? error)
    }
  }

  registry.commands = commands
  registry.list = list
  registry.listeners = listeners

  return { files: files.length, commands: list.length }
}
