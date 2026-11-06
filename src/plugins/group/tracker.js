import { touch } from '../../utils/activity.js'
import { jidNumber } from '../../utils/jid.js'

export default {
  all: async ctx => {
    if (!ctx.isGroup) return
    touch(ctx.chat, ctx.senderIds.map(jidNumber))
  }
}
