'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Activity, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { SignupOnboarding } from '@/components/SignupOnboarding'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)

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
    setLoading(true); setError(null); setNotice(null)
    const { error } = await createClient().auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/')
    router.refresh()
  }

  if (showOnboarding) return <SignupOnboarding onClose={() => setShowOnboarding(false)} />

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

          <h1 className="text-[40px] font-bold leading-none text-white tracking-tight">Welcome back</h1>
          <p className="text-[16px] text-white/40 mt-2.5 font-medium">Sign in to your Kern account</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2.5">
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

            <Field icon={<Lock size={18} className="text-white/30 shrink-0" />}>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
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
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-white/[0.08]" />
          <span className="text-[12px] text-white/25">new to Kern?</span>
          <div className="flex-1 h-px bg-white/[0.08]" />
        </div>

        {/* Sign up — launches onboarding (no real account yet) */}
        <button
          type="button"
          onClick={() => setShowOnboarding(true)}
          className="h-[56px] rounded-[18px] font-semibold text-[17px] text-white active:scale-[0.98] transition-transform"
          style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
        >
          Create your account
        </button>
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
