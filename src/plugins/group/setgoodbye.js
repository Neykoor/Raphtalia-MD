import { runSetText } from '../../utils/greetings.js'

export default {
  name: 'setgoodbye',
  aliases: ['setdespedida', 'setgoodbyedesc', 'setbye'],
  description: 'Cambia el texto de la despedida',
  groupOnly: true,
  adminOnly: true,
  run: ctx => runSetText(ctx, 'goodbye')
}
