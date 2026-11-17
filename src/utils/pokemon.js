import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import config from '../../config.js'
import { getUser as getProfile } from './profiles.js'

const file = fileURLToPath(new URL('../../data/pokemon.json', import.meta.url))
const saveDelayMs = 3000
const API = 'https://pokeapi.co/api/v2'
const API_TIMEOUT_MS = 8000
const TRANSLATE_TIMEOUT_MS = 5000
const MAX_POKEDEX_ID = 1025
const READ_MORE = '‎'.repeat(4001)

export const SUMMON_COOLDOWN_MS = 10 * 60 * 1000
export const CATCH_WINDOW_MS = 45 * 1000
export const PITY_LIMIT = 25
export const MAX_LEVEL = 45
export const CURRENCY = config.currency || 'Yenes'

const SPAWN_KEEP_MS = 10 * 60 * 1000
const SECTIONS = ['users', 'spawns', 'owned', 'meta']

export const RARITIES = [
  { key: 'common', label: 'Común', rank: 0, weight: 1, statMul: 1, valueMul: 14 },
  { key: 'uncommon', label: 'Poco común', rank: 1, weight: 0.75, statMul: 1.1, valueMul: 20 },
  { key: 'rare', label: 'Rara', rank: 2, weight: 0.45, statMul: 1.2, valueMul: 25 },
  { key: 'epic', label: 'Épica', rank: 3, weight: 0.2, statMul: 1.35, valueMul: 34 },
  { key: 'legendary', label: 'Legendaria', rank: 4, weight: 0.07, statMul: 1.5, valueMul: 48 },
  { key: 'mythic', label: 'Mítica', rank: 5, weight: 0.04, statMul: 1.6, valueMul: 60 }
]

const EPIC_RANK = 3

const SCENES = {
  niebla: { appear: 'Salió de la niebla', vanish: 'se desvaneció en la niebla' },
  bosque: { appear: 'Salió de entre los árboles del bosque', vanish: 'se perdió entre los árboles' },
  pradera: { appear: 'Apareció en una pradera llena de flores', vanish: 'se escondió entre las flores' },
  cueva: { appear: 'Salió de lo profundo de una cueva', vanish: 'se internó en la oscuridad de la cueva' },
  lago: { appear: 'Emergió de las aguas de un lago', vanish: 'se sumergió en el lago' },
  costa: { appear: 'Salió de entre las olas de la costa', vanish: 'se lo llevó la marea' },
  volcan: { appear: 'Surgió entre las brasas de un volcán', vanish: 'se perdió entre el humo del volcán' },
  tormenta: { appear: 'Apareció entre los relámpagos de una tormenta', vanish: 'se esfumó con la tormenta' },
  ventisca: { appear: 'Salió de una ventisca helada', vanish: 'se perdió en la ventisca' },
  desierto: { appear: 'Emergió de las dunas del desierto', vanish: 'se enterró bajo las dunas' },
  montana: { appear: 'Bajó de lo alto de una montaña', vanish: 'trepó de vuelta a la montaña' },
  pantano: { appear: 'Salió de un pantano burbujeante', vanish: 'se hundió en el pantano' },
  cielo: { appear: 'Descendió desde las nubes', vanish: 'se elevó entre las nubes' },
  cementerio: { appear: 'Se materializó entre las sombras de un cementerio', vanish: 'se disolvió entre las sombras' },
  noche: { appear: 'Salió de las sombras bajo la luz de la luna', vanish: 'se fundió con la noche' },
  ruinas: { appear: 'Despertó entre unas ruinas antiguas', vanish: 'se ocultó entre las ruinas' },
  ciudad: { appear: 'Se asomó por un callejón de la ciudad', vanish: 'se escabulló por los callejones' }
}

const GENERAL_SCENES = ['niebla', 'bosque', 'pradera', 'cueva', 'ruinas', 'ciudad', 'noche', 'montana']

