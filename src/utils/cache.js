export const makeCache = limit => {
  const map = new Map()

  return {
    get: key => map.get(key),
    set: (key, value) => {
      if (map.has(key)) map.delete(key)
      map.set(key, value)
      if (map.size > limit) map.delete(map.keys().next().value)
    }
  }
}
