'use client'

import dynamic from 'next/dynamic'
import { type ReactNode } from 'react'

// ProfileButton is 2270 lines — lazy-load it so it never blocks the initial page render.
// The 34×34 placeholder matches the button size to avoid layout shift.
const ProfileButton = dynamic(
  () => import('./ProfileButton').then(m => ({ default: m.ProfileButton })),
  { ssr: false, loading: () => <div className="w-[34px] h-[34px]" /> },
)

export function PremiumScreen({
  title,
  subtitle,
  children,
  contentGap = 22,
  fab,
}: {
  title: string
  subtitle: string
  children: ReactNode
  contentGap?: number
  fab?: ReactNode
}) {
  return (
    <div
      className="min-h-screen px-5 relative"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)',
      }}
    >
      <div className="flex items-start justify-between mb-7">
        <div>
          <p
            className="text-[11px] font-semibold uppercase text-white/50 mb-[6px]"
            style={{ letterSpacing: '0.118em' }}
          >
            {subtitle}
          </p>
          <h1 className="text-[46px] font-bold leading-tight text-white">
            {title}
          </h1>
        </div>
        <div className="pt-1">
          <ProfileButton />
        </div>
      </div>

      <div className="flex flex-col" style={{ gap: contentGap }}>
        {children}
      </div>

      {fab && (
        <div className="fixed bottom-[88px] right-5 z-40">
          {fab}
        </div>
      )}
    </div>
  )
}
