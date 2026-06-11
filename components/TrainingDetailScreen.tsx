'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase'

const ALL_CATEGORIES = [
  { label: 'Running',     href: '/training/running'     },
  { label: 'Cycling',     href: '/training/cycling'     },
  { label: 'Swimming',    href: '/training/swimming'    },
  { label: 'Strength',    href: '/training/strength'    },
  { label: 'Log',         href: '/training/history'     },
  { label: 'Metrics',    href: '/training/performance' },
]

async function fetchHiddenPages(): Promise<string[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase.from('user_settings').select('hidden_pages').eq('user_id', user.id).single()
  return Array.isArray(data?.hidden_pages) ? data.hidden_pages : []
}

export function TrainingDetailScreen({
  title,
  active,
  children,
}: {
  title: string
  active: string
  children: ReactNode
}) {
  const router = useRouter()
  const { data: hiddenPages = [] } = useSWR('user-settings-pages', fetchHiddenPages, { revalidateOnFocus: false, dedupingInterval: 300_000 })
  const CATEGORIES = ALL_CATEGORIES.filter(c => !hiddenPages.includes(c.href))

  return (
    <div
      className="min-h-screen px-5"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)',
      }}
    >
      {/* Nav bar */}
      <div className="relative flex items-center justify-between mb-5">
        <button onClick={() => router.push('/training')} className="text-white/70">
          <ChevronLeft size={22} strokeWidth={2.2} />
        </button>
        <span className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold text-white">
          {title}
        </span>
        <div className="w-6" />
      </div>

      {/* Category strip */}
      <div className="flex gap-2.5 overflow-x-auto pb-4" style={{ scrollbarWidth: 'none' }}>
        {CATEGORIES.map(({ label, href }) => (
          <Link
            key={label}
            href={href}
            prefetch={true}
            className="whitespace-nowrap px-4 py-2.5 rounded-full text-[15px] font-semibold shrink-0 transition-all"
            style={
              label === active
                ? { background: 'white', color: 'black' }
                : { background: 'rgba(255,255,255,0.08)', color: 'white' }
            }
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Content */}
      <div className="flex flex-col gap-6">
        {children}
      </div>
    </div>
  )
}
