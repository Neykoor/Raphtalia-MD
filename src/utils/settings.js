import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeJid } from './jid.js'

const file = fileURLToPath(new URL('../../data/settings.json', import.meta.url))

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

export const features = {
  welcome: {
    label: 'Bienvenidas y despedidas',
    aliases: ['welcome', 'bienvenida', 'bienvenidas', 'despedida', 'despedidas', 'goodbye', 'bye']
  },
  antilink: {
    label: 'Antilink de grupos y canales',
    aliases: ['antilink', 'antilinks', 'antienlace', 'antienlaces'],
    needsAdmin: true
  }
}

const load = () => {
  try {
    if (!existsSync(file)) return {}
    const data = JSON.parse(readFileSync(file, 'utf8'))
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

const settings = load()

const save = () => {
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify(settings, null, 2))
  renameSync(temp, file)
}

export const isEnabled = (chat, feature) => settings[chat]?.[feature] === true

export const setEnabled = (chat, feature, enabled) => {
  if (enabled) {
    settings[chat] = { ...settings[chat], [feature]: true }
  } else if (settings[chat]) {
    delete settings[chat][feature]
    if (!Object.keys(settings[chat]).length) delete settings[chat]
  }

  save()
}

export const resolveFeature = name => {
  const value = String(name || '').toLowerCase()
  return Object.keys(features).find(key => features[key].aliases.includes(value)) ?? null
}

const botIsAdmin = async ctx => {
  const group = await ctx.getGroup()
  const ids = new Set([normalizeJid(ctx.sock.user?.id), normalizeJid(ctx.sock.user?.lid)].filter(Boolean))

  return Boolean(
    group?.participants.some(
      item =>
        (item.admin || item.isAdmin || item.isSuperAdmin) &&
        [item.id, item.lid, item.phoneNumber].some(id => id && ids.has(normalizeJid(id)))
    )
  )
}

export const switchFeature = async (ctx, enabled) => {
  const name = (ctx.args[0] || '').toLowerCase()
  const on = `${ctx.prefix}on`
  const off = `${ctx.prefix}off`

  if (!name) {
    const states = Object.entries(features).map(
      ([key, item]) => `${key}: ${isEnabled(ctx.chat, key) ? 'activado ✓' : 'desactivado ✗'} ❀ ${item.label}`
    )
    return ctx.reply(box('Funciones del grupo', [...states, `Activar: ${on} welcome ✿`, `Desactivar: ${off} welcome ✿`]))
  }

  const key = resolveFeature(name)

  if (!key) {
    return ctx.reply(box('Opción inválida', [`No existe "${name}" ✗`, `Opciones: ${Object.keys(features).join(', ')} ✿`]))
  }

  const { label } = features[key]

  if (isEnabled(ctx.chat, key) === enabled) {
    return ctx.reply(box('Sin cambios', [`Función: ${label} ❀`, `Ya estaba ${enabled ? 'activada' : 'desactivada'} ✿`]))
  }

  setEnabled(ctx.chat, key, enabled)

  const lines = [`Función: ${label} ❀`, `Estado: ${enabled ? 'activado ✓' : 'desactivado ✗'}`]

  if (enabled && features[key].needsAdmin && !(await botIsAdmin(ctx))) {
    lines.push('Necesito ser administrador para que funcione ✗')
  }

  lines.push('Hecho ♡')

  await ctx.reply(box(enabled ? 'Función activada' : 'Función desactivada', lines))
}
