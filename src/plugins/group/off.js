import { switchFeature } from '../../utils/settings.js'

export default {
  name: 'off',
  aliases: ['desactivar', 'disable'],
  description: 'Desactiva una función del grupo (ejemplo: off welcome)',
  groupOnly: true,
  adminOnly: true,
  run: ctx => switchFeature(ctx, false)
}
