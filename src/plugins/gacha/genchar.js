import * as gacha from '../../utils/gacha.js'
import * as job from '../../utils/genjob.js'
import * as yandere from '../../utils/yandere.js'

const DEFAULT_PAGES = 40
const MAX_PAGES = 120
const DEFAULT_MIN_FREQ = 2
const MAX_CANDIDATES = 500
const CHAR_BATCH = 3
const TAG_BATCH = 2
const SERIES_BUDGET_MS = 45 * 60 * 1000
const MAX_BLOCKED_HITS = 3
const RANDOM_SERIES_COUNT = 3
const RANDOM_PAGES = 10
const RANDOM_PAGE_MIN = 5
const RANDOM_PAGE_MAX = 30
const RANDOM_PAGE_ATTEMPTS = 4
const MIN_SERIES_POSTS = 25
const SERIES_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000
const MIN_IMAGE = { minWidth: 500, minHeight: 500 }
const SKIP_TAGS = new Set(['highres', 'absurdres', '1girl', '1boy', 'solo', 'breasts', 'nipples', 'naked', 'sex', 'pussy', 'cum', 'crossover'])
const FEMALE_TAGS = new Set(['female', '1girl', '2girls', '3girls', 'multiple_girls', 'girl'])
const MALE_TAGS = new Set(['male', '1boy', '2boys', '3boys', 'multiple_boys', 'boy'])

class GenerationAbort extends Error {
  constructor(reason) {
    super(reason)
    this.reason = reason
  }
}

const createEnv = (currentJob, notify, budgetMs = SERIES_BUDGET_MS) => ({
  job: currentJob,
  deadline: Date.now() + budgetMs,
  blockedHits: 0,
  notify
})

const checkEnv = env => {
  if (env.job.controller.signal.aborted) throw new GenerationAbort('cancelled')
  if (Date.now() > env.deadline) throw new GenerationAbort('deadline')
}

