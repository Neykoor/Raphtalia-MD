import config from '../../../config.js'
import { registry } from '../../core/loader.js'
import { makeCache } from '../../utils/cache.js'
import { addActivity } from '../../utils/profiles.js'

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
    if (!ctx.body || !ctx.senderNumber || !isCommand(ctx.body)) return

    const key = `${ctx.chat}|${ctx.id}`
    if (counted.get(key)) return
    counted.set(key, true)

    addActivity(ctx.senderNumber, ctx.pushName, Math.floor(Math.random() * 100))
  }
}
