'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Activity } from 'lucide-react'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col px-6"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 72px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 48px)',
        background:
          'radial-gradient(ellipse at 75% -10%, rgba(0,210,220,0.28) 0%, transparent 52%), ' +
          'radial-gradient(ellipse at 10% 105%, rgba(255,120,0,0.15) 0%, transparent 52%), ' +
          'rgb(5, 6, 8)',
      }}
    >
      {/* Logo + branding */}
      <div className="flex-1 flex flex-col justify-center">
        <div className="mb-10">
          {/* App icon */}
          <div
            className="w-[76px] h-[76px] rounded-[22px] flex items-center justify-center mb-7"
            style={{
              background: 'linear-gradient(135deg, rgba(45,212,191,0.25) 0%, rgba(255,120,0,0.18) 100%)',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: '0 0 40px rgba(45,212,191,0.18)',
            }}
          >
            <Activity size={36} className="text-teal-400" strokeWidth={2} />
          </div>

          <p
            className="text-[12px] font-semibold uppercase text-white/40 mb-2"
            style={{ letterSpacing: '0.14em' }}
          >
            Welcome back
          </p>
          <h1 className="text-[52px] font-bold leading-none text-white tracking-tight">Vital</h1>
          <p className="text-[17px] text-white/40 mt-2 font-medium">Your AI fitness companion</p>
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2.5">
          {/* Email field */}
          <div
            className="flex items-center gap-3 h-[56px] px-4 rounded-[18px] border border-white/[0.09]"
            style={{ background: 'rgba(255,255,255,0.07)' }}
          >
            <Mail size={18} className="text-white/30 shrink-0" />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none text-[17px]"
            />
          </div>

          {/* Password field */}
          <div
            className="flex items-center gap-3 h-[56px] px-4 rounded-[18px] border border-white/[0.09]"
            style={{ background: 'rgba(255,255,255,0.07)' }}
          >
            <Lock size={18} className="text-white/30 shrink-0" />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none text-[17px]"
            />
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-[14px] text-center px-2">{error}</p>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="h-[56px] rounded-[18px] bg-white text-black font-semibold text-[17px] mt-1 disabled:opacity-50 active:scale-[0.98] transition-transform"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-[13px] text-white/25 text-center mt-1">
          Vital — AI Fitness & Health Coaching
        </p>
      </div>
    </div>
  )
}