const TYPE_SCENES = {
  Normal: ['ciudad', 'pradera'],
  Fuego: ['volcan'],
  Agua: ['lago', 'costa'],
  Eléctrico: ['tormenta'],
  Planta: ['bosque', 'pradera'],
  Hielo: ['ventisca'],
  Lucha: ['montana'],
  Veneno: ['pantano'],
  Tierra: ['desierto', 'cueva'],
  Volador: ['cielo'],
  Psíquico: ['ruinas', 'noche'],
  Bicho: ['bosque', 'pradera'],
  Roca: ['cueva', 'montana'],
  Fantasma: ['cementerio'],
  Dragón: ['montana', 'cielo', 'tormenta'],
  Siniestro: ['noche', 'ciudad'],
  Acero: ['ciudad', 'montana'],
  Hada: ['pradera', 'noche']
}

const COOLDOWN_LINES = [
  'La niebla aún no se disipa.',
  'Los Pokémon siguen escondidos.',
  'Todo está en calma por ahora.',
  'Las huellas todavía están frescas.',
  'El ambiente está demasiado tranquilo.',
  'Nada se mueve en los alrededores.'
]

const TYPES_ES = {
  normal: 'Normal',
  fire: 'Fuego',
  water: 'Agua',
  electric: 'Eléctrico',
  grass: 'Planta',
  ice: 'Hielo',
  fighting: 'Lucha',
  poison: 'Veneno',
  ground: 'Tierra',
  flying: 'Volador',
  psychic: 'Psíquico',
  bug: 'Bicho',
  rock: 'Roca',
  ghost: 'Fantasma',
  dragon: 'Dragón',
  dark: 'Siniestro',
  steel: 'Acero',
  fairy: 'Hada'
}

let store = null
let timer = null

const load = () => {
  if (store) return store
  try {
    store = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {}
  } catch {
    store = {}
  }
  if (!store || typeof store !== 'object') store = {}
  for (const section of SECTIONS) {
    if (!store[section] || typeof store[section] !== 'object') store[section] = {}
  }
  if (!Number.isFinite(store.meta.nextId)) store.meta.nextId = 1
  return store
}

export const flush = () => {
  clearTimeout(timer)
  timer = null
  try {
    mkdirSync(dirname(file), { recursive: true })
    const temp = `${file}.tmp`
    writeFileSync(temp, JSON.stringify(load()))
    renameSync(temp, file)
  } catch (error) {
    console.error('No se pudo guardar pokemon.json:', error.message)
  }
}

const save = () => {
  if (timer) return
  timer = setTimeout(flush, saveDelayMs)
  timer.unref?.()
}

process.on('exit', () => {
  if (timer) flush()
})

export const formatTime = ms => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const parts = []
  if (h) parts.push(`${h} hora${h !== 1 ? 's' : ''}`)
  if (m) parts.push(`${m} minuto${m !== 1 ? 's' : ''}`)
  if (s || !parts.length) parts.push(`${s} segundo${s !== 1 ? 's' : ''}`)
  return parts.join(' ')
}

export const money = amount => `¥${Math.floor(Number(amount) || 0).toLocaleString('en-US')} ${CURRENCY}`

export const displayName = id => String(getProfile(id)?.name || '').trim() || String(id)

export const mentionJid = id => `${id}@s.whatsapp.net`

const pokeUser = id => {
  const { users } = load()
  if (!users[id]) users[id] = { lastSummon: 0, pity: 0 }
  return users[id]
}

export const checkSummonCooldown = id => {
  const ms = pokeUser(id).lastSummon + SUMMON_COOLDOWN_MS - Date.now()
  return { ready: ms <= 0, remainingMs: Math.max(ms, 0) }
}

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const randomItem = list => list[randomInt(0, list.length - 1)]

export const sceneOf = key => SCENES[key] || SCENES.niebla

export const cooldownLine = () => randomItem(COOLDOWN_LINES)

const pickScene = types => {
  const themed = types.flatMap(type => TYPE_SCENES[type] || [])
  return randomItem(themed.length && Math.random() < 0.65 ? themed : GENERAL_SCENES)
}

