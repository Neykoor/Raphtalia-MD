import { kickMember } from '../../utils/admin.js'

export default {
  name: 'kick',
  aliases: ['expulsar', 'sacar', 'echar'],
  description: 'Expulsa al usuario mencionado del grupo',
  adminOnly: true,
  botAdmin: true,
  run: ctx => kickMember(ctx)
}
