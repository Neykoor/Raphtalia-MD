import config from '../../../config.js'
import { touch } from '../../utils/economy.js'

export default {
  all: async ctx => {
    const body = ctx.body?.trimStart()
    if (!body || !config.prefixes.some(prefix => body.startsWith(prefix))) return
    touch(ctx.chat, ctx.senderNumber)
  }
}
