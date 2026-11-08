import config from '../../config.js'

export const card = (title, rows = []) =>
  [`✦ *${title}* ✦`, ...rows.map(row => (Array.isArray(row) ? `⟡ *${row[0]}* ⟶ ${row[1]}` : `⟡ ${row}`)), '❀'].join('\n')

export const socketType = sock => (sock.isJadibot ? 'Sub Bot' : 'Principal')

export const notifyOwners = async (sock, text) => {
  const results = await Promise.allSettled(config.owners.map(owner => sock.sendMessage(`${owner}@s.whatsapp.net`, { text })))
  return results.some(result => result.status === 'fulfilled')
}
