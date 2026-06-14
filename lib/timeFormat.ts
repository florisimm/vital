// Local (not UTC) YYYY-MM-DD — matches how Fitbit sync stores `datum`
// (by local wake-up date), avoiding off-by-one near midnight in non-UTC zones.
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatTime(dt: string | Date): string {
  const d = typeof dt === 'string' ? new Date(dt) : dt
  const fmt = typeof window !== 'undefined' ? (localStorage.getItem('time_format') ?? '24h') : '24h'
  if (fmt === '12h') {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
