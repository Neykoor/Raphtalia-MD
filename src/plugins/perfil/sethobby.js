import { box, ensureUser, normalizeText, setField } from '../../utils/profiles.js'

const HOBBIES = [
  '📚 Leer', '✍️ Escribir', '🎤 Cantar', '💃 Bailar', '🎮 Jugar',
  '🎨 Dibujar', '🍳 Cocinar', '✈️ Viajar', '🏊 Nadar', '📸 Fotografía',
  '🎧 Escuchar música', '🏀 Deportes', '🎬 Ver películas', '🌿 Jardinería',
  '🧵 Manualidades', '🎲 Juegos de mesa', '🏋️‍♂️ Gimnasio', '🚴 Ciclismo',
  '🎯 Tiro con arco', '🍵 Ceremonia del té', '🧘‍♂️ Meditación', '🎪 Malabares',
  '🛠️ Bricolaje', '🎹 Tocar instrumentos', '🐶 Cuidar mascotas', '🌌 Astronomía',
  '♟️ Ajedrez', '🍷 Catación de vinos', '🛍️ Compras', '🏕️ Acampar',
  '🎣 Pescar', '📱 Tecnología', '🎭 Teatro', '🍽️ Gastronomía', '🏺 Coleccionar',
  '✂️ Costura', '🧁 Repostería', '📝 Blogging', '🚗 Automóviles', '🧩 Rompecabezas',
  '🎳 Bolos', '🏄 Surf', '⛷️ Esquí', '🎿 Snowboard', '🤿 Buceo', '🏹 Tiro al blanco',
  '🧭 Orientación', '🏇 Equitación', '🎨 Pintura', '📊 Invertir', '🌡️ Meteorología',
  '🔍 Investigar', '💄 Maquillaje', '💇‍♂️ Peluquería', '🛌 Dormir', '🍺 Cervecería',
  '🪓 Carpintería', '🧪 Experimentos', '📻 Radioafición', '🗺️ Geografía', '💎 Joyería',
  'Otro 🌟'
]

const findHobby = input => {
  const clean = normalizeText(input)
  if (!clean) return null

  const entries = HOBBIES.map(hobby => ({ hobby, clean: normalizeText(hobby) }))
  return (
    entries.find(item => item.clean === clean) ||
    entries.find(item => item.clean.startsWith(clean)) ||
    entries.find(item => item.clean.includes(clean))
  )?.hobby
}

export default {
  name: 'sethobby',
  aliases: ['setpasatiempo'],
  description: 'Establece tu pasatiempo',
  run: async ctx => {
    const input = ctx.text.trim()

    if (!input) {
      return ctx.reply(
        box('Elige un pasatiempo', [
          ...HOBBIES.map((hobby, index) => `${index + 1}) ${hobby}`),
          `Ejemplo: ${ctx.prefix}${ctx.command} 1 ✿`,
          `Ejemplo: ${ctx.prefix}${ctx.command} Leer ❀`
        ])
      )
    }

    let hobby

    if (/^\d+$/.test(input)) {
      hobby = HOBBIES[Number(input) - 1]
      if (!hobby) {
        return ctx.reply(box('Número inválido', [`Elige un número entre 1 y ${HOBBIES.length} ✗`]))
      }
    } else {
      hobby = findHobby(input)
      if (!hobby) {
        return ctx.reply(box('No encontrado', [`Usa ${ctx.prefix}${ctx.command} sin texto para ver la lista ✗`]))
      }
    }

    const user = ensureUser(ctx.senderNumber, ctx.pushName)

    if (user.hobby === hobby) {
      return ctx.reply(box('Sin cambios', [`Ya tienes este pasatiempo: ${hobby} ✗`]))
    }

    setField(ctx.senderNumber, 'hobby', hobby)
    await ctx.reply(box('Pasatiempo guardado', [`${hobby} ❀`]))
  }
}
