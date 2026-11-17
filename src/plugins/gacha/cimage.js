import { sendAlbum } from '../../utils/downloads.js'
import * as gacha from '../../utils/gacha.js'
import * as yandere from '../../utils/yandere.js'

const DEFAULT_COUNT = 1
const MAX_COUNT = 10

const collectPosts = async (tag, count) => {
  const posts = new Map()
  for (let i = 0; i < count * 4 && posts.size < count; i++) {
    const post = await yandere.getRandomPost(tag)
    if (post?.url && !posts.has(post.id)) posts.set(post.id, post)
  }
  return [...posts.values()]
}

export default gacha.define({
  name: 'cimage',
  aliases: ['cimg', 'charimage', 'waifuimage', 'wimage'],
  description: 'Muestra imágenes de un personaje del gacha.',
  run: async ctx => {
    const { args, prefix, command } = ctx
    const last = args[args.length - 1]
    const hasCount = args.length > 1 && /^\d{1,2}$/.test(last)
    const count = hasCount ? Math.min(Math.max(parseInt(last, 10), 1), MAX_COUNT) : DEFAULT_COUNT
    const query = (hasCount ? args.slice(0, -1) : args).join(' ')
    if (!query) {
      return ctx.reply(
        `❀ Por favor, proporciona el nombre de un personaje.\n> Ejemplo » *${prefix}${command} Rem*\n> Con cantidad » *${prefix}${command} Rem 3*`
      )
    }

    const character = gacha.findCharacterByQuery(query)
    if (!character) return ctx.reply(`ꕥ No se encontró el personaje *${query}*.`)

    gacha.react(ctx, '🕒')
    const posts = await collectPosts(character.tag, count)
    if (!posts.length) {
      gacha.react(ctx, '✖️')
      return ctx.reply(`✐ No se encontraron imágenes para *${character.name}*, intenta de nuevo.`)
    }

    const items = posts.map((post, index) => ({
      type: 'image',
      data: { url: post.url },
      caption:
        index === 0
          ? `✿ Nombre » *${character.name}*\n❖ Serie » *${character.series}*\n✦ ID » \`${character.id}\`\n❏ Imágenes » *${posts.length}*`
          : ''
    }))

    if (items.length === 1) await ctx.reply({ image: items[0].data, caption: items[0].caption })
    else await sendAlbum(ctx, items)
    gacha.react(ctx, '🌸')
  }
})
