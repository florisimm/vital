import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Guard: if env vars are missing, skip auth checks (avoids crash on cold start)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  try {
    const { data: { session } } = await supabase.auth.getSession()
    const { pathname } = request.nextUrl

    // Logged-out visitors can see the public landing page (/) and /login;
    // any other app route redirects to /login.
    if (!session && pathname !== '/' && pathname !== '/login' && !pathname.startsWith('/auth')) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    if (session && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  } catch {
    // On error, allow the request through — the page itself will handle auth
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
