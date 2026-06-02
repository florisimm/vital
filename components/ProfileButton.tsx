'use client'

import { useState } from 'react'
import { User, X, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export function ProfileButton() {
  const [open, setOpen] = useState(false)
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Trigger button — matches Swift ProfileButton */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Profile"
        className="w-[34px] h-[34px] rounded-full border border-white/[0.18] flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.10)' }}
      >
        <User size={16} className="text-white/70" />
      </button>

      {/* Bottom sheet overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          onClick={() => setOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Sheet */}
          <div
            className="relative rounded-t-[28px] px-5 pt-5 pb-10 flex flex-col gap-5"
            style={{ background: 'rgb(12, 14, 16)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="mx-auto w-10 h-1 rounded-full bg-white/20 mb-2" />

            {/* Header */}
            <div className="flex items-center justify-between">
              <span className="text-[22px] font-bold text-white">Profiel</span>
              <button
                onClick={() => setOpen(false)}
                className="w-[30px] h-[30px] rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              >
                <X size={14} className="text-white/70" />
              </button>
            </div>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              className="flex items-center gap-3 py-3"
            >
              <LogOut size={18} className="text-red-400" />
              <span className="text-red-400 font-semibold text-[17px]">Uitloggen</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
