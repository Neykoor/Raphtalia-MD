export const panel = (title, rows) =>
  [
    `┏━━ ✦ *${title}* ✦`,
    ...rows.map(row => (Array.isArray(row) ? `┃ ❖ *${row[0]}* › ${row[1]}` : `┃ ${row}`)),
    `┗${'━'.repeat(18)}`
  ].join('\n')

export const list = (title, rows) => [`╭─ ❀ *${title}*`, ...rows.map(row => `│ ➤ ${row}`), `╰${'─'.repeat(18)}`].join('\n')

export const note = text => `╰➤ _${text}_`

export const bytes = value => {
  const gb = 1024 ** 3
  return value >= gb ? `${(value / gb).toFixed(2)} GB` : `${(value / 1048576).toFixed(2)} MB`
}

export const duration = ms => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${seconds}s`].filter(Boolean).join(' ')
}

export const compact = value => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
  return String(value)
}
