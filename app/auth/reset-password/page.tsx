'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, Activity, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match'); return }
    if (password.length < 6)  { setError('At least 6 characters required'); return }
    setLoading(true); setError(null)
    const { error } = await createClient().auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/')
    router.refresh()
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
            New password
          </h1>
          <p className="text-[16px] text-white/40 mt-2.5 font-medium">
            Choose a new password for your Kern account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2.5">
            <Field icon={<Lock size={18} className="text-white/30 shrink-0" />}>
              <input
                type="password"
                placeholder="New password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
                className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none text-[17px]"
              />
            </Field>
            <Field icon={<Lock size={18} className="text-white/30 shrink-0" />}>
              <input
                type="password"
                placeholder="Confirm password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                className="flex-1 bg-transparent text-white placeholder:text-white/30 outline-none text-[17px]"
              />
            </Field>
          </div>

          {error && <p className="text-red-400 text-[14px] text-center px-2">{error}</p>}

          <button
            type="submit"
            disabled={loading || !password || !confirm}
            className="h-[56px] rounded-[18px] bg-white text-black font-semibold text-[17px] mt-1 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {loading ? 'Saving…' : <>Save password <ArrowRight size={18} strokeWidth={2.3} /></>}
          </button>
        </form>
      </div>

      <p className="text-[13px] text-white/20 text-center">
        Kern — AI Fitness & Health Coaching
      </p>
    </div>
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
