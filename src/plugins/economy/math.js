import { economyGate, getChatUser, setChatUser } from '../../utils/economy.js'

global.math = global.math || {}

const limits = { facil: 10, medio: 50, dificil: 90, imposible: 100, imposible2: 160 }
const rewardRanges = { facil: [500, 1000], medio: [1000, 2000], dificil: [2000, 3500], imposible: [3500, 4800], imposible2: [5000, 6500] }

const generateRandomNumber = max => Math.floor(Math.random() * max) + 1
const getOperation = () => ['+', '-', '*', '/'][Math.floor(Math.random() * 4)]

const generarProblema = dificultad => {
  const maxLimit = limits[dificultad] || 30
  const num1 = generateRandomNumber(maxLimit)
  const num2 = generateRandomNumber(maxLimit)
  const operador = getOperation()
  const resultado = eval(`${num1} ${operador} ${num2}`)
  const simbolo = operador === '*' ? '×' : operador === '/' ? '÷' : operador
  return { problema: `${num1} ${simbolo} ${num2}`, resultado }
}

export default {
  name: 'math',
  aliases: ['mates'],
  description: 'Iniciar un juego de matemáticas.',
  all: async ctx => {
    const chatId = ctx.chat
    const juego = global.math[chatId]
    if (!juego?.juegoActivo) return
    const respuestaUsuario = parseFloat(ctx.body?.trim())
    if (isNaN(respuestaUsuario)) return
    const user = getChatUser(chatId, ctx.senderNumber)
    const respuestaCorrecta = parseFloat(juego.respuesta)
    if (respuestaUsuario === respuestaCorrecta) {
      const [min, max] = rewardRanges[juego.dificultad] || [500, 1000]
      const coinsAleatorio = Math.floor(Math.random() * (max - min + 1)) + min
      setChatUser(chatId, ctx.senderNumber, 'coins', (user.coins || 0) + coinsAleatorio)
      clearTimeout(juego.tiempoLimite)
      delete global.math[chatId]
      await ctx.reply(`「❀」Respuesta correcta.\n> *Ganaste ›* ¥${coinsAleatorio.toLocaleString()}`)
    } else {
      juego.intentos += 1
      if (juego.intentos >= 3) {
        clearTimeout(juego.tiempoLimite)
        delete global.math[chatId]
        await ctx.reply('「✎」Te quedaste sin intentos. Suerte a la próxima.')
      } else {
        await ctx.reply(`「✎」Respuesta incorrecta, te quedan ${3 - juego.intentos} intentos.`)
      }
    }
  },
  run: async ctx => {
    if (!(await economyGate(ctx))) return
    const chatId = ctx.chat
    if (global.math[chatId]?.juegoActivo) {
      return ctx.reply('ꕥ Ya hay un juego activo. Espera a que termine.')
    }
    const dificultad = ctx.args[0]?.toLowerCase()
    if (!limits[dificultad]) {
      return ctx.reply('「✎」Especifica una dificultad válida: *facil, medio, dificil, imposible, imposible2*')
    }
    const { problema, resultado } = generarProblema(dificultad)
    const problemMessage = await ctx.reply(`「✩」Tienes 1 minuto para resolver:\n\n> ✩ *${problema}*\n\n_✐ Responde con el número correcto!_`)
    global.math[chatId] = {
      juegoActivo: true,
      problema,
      respuesta: resultado.toString(),
      intentos: 0,
      dificultad,
      timeout: Date.now() + 60000,
      problemMessageId: problemMessage.key?.id,
      tiempoLimite: setTimeout(() => {
        if (global.math[chatId]?.juegoActivo) {
          delete global.math[chatId]
          ctx.reply(`「✿」Tiempo agotado. La respuesta era *${resultado}*.`)
        }
      }, 60000)
    }
  }
}
