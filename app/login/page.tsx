'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Activity, ArrowRight, User } from 'lucide-react'
import { createClient } from '@/lib/supabase'

type Mode = 'signin' | 'signup'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  async function handleForgotPassword() {
    if (!email) { setError('Enter your email address first'); return }
    setLoading(true); setError(null); setNotice(null)
    await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback`,
    })
    setLoading(false)
    setNotice('Reset link sent — check your email')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)
    const supabase = createClient()

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      router.push('/')
      router.refresh()
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name || undefined },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })
      if (error) { setError(error.message); setLoading(false); return }
      // If email confirmation is required, no active session is returned.
      if (data.session) {
        router.push('/')
        router.refresh()
      } else {
        setLoading(false)
        setNotice('Account created — check your email to confirm and sign in.')
        setMode('signin')
      }
    }
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
      {/* Back to home */}
      <button
        type="button"
        onClick={() => router.push('/')}
        className="self-start text-[14px] text-white/40 active:text-white/70 transition-colors mb-2"
      >
        ← Back to home
      </button>

      {/* Logo + branding */}
      <div className="flex-1 flex flex-col justify-center">
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
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="text-[16px] text-white/40 mt-2.5 font-medium">
            {mode === 'signin'
              ? 'Sign in to your Kern account'
              : 'Start training on data with Kern'}
          </p>
        </div>

        {/* Mode toggle */}
        <div
          className="flex p-1 rounded-[16px] mb-5"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {(['signin', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className="flex-1 h-[42px] rounded-[12px] text-[15px] font-semibold transition-all"
              style={mode === m
                ? { background: 'rgba(255,255,255,0.95)', color: 'rgb(5,6,8)' }
                : { background: 'transparent', color: 'rgba(255,255,255,0.5)' }}
            >
              {m === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2.5">
            {/* Name — signup only */}
            {mode === 'signup' && (
              <Field icon={<User size={18} className="text-white/30 shrink-0" />}>
                <input
                  type="text"
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none text-[17px]"
                />
              </Field>
            )}

            {/* Email */}
            <Field icon={<Mail size={18} className="text-white/30 shrink-0" />}>
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none text-[17px]"
              />
            </Field>

            {/* Password */}
            <Field icon={<Lock size={18} className="text-white/30 shrink-0" />}>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                minLength={6}
                className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none text-[17px]"
              />
            </Field>
          </div>

          {error && <p className="text-red-400 text-[14px] text-center px-2">{error}</p>}
          {notice && <p className="text-teal-400 text-[14px] text-center px-2">{notice}</p>}

          <button
            type="submit"
            disabled={loading}
            className="h-[56px] rounded-[18px] bg-white text-black font-semibold text-[17px] mt-1 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {loading
              ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
              : (
                <>
                  {mode === 'signin' ? 'Sign in' : 'Create account'}
                  <ArrowRight size={18} strokeWidth={2.3} />
                </>
              )}
          </button>

          {mode === 'signin' && (
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loading}
              className="text-[14px] text-white/35 text-center disabled:opacity-50 mt-0.5"
            >
              Forgot password?
            </button>
          )}
        </form>

        <p className="text-[14px] text-white/35 text-center mt-6">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            type="button"
            onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            className="text-teal-400 font-semibold"
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>

      <p className="text-[13px] text-white/20 text-center">
        Kern — AI Fitness & Health Coaching
      </p>
    </div>
  )
}

// Input field wrapper with leading icon
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
