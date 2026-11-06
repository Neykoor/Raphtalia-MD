import config from '../../../config.js'
import { registry } from '../../core/loader.js'
import { touch } from '../../utils/activity.js'
import { makeCache } from '../../utils/cache.js'
import { jidNumber } from '../../utils/jid.js'
import { record } from '../../utils/stats.js'

const counted = makeCache(5000, 600000)

const isCommand = body => {
  const text = body.trimStart()
  const prefix = config.prefixes.find(candidate => text.startsWith(candidate))
  if (!prefix) return false

  const name = text.slice(prefix.length).trim().split(/\s+/)[0]
  return Boolean(name) && registry.commands.has(name.toLowerCase())
}

export default {
  all: async ctx => {
    if (!ctx.isGroup) return

    const numbers = ctx.senderIds.map(jidNumber)
    touch(ctx.chat, numbers)

    if (ctx.content.reactionMessage) return
    if (ctx.fromMe && !ctx.sock.isJadibot) return

    const key = `${ctx.chat}|${ctx.id}`
    if (counted.get(key)) return
    counted.set(key, true)

    record(ctx.chat, numbers, ctx.body ? isCommand(ctx.body) : false)
  }
}
