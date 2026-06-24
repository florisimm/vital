'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'

// Supabase fires a PASSWORD_RECOVERY auth event whenever it detects a recovery
// token in the URL (after the user clicks the "reset password" email link).
// This can land on any page (e.g. `/`, which would otherwise show the onboarding
// wizard for users without settings). We catch that event globally and send the
// user straight to the dedicated reset-password screen.
export function PasswordRecoveryGuard() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && pathname !== '/auth/reset-password') {
        router.replace('/auth/reset-password')
      }
    })
    return () => subscription.unsubscribe()
  }, [router, pathname])

  return null
}
