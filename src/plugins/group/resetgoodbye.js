import { runReset } from '../../utils/greetings.js'

export default {
  name: 'resetgoodbye',
  aliases: ['delgoodbye', 'resetdespedida', 'deldespedida'],
  description: 'Restablece la despedida (texto, imagen o todo)',
  groupOnly: true,
  adminOnly: true,
  run: ctx => runReset(ctx, 'goodbye')
}
