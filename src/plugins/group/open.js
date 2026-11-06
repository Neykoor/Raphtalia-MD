import { setGroupOpen } from '../../utils/admin.js'

export default {
  name: 'open',
  aliases: ['abrir', 'opengroup', 'abrirgrupo'],
  description: 'Abre el grupo, todos pueden escribir',
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  run: ctx => setGroupOpen(ctx, true)
}
