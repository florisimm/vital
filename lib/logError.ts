import { createClient } from '@/lib/supabase'

export async function logError(error: unknown, component?: string) {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('error_logs').insert({
      message: error instanceof Error ? error.message : String(error),
      stack:   error instanceof Error ? error.stack ?? null : null,
      page:    typeof window !== 'undefined' ? window.location.pathname : null,
      component: component ?? null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      user_id: user?.id ?? null,
    })
  } catch {
    // Silently fail — don't cause more errors while logging
  }
}
