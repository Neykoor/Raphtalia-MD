import { switchFeature } from '../../utils/settings.js'

export default {
  name: 'on',
  aliases: ['activar', 'enable'],
  description: 'Activa una función del grupo (ejemplo: on welcome)',
  groupOnly: true,
  adminOnly: true,
  run: ctx => switchFeature(ctx, true)
}
