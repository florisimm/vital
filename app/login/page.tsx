'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
      className="min-h-screen flex items-center justify-center px-5"
      style={{
        background:
          'radial-gradient(circle at 100% 0%, rgba(0,210,220,0.20) 0%, transparent 55%), ' +
          'radial-gradient(circle at 0% 100%, rgba(255,120,0,0.10) 0%, transparent 60%), ' +
          'rgb(5, 6, 8)',
      }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <p
            className="text-[11px] font-semibold uppercase text-white/50 mb-[6px]"
            style={{ letterSpacing: '0.118em' }}
          >
            Welcome back
          </p>
          <h1 className="text-[46px] font-bold leading-tight text-white">Vital</h1>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-[52px] px-4 rounded-[18px] text-white placeholder:text-white/30 outline-none text-[17px] border border-white/[0.09]"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          />
          <input
            type="password"
            placeholder="Wachtwoord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-[52px] px-4 rounded-[18px] text-white placeholder:text-white/30 outline-none text-[17px] border border-white/[0.09]"
            style={{ background: 'rgba(255,255,255,0.08)' }}
          />

          {error && (
            <p className="text-red-400 text-[14px] text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="h-[54px] rounded-[18px] bg-white text-black font-semibold text-[17px] mt-2 disabled:opacity-50"
          >
            {loading ? 'Inloggen…' : 'Inloggen'}
          </button>
        </form>
      </div>
    </div>
  )
}
