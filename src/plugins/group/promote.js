import { setAdmin } from '../../utils/admin.js'

export default {
  name: 'promote',
  aliases: ['daradmin', 'promover'],
  description: 'Da administrador al usuario mencionado',
  adminOnly: true,
  botAdmin: true,
  run: ctx => setAdmin(ctx, 'promote')
}
