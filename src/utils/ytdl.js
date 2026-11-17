import { execFile, spawn } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import config from '../../config.js'
import { api, btch, chain, getBuffer, getJson, isYoutubeUrl, urlsByKey, youtubeId } from './downloads.js'

const settings = config.downloads ?? {}
const PROVIDER_TIMEOUT_MS = settings.providerTimeoutMs ?? 25000
const API_TIMEOUT_MS = settings.ytdlApiTimeoutMs ?? 30000
const YTDLP_TIMEOUT_MS = settings.ytdlpTimeoutMs ?? 45000
const AUDIO_MAX_BYTES = 120 * 1024 * 1024
const COOLDOWN_MS = 5 * 60 * 1000
const LINK_KEYS = ['dl', 'download', 'downloadUrl', 'download_url', 'link', 'url']
const BLOCKED_LINK = /(youtube\.com|youtu\.be|ytimg\.com)\//i
const IMAGE_LINK = /\.(jpe?g|png|webp)(\?|$)/i

const cooldowns = new Map()

const describe = error => error?.message || String(error)

const loadYts = async () => {
  try {
    const mod = await import('yt-search')
    return mod.default ?? mod
  } catch {
    throw new Error('Falta el módulo yt-search. Instálalo con: npm install yt-search')
  }
}

