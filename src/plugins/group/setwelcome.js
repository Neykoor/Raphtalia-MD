import { runSetText } from '../../utils/greetings.js'

export default {
  name: 'setwelcome',
  aliases: ['setbienvenida', 'setwelcomedesc'],
  description: 'Cambia el texto de la bienvenida',
  groupOnly: true,
  adminOnly: true,
  run: ctx => runSetText(ctx, 'welcome')
}
