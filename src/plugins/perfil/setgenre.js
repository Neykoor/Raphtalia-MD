import { box, ensureUser, normalizeText, setField } from '../../utils/profiles.js'

const GENRES = ['Hombre', 'Mujer', 'Femboy', 'Transgénero', 'Gay', 'Lesbiana', 'No Binario', 'Pansexual', 'Bisexual', 'Asexual', 'Therian']

export default {
  name: 'setgenre',
  description: 'Establece tu género',
  run: async ctx => {
    const input = normalizeText(ctx.text)

    if (!input) {
      return ctx.reply(
        box('Falta el género', [`Ejemplo: ${ctx.prefix}${ctx.command} mujer ✿`, ...GENRES.map((genre, index) => `${index + 1}. ${genre}`)])
      )
    }

    const genre = /^\d+$/.test(input) ? GENRES[Number(input) - 1] : GENRES.find(item => normalizeText(item) === input)

    if (!genre) {
      return ctx.reply(box('Género inválido', ['Elige uno de la lista ✗', ...GENRES.map((item, index) => `${index + 1}. ${item}`)]))
    }

    ensureUser(ctx.senderNumber, ctx.pushName)
    setField(ctx.senderNumber, 'genre', genre)
    await ctx.reply(box('Género guardado', [`Tu género ahora es: ${genre} ❀`]))
  }
}
