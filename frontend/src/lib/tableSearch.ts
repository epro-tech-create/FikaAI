export function matchesSearch(item: Record<string, unknown>, query: string, keys: string[]) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return keys.some(key => String(item[key] ?? '').toLowerCase().includes(needle))
}
