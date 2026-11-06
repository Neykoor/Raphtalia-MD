import { setGroupOpen } from '../../utils/admin.js'

export default {
  name: 'close',
  aliases: ['cerrar', 'closegroup', 'cerrargrupo'],
  description: 'Cierra el grupo, solo los admins pueden escribir',
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  run: ctx => setGroupOpen(ctx, false)
}
