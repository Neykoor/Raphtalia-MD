import { runSetMedia } from '../../utils/greetings.js'

export default {
  name: 'setwelcomeimg',
  aliases: ['setwelcomegif', 'setwelcomemedia', 'setbienvenidaimg'],
  description: 'Cambia la imagen o GIF de la bienvenida',
  groupOnly: true,
  adminOnly: true,
  run: ctx => runSetMedia(ctx, 'welcome')
}
