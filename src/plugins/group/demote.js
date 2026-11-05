import { setAdmin } from '../../utils/admin.js'

export default {
  name: 'demote',
  aliases: ['quitaradmin', 'degradar'],
  description: 'Quita administrador al usuario mencionado',
  adminOnly: true,
  botAdmin: true,
  run: ctx => setAdmin(ctx, 'demote')
}
