import { search } from '../../utils/nsfw.js'

export default search({
  name: 'rule34',
  aliases: ['r34', 'rule'],
  description: 'Busca imágenes +18 por personaje o tags (ejemplo: r34 raphtalia)',
  names: ['danbooru', 'xbooru', 'konachan', 'yandere', 'paheal'],
  smart: true
})
