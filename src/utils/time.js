export const formatUptime = seconds => {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  return [days && `${days}d`, hours && `${hours}h`, minutes && `${minutes}m`, `${secs}s`].filter(Boolean).join(' ')
}
