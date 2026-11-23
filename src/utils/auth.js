import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { useMultiFileAuthState } from 'baileys'
import log from './logger.js'

const isValid = async path => {
  try {
    const data = JSON.parse(await readFile(path, 'utf8'))
    return Boolean(data && typeof data === 'object' && data.noiseKey && data.signedIdentityKey)
  } catch {
    return false
  }
}

const restoreCreds = async dir => {
  const creds = join(dir, 'creds.json')
  const backup = join(dir, 'creds.json.bak')
  if (!existsSync(backup)) return
  if (existsSync(creds) && (await isValid(creds))) return
  if (!(await isValid(backup))) return
  await copyFile(backup, creds)
  log.warn(`creds.json dañado o ausente en "${dir}", restaurado desde la copia de seguridad`)
}

export const useSafeAuthState = async dir => {
  await mkdir(dir, { recursive: true })
  await restoreCreds(dir)

  const auth = await useMultiFileAuthState(dir)
  const creds = join(dir, 'creds.json')
  const backup = join(dir, 'creds.json.bak')
  let chain = Promise.resolve()

  const saveCreds = () => {
    chain = chain
      .then(async () => {
        await auth.saveCreds()
        if (!(await isValid(creds))) return
        await copyFile(creds, `${backup}.tmp`)
        await rename(`${backup}.tmp`, backup)
      })
      .catch(error => {
        log.warn('No se pudo guardar las credenciales:', error?.message ?? error)
      })
    return chain
  }

  return { state: auth.state, saveCreds }
}
