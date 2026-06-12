export function formatTime(dt: string | Date): string {
  const d = typeof dt === 'string' ? new Date(dt) : dt
  const fmt = typeof window !== 'undefined' ? (localStorage.getItem('time_format') ?? '24h') : '24h'
  if (fmt === '12h') {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
