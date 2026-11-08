import { box, ensureUser, normalizeText, setField } from '../../utils/profiles.js'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

const formatter = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC'
})

const monthIndex = word => {
  const clean = normalizeText(word)
  if (clean === 'sept') return 8
  const full = MONTHS.indexOf(clean)
  if (full !== -1) return full
  return clean.length === 3 ? MONTHS.findIndex(month => month.startsWith(clean)) : -1
}

const parse = (input, currentYear) => {
  const text = input.trim().replace(/\s+/g, ' ')
  const numeric = text.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}))?$/)
  const named = text.match(/^(\d{1,2}) (?:de )?([^\d\s]+?)\.?(?: (?:de )?(\d{4}))?$/i)

  let day
  let month
  let year

  if (numeric) {
    day = Number(numeric[1])
    month = Number(numeric[2]) - 1
    year = numeric[3] ? Number(numeric[3]) : null
  } else if (named) {
    day = Number(named[1])
    month = monthIndex(named[2])
    year = named[3] ? Number(named[3]) : null
  } else {
    return { error: 'invalid' }
  }

  if (month < 0 || month > 11) return { error: 'invalid' }
  if (year && year > currentYear) return { error: 'future' }
  if (year && currentYear - year > 120) return { error: 'old' }

  const finalYear = year ?? currentYear
  const date = new Date(Date.UTC(finalYear, month, day))

  if (date.getUTCFullYear() !== finalYear || date.getUTCMonth() !== month || date.getUTCDate() !== day) {
    return { error: 'invalid' }
  }

  return { value: formatter.format(date) }
}

export default {
  name: 'setbirth',
  aliases: ['setcumple'],
  description: 'Establece tu fecha de cumpleaños',
  run: async ctx => {
    const input = ctx.text.trim()
    const year = new Date().getFullYear()

    if (!input) {
      return ctx.reply(
        box('Falta la fecha', [
          'Escribe tu cumpleaños en día/mes/año ✿',
          `Ejemplo: ${ctx.prefix}${ctx.command} 01/01/2000 ❀`,
          `Ejemplo: ${ctx.prefix}${ctx.command} 01/01 ♡`
        ])
      )
    }

    const result = parse(input, year)

    if (result.error === 'future') {
      return ctx.reply(box('Fecha inválida', [`El año no puede ser mayor a ${year} ✗`]))
    }

    if (result.error) {
      return ctx.reply(box('Fecha inválida', [`Usa el formato: ${ctx.prefix}${ctx.command} 01/01/2000 ✗`]))
    }

    ensureUser(ctx.senderNumber, ctx.pushName)
    setField(ctx.senderNumber, 'birth', result.value)
    await ctx.reply(box('Cumpleaños guardado', [`${result.value} ❀`]))
  }
}
