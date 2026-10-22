// Parse the date format accepted by the activity-history filter.
export function parseDate(value) {
  const match = value
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!match) return null
  const [, day, month, year, hour = '00', minute = '00', second = '00'] = match
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  )
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day) ||
    date.getHours() !== Number(hour) ||
    date.getMinutes() !== Number(minute) ||
    date.getSeconds() !== Number(second)
  )
    return null
  return date.getTime()
}

export function formatDatabaseTimestamp(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2}:\d{2})$/)
  return match ? `${match[3]}/${match[2]}/${match[1]} ${match[4]}` : String(value || '')
}
