'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Activity, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase'

type Tab = 'signin' | 'signup'

export default function LoginPage() {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('signin')

  // Shared fields
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')

  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [notice, setNotice]     = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('error') === 'email_exists') {
      setTab('signin')
      setError('Er bestaat al een account met dit e-mailadres. Log in met je wachtwoord hieronder.')
    } else if (params.get('error') === 'auth') {
      setError('Inloggen mislukt. Probeer het opnieuw.')
    }
  }, [])
  const [googleLoading, setGoogleLoading] = useState(false)

  async function handleGoogleAuth() {
    setGoogleLoading(true); setError(null)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    const { error } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${siteUrl}/auth/callback` },
    })
    if (error) { setError(error.message); setGoogleLoading(false) }
  }

  function switchTab(t: Tab) {
    setTab(t)
    setError(null)
    setNotice(null)
  }

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null); setNotice(null)
    const { error } = await createClient().auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/')
    router.refresh()
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError(null); setNotice(null)
    const { data, error } = await createClient().auth.signUp({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    if (data.session) {
      router.push('/')
      router.refresh()
    } else {
      setLoading(false)
      setNotice('Check your email and click the confirmation link to activate your account.')
    }
  }

  async function handleForgotPassword() {
    if (!email) { setError('Enter your email address first'); return }
    setLoading(true); setError(null); setNotice(null)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/reset-password`,
    })
    setLoading(false)
    setNotice('Reset link sent — check your email')
  }

  return (
    <div
      className="min-h-screen flex flex-col px-6"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 40px)',
        background:
          'radial-gradient(ellipse at 75% -10%, rgba(0,210,220,0.28) 0%, transparent 52%), ' +
          'radial-gradient(ellipse at 10% 105%, rgba(255,120,0,0.15) 0%, transparent 52%), ' +
          'rgb(5, 6, 8)',
      }}
    >
      <div className="flex-1 flex flex-col justify-center">
        {/* Logo */}
        <div className="mb-9">
          <div
            className="w-[68px] h-[68px] rounded-[20px] flex items-center justify-center mb-6"
            style={{
              background: 'linear-gradient(135deg, rgba(45,212,191,0.25) 0%, rgba(255,120,0,0.18) 100%)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 0 40px rgba(45,212,191,0.18)',
            }}
          >
            <Activity size={32} className="text-teal-400" strokeWidth={2} />
          </div>
          <h1 className="text-[40px] font-bold leading-none text-white tracking-tight">
            {tab === 'signin' ? 'Welcome back' : 'Get started'}
          </h1>
          <p className="text-[16px] text-white/40 mt-2.5 font-medium">
            {tab === 'signin' ? 'Sign in to your Kern account' : 'Create your Kern account'}
          </p>
        </div>

        {/* Tab switcher — sliding pill */}
        <div
          className="flex relative mb-7 p-1 rounded-[18px]"
          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {/* Sliding background pill */}
          <div
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-[14px] transition-transform duration-250 ease-in-out"
            style={{
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.12)',
              transform: tab === 'signup' ? 'translateX(calc(100% + 4px))' : 'translateX(0)',
            }}
          />
          <button
            type="button"
            onClick={() => switchTab('signin')}
            className="relative flex-1 h-[42px] rounded-[14px] text-[15px] font-semibold transition-colors duration-200"
            style={{ color: tab === 'signin' ? 'white' : 'rgba(255,255,255,0.35)' }}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => switchTab('signup')}
            className="relative flex-1 h-[42px] rounded-[14px] text-[15px] font-semibold transition-colors duration-200"
            style={{ color: tab === 'signup' ? 'white' : 'rgba(255,255,255,0.35)' }}
          >
            Sign up
          </button>
        </div>

        {/* Sign in form */}
        {tab === 'signin' && (
          <form onSubmit={handleSignIn} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2.5">
              <Field icon={<Mail size={18} className="text-white/30 shrink-0" />}>
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none text-[17px]"
                />
              </Field>
              <Field icon={<Lock size={18} className="text-white/30 shrink-0" />}>
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none text-[17px]"
                />
              </Field>
            </div>

            {error  && <p className="text-red-400  text-[14px] text-center px-2">{error}</p>}
            {notice && <p className="text-teal-400 text-[14px] text-center px-2">{notice}</p>}

            <button
              type="submit"
              disabled={loading}
              className="h-[56px] rounded-[18px] bg-white text-black font-semibold text-[17px] mt-1 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
            >
              {loading ? 'Signing in…' : <>Sign in <ArrowRight size={18} strokeWidth={2.3} /></>}
            </button>

            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loading}
              className="text-[14px] text-white/35 text-center disabled:opacity-50 mt-0.5"
            >
              Forgot password?
            </button>

            <OrDivider />
            <GoogleButton loading={googleLoading} onClick={handleGoogleAuth} />
          </form>
        )}

        {/* Sign up — simple email + password; wizard shows after email confirmation */}
        {tab === 'signup' && (
          <form onSubmit={handleSignUp} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2.5">
              <Field icon={<Mail size={18} className="text-white/30 shrink-0" />}>
                <input
                  type="email"
                  placeholder="Email address"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none text-[17px]"
                />
              </Field>
              <Field icon={<Lock size={18} className="text-white/30 shrink-0" />}>
                <input
                  type="password"
                  placeholder="Choose a password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none text-[17px]"
                />
              </Field>
            </div>

            {error  && <p className="text-red-400  text-[14px] text-center px-2">{error}</p>}
            {notice && <p className="text-teal-400 text-[14px] text-center px-2">{notice}</p>}

            {!notice && (
              <button
                type="submit"
                disabled={loading}
                className="h-[56px] rounded-[18px] bg-white text-black font-semibold text-[17px] mt-1 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
              >
                {loading ? 'Creating account…' : <>Create account <ArrowRight size={18} strokeWidth={2.3} /></>}
              </button>
            )}

            <OrDivider />
            <GoogleButton loading={googleLoading} onClick={handleGoogleAuth} />

            <p className="text-[12px] text-white/25 text-center mt-1 px-4">
              By signing up you agree to our terms of service.
            </p>
          </form>
        )}
      </div>

      <p className="text-[13px] text-white/20 text-center">
        Kern — AI Fitness & Health Coaching
      </p>

    </div>
  )
}

function OrDivider() {
  return (
    <div className="flex items-center gap-3 my-1">
      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.09)' }} />
      <span className="text-[13px] text-white/25 font-medium">or</span>
      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.09)' }} />
    </div>
  )
}

function GoogleButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="h-[56px] rounded-[18px] flex items-center justify-center gap-3 font-semibold text-[16px] text-white disabled:opacity-50 active:scale-[0.98] transition-transform"
      style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}
    >
      {loading ? (
        <span className="text-white/60">Redirecting…</span>
      ) : (
        <>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </>
      )}
    </button>
  )
}

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className="flex items-center gap-3 h-[56px] px-4 rounded-[18px] border border-white/[0.09]"
      style={{ background: 'rgba(255,255,255,0.07)' }}
    >
      {icon}
      {children}
    </div>
  )
}
