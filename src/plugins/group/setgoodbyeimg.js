import { runSetMedia } from '../../utils/greetings.js'

export default {
  name: 'setgoodbyeimg',
  aliases: ['setgoodbyegif', 'setgoodbyemedia', 'setdespedidaimg'],
  description: 'Cambia la imagen o GIF de la despedida',
  groupOnly: true,
  adminOnly: true,
  run: ctx => runSetMedia(ctx, 'goodbye')
}