export const resolve = async input => {
  const text = String(input || '').trim()
  const id = youtubeId(text)

  if (id) {
    const info = await loadYts()
      .then(yts => yts({ videoId: id }))
      .catch(() => null)
    return { url: `https://youtu.be/${id}`, info: info?.videoId ? info : null }
  }

  if (isYoutubeUrl(text)) return { url: /^https?:\/\//i.test(text) ? text : `https://${text}`, info: null }

  const yts = await loadYts()
  const search = await yts(text)
  const video = search.videos?.[0] ?? search.all?.find(item => item.type === 'video')
  if (!video) throw new Error('No se encontró un video válido de YouTube')
  return { url: video.url, info: video }
}

const lempi = (kind, url) => async () => {
  const { url: base, key } = api('lempi')
  const path = kind === 'audio' ? '/dl/yta' : '/dl/ytv'
  const json = await getJson(`${base}${path}?${new URLSearchParams({ url, apikey: key ?? '' })}`)
  if (!json?.status || !json?.descarga?.url) return null
  return {
    url: json.descarga.url,
    name: json.descarga.archivo || null,
    quality: json.descarga.calidad || null,
    size: json.descarga['tamaño'] || null,
    meta: {
      title: json.titulo,
      channel: json.canal?.nombre,
      duration: json.duracion,
      views: json.vistas,
      thumbnail: json.miniatura
    }
  }
}

const generic = (name, path, params) => async () => {
  const json = await getJson(`${api(name).url}${path}?${new URLSearchParams(params)}`)
  const found = urlsByKey(json, LINK_KEYS).filter(link => !BLOCKED_LINK.test(link) && !IMAGE_LINK.test(link))
  return found.length ? { url: found[0], alts: found.slice(1), name: null, quality: null, size: null, meta: null } : null
}

const providers = (kind, url) => {
  const audio = kind === 'audio'
  return [
    lempi(kind, url),
    generic('siputzx', audio ? '/api/d/ytmp3' : '/api/d/ytmp4', { url }),
    generic('vreden', audio ? '/api/v1/download/youtube/audio' : '/api/v1/download/youtube/video', {
      url,
      quality: audio ? '128' : '360'
    }),
    generic('zenzxz', audio ? '/download/ytmp3' : '/download/ytmp4', { url }),
    generic('delirius', audio ? '/download/ytmp3' : '/download/ytmp4', { url })
  ]
}

export const fetchMedia = async (kind, url) => {
  const result = await chain(providers(kind, url))
  if (!result) throw new Error('Ninguna API devolvió un enlace de descarga')
  return result
}

const withTimeout = (name, promise) => {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name}: tiempo agotado`)), PROVIDER_TIMEOUT_MS)
  })
  promise.catch(() => {})
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const guarded = (name, run) => async () => {
  if (Date.now() < (cooldowns.get(name) || 0)) throw new Error(`${name}: deshabilitado temporalmente (fallos recientes)`)
  try {
    return await withTimeout(name, run())
  } catch (error) {
    cooldowns.set(name, Date.now() + COOLDOWN_MS)
    throw new Error(`${name}: ${describe(error).replace(`${name}: `, '')}`)
  }
}

const ytdlApi = url => async () => {
  const base = String(settings.ytdl?.url || process.env.YTDL_API_URL || '').trim().replace(/\/+$/, '')
  const key = String(settings.ytdl?.key || process.env.YTDL_API_KEY || '').trim()
  if (!base || !key) return null

  const data = await getJson(`${base}/api/audio`, {
    method: 'POST',
    body: JSON.stringify({ url, format: 'mp3' }),
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    timeout: API_TIMEOUT_MS
  })
  if (!data?.download_url) throw new Error('La API no devolvió un archivo')

  const link = `${base}${new URL(String(data.download_url), base).pathname}`
  return { url: link, headers: { 'x-api-key': key }, name: data.file_name || null, meta: { title: data.title } }
}

const ytdlp = url => async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ytdlp-'))

  try {
    const bin = settings.ytdlp?.path || process.env.YTDLP_PATH || 'yt-dlp'
    const extra = String(settings.ytdlp?.extraArgs || process.env.YTDLP_EXTRA_ARGS || '')
      .split(/\s+/)
      .filter(Boolean)
    const runtime = extra.includes('--js-runtimes') ? [] : ['--js-runtimes', `node:${process.execPath}`]
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--no-mtime',
      ...runtime,
      ...extra,
      '-f',
      'ba[ext=m4a]/ba/b',
      '-o',
      join(dir, 'audio.%(ext)s'),
      url
    ]

    const outcome = await new Promise(done =>
      execFile(bin, args, { timeout: YTDLP_TIMEOUT_MS, maxBuffer: 20 * 1024 * 1024 }, (error, _out, stderr) =>
        done({ error, stderr })
      )
    )

    if (outcome.error) {
      if (outcome.error.code === 'ENOENT') return null
      const detail = String(outcome.stderr || '').trim().split('\n').filter(Boolean).pop()
      throw new Error(`yt-dlp: ${(detail || outcome.error.message).slice(0, 200)}`)
    }

    const file = (await readdir(dir)).find(name => name.startsWith('audio.'))
    if (!file) throw new Error('yt-dlp: no se generó el archivo de salida')
    return { buffer: await readFile(join(dir, file)), meta: null }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

const vredenLib = url =>
  guarded('vreden', async () => {
    let mod = null
    try {
      mod = await import('@vreden/youtube_scraper')
    } catch {}
    const fn = mod?.ytmp3 ?? mod?.default?.ytmp3
    if (!fn) throw new Error('módulo @vreden/youtube_scraper no instalado')
    const data = await fn(url)
    if (!data?.status || !data?.download?.url) throw new Error('sin URL')
    return { url: data.download.url, meta: { title: data.metadata?.title } }
  })

const btchLib = url =>
  guarded('btch', async () => {
    const fn = await btch('youtube')
    if (!fn) throw new Error('módulo btch-downloader no instalado')
    const data = await fn(url)
    if (!data?.status || !data?.mp3) throw new Error('sin URL')
    return { url: data.mp3, meta: { title: data.title } }
  })

const anabot = query =>
  guarded('anabot', async () => {
    const params = new URLSearchParams({ query, apikey: api('anabot').key ?? '' })
    const json = await getJson(`https://anabot.my.id/api/download/playmusic?${params}`, { timeout: 15000 })
    const result = json?.data?.result
    if (!result?.success || !result.urls) throw new Error('sin resultado')
    return { url: result.urls, meta: { title: result.metadata?.title } }
  })

