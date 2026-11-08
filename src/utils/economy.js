import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../../config.js'
import { jidNumber } from './jid.js'
import { getUser as getProfile, targetRaw } from './profiles.js'
import { isEnabled } from './settings.js'

const file = fileURLToPath(new URL('../../data/economy.json', import.meta.url))
const saveDelayMs = 5000

const cooldownFields = [
  'lastwork',
  'lastslut',
  'lastcrime',
  'lastmine',
  'lastinvoke',
  'lastfish',
  'lasthunt',
  'lastdungeon',
  'lastadventure',
  'laststeal',
  'lastdaily',
  'lastweekly',
  'lastmonthly',
  'lastcoffer',
  'lastslot',
  'lastroulette',
  'lastppt',
  'lastcoinflip',
  'lastApuesta'
]

const blankWallet = () => ({
  coins: 0,
  bank: 0,
  health: 100,
  stamina: 100,
  magic: 100,
  lastCmd: 0,
  inventory: {},
  weapons: {},
  tools: {},
  ...Object.fromEntries(cooldownFields.map(field => [field, 0]))
})

const blankGlobal = () => ({
  streak: 0,
  lastDailyGlobal: 0,
  weeklyStreak: 0,
  lastWeeklyGlobal: 0,
  monthlyStreak: 0,
  lastMonthlyGlobal: 0
})

const load = () => {
  try {
    if (!existsSync(file)) return { chats: {}, users: {} }
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return {
      chats: parsed?.chats && typeof parsed.chats === 'object' ? parsed.chats : {},
      users: parsed?.users && typeof parsed.users === 'object' ? parsed.users : {}
    }
  } catch {
    return { chats: {}, users: {} }
  }
}

const data = load()
let timer = null

const flush = () => {
  clearTimeout(timer)
  timer = null
  mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  writeFileSync(temp, JSON.stringify(data))
  renameSync(temp, file)
}

const schedule = () => {
  if (timer) return
  timer = setTimeout(() => {
    try {
      flush()
    } catch {
      timer = null
    }
  }, saveDelayMs)
  timer.unref?.()
}

process.on('exit', () => {
  if (!timer) return
  try {
    flush()
  } catch {}
})

const walletOf = (chat, number) => {
  data.chats[chat] ??= {}
  const current = data.chats[chat][number]
  if (!current) {
    data.chats[chat][number] = blankWallet()
    schedule()
    return data.chats[chat][number]
  }
  for (const [field, value] of Object.entries(blankWallet())) {
    if (current[field] === undefined) current[field] = value
  }
  return current
}

const globalOf = number => {
  const current = data.users[number]
  if (!current) {
    data.users[number] = blankGlobal()
    schedule()
    return data.users[number]
  }
  for (const [field, value] of Object.entries(blankGlobal())) {
    if (current[field] === undefined) current[field] = value
  }
  return current
}

export const currency = config.currency || 'Yenes'

export const getChatUser = (chat, number) => structuredClone(walletOf(chat, number))

export const setChatUser = (chat, number, field, value) => {
  walletOf(chat, number)[field] = structuredClone(value)
  schedule()
}

export const getChatUsers = chat =>
  Object.keys(data.chats[chat] ?? {}).map(number => ({ number, ...structuredClone(walletOf(chat, number)) }))

export const getGlobal = number => structuredClone(globalOf(number))

export const setGlobal = (number, field, value) => {
  globalOf(number)[field] = value
  schedule()
}

export const touch = (chat, number) => {
  walletOf(chat, number).lastCmd = Date.now()
  schedule()
}

export const nameOf = number => getProfile(number)?.name || number

export const pickTarget = async ctx => {
  const raw = targetRaw(ctx)
  if (!raw) return null
  const jid = await ctx.resolve(raw)
  return { jid, number: jidNumber(jid) }
}

export const economyGate = async ctx => {
  if (isEnabled(ctx.chat, 'economy')) return true
  await ctx.reply(
    `ꕥ Los comandos de *Economía* están desactivados en este grupo.\n\nUn *administrador* puede activarlos con el comando:\n» *${ctx.prefix}on economy*`
  )
  return false
}