const tagToSeriesName = tag =>
  tag
    .replace(/[_:]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()

const tagToName = tag =>
  tag
    .replace(/_\(.*?\)$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()

const shuffle = items => {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const parseOptions = raw => {
  let pages = DEFAULT_PAGES
  let minFreq = DEFAULT_MIN_FREQ
  const rest = String(raw || '').replace(/\b(paginas|pages|min)=(\d+)/gi, (_, key, value) => {
    const n = parseInt(value, 10)
    if (key.toLowerCase() === 'min') minFreq = Math.max(1, n)
    else pages = Math.min(MAX_PAGES, Math.max(1, n))
    return ' '
  })
  return { pages, minFreq, rest: rest.trim() }
}

const parseTarget = raw => {
  const text = String(raw || '').trim()
  if (!text) return null
  const first = text.split(/\s+/)[0]
  try {
    const url = new URL(first)
    if (!url.hostname.includes('yande.re')) return null
    const rawTags = url.searchParams.get('tags')
    if (!rawTags) return null
    const tags = rawTags.trim().split(/\s+/).filter(Boolean)
    return tags.length ? { seriesTag: tags[0], extraTags: tags.slice(1) } : null
  } catch {
    const tags = text.toLowerCase().split(/\s+/).filter(Boolean)
    return tags.length ? { seriesTag: tags[0], extraTags: tags.slice(1) } : null
  }
}

const getJson = async (path, env) => {
  checkEnv(env)
  try {
    const data = await yandere.getJson(path, { timeoutMs: 8000, signal: env.job.controller.signal })
    env.blockedHits = 0
    return data
  } catch (error) {
    if (error instanceof yandere.YandereError) {
      if (error.kind === 'aborted') throw new GenerationAbort('cancelled')
      if (error.kind === 'blocked') {
        env.blockedHits++
        if (env.blockedHits >= MAX_BLOCKED_HITS) throw new GenerationAbort('blocked')
      }
      return null
    }
    throw error
  }
}

const fetchAllPosts = async (seriesTag, extraTags, pages, env) => {
  const baseTags = [seriesTag, ...extraTags].join(' ')
  const { progress } = env.job
  const all = []
  progress.pagesTotal = pages
  progress.pagesDone = 0
  progress.posts = 0

  for (let page = 1; page <= pages; page++) {
    const data = await getJson(`/post.json?tags=${encodeURIComponent(baseTags)}&limit=100&page=${page}`, env)
    const posts = Array.isArray(data) ? data : []
    if (!posts.length) break
    all.push(...posts.filter(yandere.isSafePost))
    progress.pagesDone = page
    progress.posts = all.length
    env.notify()
    if (posts.length < 100) break
  }
  return all
}

const collectTagFrequencies = (posts, skip) => {
  const freq = {}
  for (const post of posts) {
    const tagStr = typeof post.tags === 'string' ? post.tags : ''
    for (const tag of tagStr.split(/\s+/).filter(Boolean)) {
      if (SKIP_TAGS.has(tag) || skip.has(tag) || yandere.BANNED_TAGS.test(tag)) continue
      freq[tag] = (freq[tag] || 0) + 1
    }
  }
  return freq
}

const classifyTag = async (tag, env) => {
  const data = await getJson(`/tag.json?name=${encodeURIComponent(tag)}`, env)
  if (!Array.isArray(data)) return null
  return data.find(t => t.name === tag && t.type === 4) ? 'character' : 'other'
}

const filterCharacterTags = async (tagNames, env) => {
  const characters = []
  env.job.progress.tagsChecked = 0
  env.job.progress.tagsTotal = tagNames.length

  for (let i = 0; i < tagNames.length; i += TAG_BATCH) {
    checkEnv(env)
    const batch = tagNames.slice(i, i + TAG_BATCH)
    await Promise.all(
      batch.map(async tag => {
        let kind = gacha.getCachedTagKind(tag)
        if (!kind) {
          kind = await classifyTag(tag, env)
          if (kind) gacha.setCachedTagKind(tag, kind)
        }
        if (kind === 'character') characters.push(tag)
        env.job.progress.tagsChecked++
      })
    )
    env.notify()
  }
  return characters
}

const genderFromPosts = (charTag, posts) => {
  let male = 0
  let female = 0
  for (const post of posts) {
    const tags = String(post.tags || '').split(/\s+/)
    if (!tags.includes(charTag)) continue
    if (tags.some(t => MALE_TAGS.has(t))) male++
    if (tags.some(t => FEMALE_TAGS.has(t))) female++
  }
  return male > female ? 'Masculino' : 'Femenino'
}

const fetchRandomSeriesTags = async (amount, currentJob) => {
  const recent = gacha.getRecentSeriesTags(SERIES_COOLDOWN_MS)
  const pool = new Set()
  let reachable = false
  const pages = Array.from({ length: RANDOM_PAGE_MAX - RANDOM_PAGE_MIN + 1 }, (_, i) => RANDOM_PAGE_MIN + i)

  for (const page of shuffle(pages).slice(0, RANDOM_PAGE_ATTEMPTS)) {
    try {
      const data = await yandere.getJson(`/tag.json?type=3&order=count&limit=100&page=${page}`, {
        timeoutMs: 8000,
        signal: currentJob.controller.signal
      })
      if (!Array.isArray(data)) continue
      reachable = true
      for (const t of data) if (t && t.count >= MIN_SERIES_POSTS && t.name && !recent.has(t.name)) pool.add(t.name)
      if (pool.size >= amount * 4) break
    } catch (error) {
      if (error instanceof yandere.YandereError && error.kind === 'aborted') break
    }
  }

  return { tags: shuffle([...pool]).slice(0, amount), reachable }
}

const processCharacter = async (charTag, seriesName, posts, knownKeys, env) => {
  const dbName = tagToName(charTag)
  if (gacha.characterExists(charTag)) return { skipped: `${dbName} (Ya existe)` }

  const key = gacha.normalizeCharacterKey(dbName)
  if (knownKeys.has(key)) return { skipped: `${dbName} (Duplicado)` }
  knownKeys.add(key)

  const fail = reason => {
    knownKeys.delete(key)
    return { skipped: `${dbName} (${reason})` }
  }

  try {
    checkEnv(env)
    const imageUrl = await yandere.getRandomUrl(charTag, MIN_IMAGE)
    if (typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
      gacha.setCachedTagKind(charTag, 'no_image')
      return fail('Sin imagen o baja resolución')
    }

    try {
      if (!(await yandere.isImageUrl(imageUrl, env.job.controller.signal))) return fail('Link caído/No es imagen')
    } catch {
      if (env.job.controller.signal.aborted) throw new GenerationAbort('cancelled')
      return fail('Timeout del link')
    }

    const { inserted } = gacha.addCharacter({
      name: dbName,
      series: seriesName,
      gender: genderFromPosts(charTag, posts),
      tag: charTag,
      value: gacha.randomValue()
    })
    if (!inserted) return fail('Ya existe')
    return { added: dbName }
  } catch (error) {
    if (error instanceof GenerationAbort) {
      knownKeys.delete(key)
      throw error
    }
    return fail('Error')
  }
}

const runGeneration = async (seriesTag, extraTags, options, env) => {
  const seriesName = tagToSeriesName(seriesTag)
  const { progress } = env.job
  const agregados = []
  const saltados = []
  let postsCount = 0
  let candidates = 0
  let characters = 0

  progress.series = seriesName
  progress.phase = 'posts'
  env.notify()

  try {
    const posts = await fetchAllPosts(seriesTag, extraTags, options.pages, env)
    postsCount = posts.length
    if (!posts.length) {
      gacha.recordSeriesRun(seriesTag, seriesName, 0, 0)
      return { seriesName, agregados, saltados, posts: 0, candidates, characters, skipped: true, aborted: null }
    }

    const freq = collectTagFrequencies(posts, new Set([seriesTag, ...extraTags]))
    const candidateNames = Object.keys(freq)
      .filter(name => freq[name] >= options.minFreq)
      .sort((a, b) => freq[b] - freq[a])
      .slice(0, MAX_CANDIDATES)
    candidates = candidateNames.length

    progress.phase = 'tags'
    env.notify()
    const charTagNames = await filterCharacterTags(candidateNames, env)
    characters = charTagNames.length

    progress.phase = 'personajes'
    progress.charsDone = 0
    progress.charsTotal = charTagNames.length
    env.notify()

    const knownKeys = gacha.getSeriesNameKeys(seriesName)

    for (let i = 0; i < charTagNames.length; i += CHAR_BATCH) {
      checkEnv(env)
      const batch = charTagNames.slice(i, i + CHAR_BATCH)
      const results = await Promise.all(batch.map(tag => processCharacter(tag, seriesName, posts, knownKeys, env)))
      for (const r of results) {
        if (r.added) {
          agregados.push(r.added)
          progress.added++
        }
        if (r.skipped) {
          saltados.push(r.skipped)
          progress.skipped++
        }
      }
      progress.charsDone += batch.length
      env.notify()
    }
  } catch (error) {
    if (error instanceof GenerationAbort) {
      return { seriesName, agregados, saltados, posts: postsCount, candidates, characters, skipped: false, aborted: error.reason }
    }
    throw error
  }

  progress.phase = 'finalizando'
  gacha.recordSeriesRun(seriesTag, seriesName, postsCount, agregados.length)
  return { seriesName, agregados, saltados, posts: postsCount, candidates, characters, skipped: false, aborted: null }
}

const formatResult = res => {
  const base =
    `✿ Agregados › *${res.agregados.length}*\n` +
    `✐ Omitidos › *${res.saltados.length}*\n` +
    `❏ Posts revisados › *${res.posts}* · Personajes detectados › *${res.characters}*`
  if (res.aborted === 'blocked') {
    return `${base}\n⚠️ Yande.re está limitando las peticiones, se detuvo esta serie. Vuelve a ejecutar el comando más tarde para continuar donde quedó.`
  }
  if (res.aborted === 'deadline') {
    return `${base}\n⌛ Se alcanzó el tiempo límite de la serie. Vuelve a ejecutar el comando para continuar donde quedó.`
  }
  if (res.aborted === 'cancelled') return `${base}\n🛑 Cancelado.`
  return base
}

const runRandomJob = async (ctx, currentJob, tags, reporter) => {
  const lines = []
  currentJob.progress.seriesTotal = tags.length

  for (let i = 0; i < tags.length; i++) {
    if (currentJob.controller.signal.aborted) break
    const tag = tags[i]
    const seriesName = tagToSeriesName(tag)
    currentJob.progress.seriesIndex = i + 1
    currentJob.progress.series = seriesName
    currentJob.progress.tagsChecked = 0
    currentJob.progress.tagsTotal = 0
    reporter.touch()

    try {
      const res = await runGeneration(tag, [], { pages: RANDOM_PAGES, minFreq: DEFAULT_MIN_FREQ }, createEnv(currentJob, reporter.touch))
      if (res.skipped) {
        lines.push(`⚠️ *${seriesName}* › sin posts`)
        continue
      }
      lines.push(`*${seriesName}*\n${formatResult(res)}`)
      if (res.aborted === 'blocked' || res.aborted === 'cancelled') break
    } catch (error) {
      console.error(error)
      lines.push(`❌ *${seriesName}* › ${error?.message || 'error desconocido'}`)
    }
  }

  const header = currentJob.controller.signal.aborted ? '🛑 *genrandom* cancelado' : '✅ *genrandom* completado'
  await reporter.finish(
    `${header} en ${job.formatElapsed(Date.now() - currentJob.startedAt)}\n✿ Personajes nuevos › *${currentJob.progress.added}*\n\n${lines.join('\n\n')}`.trim()
  )
  gacha.react(ctx, currentJob.controller.signal.aborted ? '✖️' : '🌸')
}

const runUrlJob = async (ctx, currentJob, target, options, reporter) => {
  const res = await runGeneration(target.seriesTag, target.extraTags, options, createEnv(currentJob, reporter.touch))
  if (res.skipped) {
    await reporter.finish(`⚠️ No se encontraron posts para *${res.seriesName}*.`)
    gacha.react(ctx, '✖️')
    return
  }
  await reporter.finish(
    `✅ Completado para *${res.seriesName}* en ${job.formatElapsed(Date.now() - currentJob.startedAt)}.\n${formatResult(res)}`
  )
  gacha.react(ctx, res.aborted ? '⚠️' : '🌸')
}

const launch = (ctx, currentJob, run) => {
  const reporter = job.createReporter({ sock: ctx.sock, chatId: ctx.chat, msg: ctx.raw }, currentJob)
  void reporter
    .start()
    .then(() => run(reporter))
    .catch(async error => {
      console.error(error)
      gacha.react(ctx, '✖️')
      await reporter.finish(`❌ Hubo un error inesperado al generar: ${error?.message || 'desconocido'}`).catch(() => undefined)
    })
    .finally(() => job.endJob(currentJob))
}

const busyMessage = (active, prefix) =>
  `⏳ Ya hay una generación en curso (*${active.label}*, ${job.formatElapsed(Date.now() - active.startedAt)}). Usa *${prefix}genstatus* para ver el avance o *${prefix}gencancel* para detenerla.`

export default gacha.define({
  name: 'genchar',
  aliases: ['generar', 'genrandom'],
  description: 'Genera personajes del gacha a partir de una serie de yande.re.',
  ownerOnly: true,
  run: async ctx => {
    const { text, command, prefix } = ctx
    gacha.pruneTagCache()

    if (command === 'genrandom') {
      const currentJob = job.beginJob('genrandom')
      if (!currentJob) {
        const active = job.getJob()
        if (active) await ctx.reply(busyMessage(active, prefix))
        return
      }

      gacha.react(ctx, '🕒')
      let found
      try {
        found = await fetchRandomSeriesTags(RANDOM_SERIES_COUNT, currentJob)
      } catch (error) {
        job.endJob(currentJob)
        throw error
      }

      if (!found.tags.length) {
        job.endJob(currentJob)
        await ctx.reply(
          found.reachable
            ? '⚠️ No encontré series nuevas: las que salieron ya se procesaron en las últimas 2 semanas. Intenta de nuevo o usa *genchar* con una serie concreta.'
            : '❌ Yande.re rechazó la conexión. Espera unos minutos e intenta de nuevo.'
        )
        gacha.react(ctx, '✖️')
        return
      }

      launch(ctx, currentJob, reporter => runRandomJob(ctx, currentJob, found.tags, reporter))
      return
    }

    const options = parseOptions(text)
    const target = parseTarget(options.rest)
    if (!target) {
      return ctx.reply(
        `✐ Ingresa un link de yande.re con tags o el tag de la serie.\n\n💌 Ejemplos:\n*${prefix}${command} https://yande.re/post?tags=re_zero_kara_hajimeru_isekai_seikatsu*\n*${prefix}${command} re_zero_kara_hajimeru_isekai_seikatsu paginas=60 min=1*\n\n> *paginas* (máx. ${MAX_PAGES}, por defecto ${DEFAULT_PAGES}) define cuántas páginas de 100 posts se revisan.\n> *min* (por defecto ${DEFAULT_MIN_FREQ}) es el mínimo de posts donde debe aparecer un personaje; con *min=1* entran también los menos populares.`
      )
    }

    const currentJob = job.beginJob(tagToSeriesName(target.seriesTag))
    if (!currentJob) {
      const active = job.getJob()
      if (active) await ctx.reply(busyMessage(active, prefix))
      return
    }

    gacha.react(ctx, '🕒')
    const previous = gacha.getSeriesRun(target.seriesTag)
    if (previous) {
      const days = Math.max(0, Math.floor((Date.now() - previous.processedAt) / 86400000))
      await ctx.reply(`ℹ️ Esta serie ya se procesó hace ${days} día(s) (${previous.added} agregados). Se revisará de nuevo por si faltan personajes.`)
    }
    launch(ctx, currentJob, reporter => runUrlJob(ctx, currentJob, target, options, reporter))
  }
})
