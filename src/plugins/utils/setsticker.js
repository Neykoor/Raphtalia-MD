import { clearStickerInfo, getStickerInfo, setStickerInfo } from '../../utils/stickerinfo.js'

const box = (title, lines) => [`₊˚✧ *${title}* ✧˚₊`, ...lines.map(line => `> ✧ ${line}`)].join('\n')

const MAX_NAME = 64

export default {
  name: 'setsticker',
  aliases: ['setwm', 'stickerinfo'],
  description: 'Guarda tu paquete y autor para tus stickers',
  run: async ctx => {
    const current = getStickerInfo(ctx.senderNumber)
    const text = ctx.text.trim()

    if (/^(reset|borrar|del|delete|quitar)$/i.test(text)) {
      const removed = clearStickerInfo(ctx.senderNumber)
      return ctx.reply(
        box(removed ? 'Datos eliminados' : 'Sin cambios', [
          removed ? 'Tus stickers volverán a usar los datos por defecto ✿' : 'No tenías datos guardados ✿',
          'Hecho ♡'
        ])
      )
    }

    if (!text) {
      return ctx.reply(
        box('Datos de tus stickers', [
          current ? `Paquete: ${current.pack} ❀` : 'No tienes datos guardados ✗',
          ...(current ? [`Autor: ${current.author} ✿`] : []),
          `Guardar: ${ctx.prefix}${ctx.command} Paquete | Autor ✧`,
          `Borrar: ${ctx.prefix}${ctx.command} reset ✧`
        ])
      )
    }

    const [packText, authorText] = text.split('|')
    const pack = (packText || '').trim().slice(0, MAX_NAME)
    const author = (authorText || '').trim().slice(0, MAX_NAME)

    if (!pack && !author) {
      return ctx.reply(box('Datos inválidos', [`Ejemplo: ${ctx.prefix}${ctx.command} Paquete | Autor ✿`]))
    }

    const saved = { pack: pack || current?.pack || '', author: author || current?.author || '' }
    setStickerInfo(ctx.senderNumber, saved.pack, saved.author)

    await ctx.reply(
      box('Datos guardados', [
        `Paquete: ${saved.pack || 'por defecto'} ❀`,
        `Autor: ${saved.author || 'por defecto'} ✿`,
        'Se usarán en todos tus stickers ♡'
      ])
    )
  }
}
