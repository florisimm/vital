'use client'

import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'

export function DetailScreen({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter()

  return (
    <div
      className="min-h-screen px-5"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 14px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)',
      }}
    >
      {/* Nav bar: back + centered title */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-white/70 active:text-white transition-colors"
        >
          <ChevronLeft size={22} strokeWidth={2.2} />
        </button>
        <span className="text-[17px] font-semibold text-white absolute left-1/2 -translate-x-1/2">
          {title}
        </span>
        {/* Spacer to balance the back button */}
        <div className="w-6" />
      </div>

      <div className="flex flex-col gap-6">
        {children}
      </div>
    </div>
  )
}
