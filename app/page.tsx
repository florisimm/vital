import { fetchTodayServerData } from '@/lib/today-server'
import { TodayPageClient } from './TodayPageClient'

// Per-user + cookie-dependent, so it can't be statically cached.
export const dynamic = 'force-dynamic'

export default async function Page() {
  // Fetch + derive the dashboard data server-side and hand it to the client as the
  // SWR fallback. Logged-out visitors get an empty map; the client auth gate then
  // renders the landing page exactly as before.
  const fallback = await fetchTodayServerData()
  return <TodayPageClient fallback={fallback} />
}