const sniffAudio = buffer => {
  const head = buffer.subarray(0, 12)
  const text = head.toString('latin1')
  if (text.startsWith('ID3') || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return 'mp3'
  if (text.slice(4, 8) === 'ftyp') return 'm4a'
  const first = String.fromCharCode(head[0] || 0)
  if (first === '<' || first === '{') return 'invalid'
  return 'other'
}

const convertToMp3 = async buffer => {
  const dir = await mkdtemp(join(tmpdir(), 'aud-'))
  const input = join(dir, 'input.bin')
  const output = join(dir, 'output.mp3')

  try {
    await writeFile(input, buffer)

    await new Promise((done, fail) => {
      const proc = spawn(
        'ffmpeg',
        ['-y', '-i', input, '-vn', '-c:a', 'libmp3lame', '-b:a', '128k', '-ar', '44100', '-ac', '2', output],
        { stdio: ['ignore', 'ignore', 'pipe'] }
      )
      let stderr = ''
      const timer = setTimeout(() => {
        proc.kill('SIGKILL')
        fail(new Error('ffmpeg timeout'))
      }, 120000)

      proc.stderr.on('data', chunk => {
        stderr = (stderr + chunk).slice(-2000)
      })
      proc.on('error', error => {
        clearTimeout(timer)
        fail(error)
      })
      proc.on('close', code => {
        clearTimeout(timer)
        if (code === 0) return done()
        fail(new Error(stderr.split('\n').filter(Boolean).slice(-3).join(' ').trim() || `ffmpeg salió con código ${code}`))
      })
    })

    return await readFile(output)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

const toPlayableAudio = async buffer => {
  const kind = sniffAudio(buffer)
  if (kind === 'invalid') throw new Error('La API devolvió un archivo que no es audio')
  if (kind === 'mp3') return { buffer, mimetype: 'audio/mpeg', ext: 'mp3' }
  if (kind === 'm4a') return { buffer, mimetype: 'audio/mp4', ext: 'm4a' }
  return { buffer: await convertToMp3(buffer), mimetype: 'audio/mpeg', ext: 'mp3' }
}

const attempt = async run => {
  const media = await run()
  if (!media) return null

  const candidates = media.buffer
    ? [{ buffer: media.buffer }]
    : [media.url, ...(media.alts ?? [])].map((link, index) => ({ url: link, headers: index === 0 ? media.headers : undefined }))

  let lastError = null

  for (const candidate of candidates) {
    try {
      const buffer =
        candidate.buffer ?? (await getBuffer(candidate.url, { headers: candidate.headers, timeout: 90000, max: AUDIO_MAX_BYTES }))
      if (!buffer.length) throw new Error('Archivo vacío')
      const audio = await toPlayableAudio(buffer)
      return { media: { ...media, url: candidate.url ?? null }, audio }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('sin resultado')
}

export const fetchAudio = async (url, title) => {
  const errors = []

  for (const [name, run] of [
    ['api', ytdlApi(url)],
    ['yt-dlp', ytdlp(url)]
  ]) {
    try {
      const result = await attempt(run)
      if (result) return result
    } catch (error) {
      errors.push(`${name}: ${describe(error)}`)
    }
  }

  try {
    return await Promise.any(
      [vredenLib(url), btchLib(url), anabot(title || url)].map(async run => {
        const result = await attempt(run)
        if (!result) throw new Error('sin resultado')
        return result
      })
    )
  } catch (error) {
    if (error instanceof AggregateError) errors.push(...error.errors.map(describe))
    else errors.push(describe(error))
  }

  for (const run of providers('audio', url)) {
    try {
      const result = await attempt(run)
      if (result) return result
    } catch (error) {
      errors.push(describe(error))
    }
  }

  throw new Error(
    errors.length ? `Ninguna API devolvió audio válido (${errors.slice(-4).join(' | ')})` : 'Ninguna API devolvió un enlace de descarga'
  )
}