const fetchJson = async path => {
  const response = await fetch(`${API}/${path}`, { signal: AbortSignal.timeout(API_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`PokéAPI ${response.status}`)
  return response.json()
}

const speciesCache = new Map()
const pokemonCache = new Map()

const cleanText = text => String(text || '').replace(/[\n\f\r]+/g, ' ').replace(/\s+/g, ' ').trim()

const capitalize = text => String(text || '').charAt(0).toUpperCase() + String(text || '').slice(1)

const translators = [
  async text => {
    const response = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=${encodeURIComponent(text)}`,
      { signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS) }
    )
    if (!response.ok) throw new Error(`translate ${response.status}`)
    const data = await response.json()
    return (data?.[0] || []).map(part => part?.[0] || '').join('')
  },
  async text => {
    const response = await fetch(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|es`,
      { signal: AbortSignal.timeout(TRANSLATE_TIMEOUT_MS) }
    )
    if (!response.ok) throw new Error(`translate ${response.status}`)
    const data = await response.json()
    if (Number(data?.responseStatus) !== 200) return ''
    return data?.responseData?.translatedText || ''
  }
]

const translateToSpanish = async text => {
  for (const translate of translators) {
    try {
      const result = cleanText(await translate(text))
      if (result) return result
    } catch {
      continue
    }
  }
  return ''
}

const ensureFlavor = async species => {
  if (!species.flavor && species.flavorEn) species.flavor = await translateToSpanish(species.flavorEn)
  return species.flavor
}

const speciesRank = species => {
  if (species.mythical) return 5
  if (species.legendary) return 4
  if (species.captureRate >= 200) return 0
  if (species.captureRate >= 100) return 1
  if (species.captureRate >= 45) return 2
  return 3
}

const getSpecies = async id => {
  if (speciesCache.has(id)) return speciesCache.get(id)
  const data = await fetchJson(`pokemon-species/${id}`)
  const entries = data.flavor_text_entries || []
  const pick = lang => entries.filter(entry => entry.language?.name === lang).map(entry => cleanText(entry.flavor_text)).filter(Boolean)
  const spanish = pick('es')
  const english = pick('en')
  const nameEs = (data.names || []).find(entry => entry.language?.name === 'es')?.name
  const species = {
    id,
    name: nameEs || capitalize(data.name),
    captureRate: Number(data.capture_rate) || 255,
    legendary: Boolean(data.is_legendary),
    mythical: Boolean(data.is_mythical),
    flavor: spanish.length ? spanish[spanish.length - 1] : '',
    flavorEn: english.length ? english[english.length - 1] : ''
  }
  speciesCache.set(id, species)
  return species
}

const getPokemon = async id => {
  if (pokemonCache.has(id)) return pokemonCache.get(id)
  const data = await fetchJson(`pokemon/${id}`)
  const stat = name => Number(data.stats?.find(entry => entry.stat?.name === name)?.base_stat) || 1
  const pokemon = {
    id,
    types: (data.types || []).map(entry => TYPES_ES[entry.type?.name] || capitalize(entry.type?.name)),
    stats: { hp: stat('hp'), attack: stat('attack'), defense: stat('defense'), speed: stat('speed') },
    bst: (data.stats || []).reduce((sum, entry) => sum + (Number(entry.base_stat) || 0), 0),
    image: data.sprites?.other?.['official-artwork']?.front_default || data.sprites?.front_default || null
  }
  pokemonCache.set(id, pokemon)
  return pokemon
}

const pickSpecies = async minRank => {
  let fallback = null
  for (let attempt = 0; attempt < 14; attempt++) {
    const id = randomInt(1, MAX_POKEDEX_ID)
    let species
    try {
      species = await getSpecies(id)
    } catch {
      continue
    }
    const rank = speciesRank(species)
    if (rank < minRank) continue
    fallback = species
    if (Math.random() <= RARITIES[rank].weight) return species
  }
  return fallback
}

const buildInstance = async (species, pokemon) => {
  let rank = speciesRank(species)
  if (rank < EPIC_RANK && pokemon.bst >= 600) rank = EPIC_RANK
  const rarity = RARITIES[rank]
  const scale = value => Math.round(value * rarity.statMul)
  const stats = {
    hp: scale(pokemon.stats.hp),
    attack: scale(pokemon.stats.attack),
    defense: scale(pokemon.stats.defense),
    speed: scale(pokemon.stats.speed)
  }
  const quality = stats.hp + stats.attack + stats.defense + stats.speed
  const value = Math.round((quality * rarity.valueMul * (0.9 + Math.random() * 0.2)) / 10) * 10
  return {
    pokedexId: species.id,
    name: species.name,
    types: pokemon.types,
    rarity: rarity.label,
    rarityRank: rank,
    stats,
    quality,
    value,
    level: 0,
    scene: pickScene(pokemon.types),
    flavor: species.flavor || (pokemon.types.length ? `${species.name} es un Pokémon de tipo ${pokemon.types.join(' y ')}.` : ''),
    image: pokemon.image
  }
}

export const summon = async ({ chatId, userId }) => {
  const db = load()
  const user = pokeUser(userId)
  const count = user.pity + 1
  const guaranteed = count >= PITY_LIMIT
  const minRank = guaranteed ? EPIC_RANK : 0

  let instance = null
  for (let attempt = 0; attempt < 3 && !instance; attempt++) {
    const species = await pickSpecies(minRank)
    if (!species) continue
    try {
      const pokemon = await getPokemon(species.id)
      await ensureFlavor(species)
      instance = await buildInstance(species, pokemon)
    } catch {
      instance = null
    }
  }
  if (!instance) return null

  const now = Date.now()
  for (const [key, spawn] of Object.entries(db.spawns)) {
    if (now - spawn.expiresAt > SPAWN_KEEP_MS) delete db.spawns[key]
  }

  const id = db.meta.nextId++
  db.spawns[id] = { ...instance, id, chatId, summoner: userId, createdAt: now, expiresAt: now + CATCH_WINDOW_MS, caught: false }
  user.lastSummon = now
  user.pity = guaranteed || instance.rarityRank >= EPIC_RANK ? 0 : count
  save()

  return { spawn: db.spawns[id], count, guaranteed }
}

export const getActiveSpawn = (chatId, userId) => {
  const spawns = Object.values(load().spawns).filter(spawn => spawn.chatId === chatId && spawn.summoner === userId && !spawn.caught)
  if (!spawns.length) return null
  return spawns.sort((a, b) => b.createdAt - a.createdAt)[0]
}

export const catchSpawn = (spawnId, userId) => {
  const db = load()
  const spawn = db.spawns[spawnId]
  if (!spawn || spawn.caught) return null
  spawn.caught = true
  const { image, scene, ...rest } = spawn
  db.owned[spawn.id] = { ...rest, owner: userId, caughtAt: Date.now() }
  save()
  return db.owned[spawn.id]
}

export const getUserPokemon = userId => Object.values(load().owned).filter(entry => entry.owner === userId)

export const spawnCaption = ({ spawn, count, mentionNumber, prefix }) =>
  `» ˚୨✿୧˚ \`POKÉMON\` ˚୨✿୧˚\n\n` +
  `> ${sceneOf(spawn.scene).appear} para *@${mentionNumber}*\n` +
  `> Solo tú puedes atraparlo con *${prefix}atrapar* en *${Math.round(CATCH_WINDOW_MS / 1000)}s*\n` +
  `> Garantía de la noche » *${count}/${PITY_LIMIT}*\n\n` +
  `❖ ꒰ \`Secretos ocultos\` ꒱\n` +
  `✦ ID » #${spawn.id}\n` +
  `❀ Nombre » *${spawn.name}*\n` +
  `✾ Fuente » Pokémon\n` +
  `❋ Tipo » ${spawn.types.join(' ⟡ ')}\n` +
  `✪ Rareza » *${spawn.rarity}*\n` +
  `✵ Valor » ${money(spawn.value)}${READ_MORE}\n\n` +
  (spawn.flavor ? `> _${spawn.flavor}_\n\n` : '') +
  `❂ ꒰ \`Estadísticas\` ꒱\n` +
  `> *${spawn.name}* ⟡ _${spawn.rarity}_\n\n` +
  `✶ Nivel » ${spawn.level}/${MAX_LEVEL}\n` +
  `❥ Salud » ${spawn.stats.hp}\n` +
  `✷ Daño » ${spawn.stats.attack}\n` +
  `❈ Defensa » ${spawn.stats.defense}\n` +
  `➳ Velocidad » ${spawn.stats.speed}\n` +
  `✰ Calidad » *${spawn.quality}*`
