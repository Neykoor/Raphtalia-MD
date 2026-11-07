import { runReset } from '../../utils/greetings.js'

export default {
  name: 'resetwelcome',
  aliases: ['delwelcome', 'resetbienvenida', 'delbienvenida'],
  description: 'Restablece la bienvenida (texto, imagen o todo)',
  groupOnly: true,
  adminOnly: true,
  run: ctx => runReset(ctx, 'welcome')
}
