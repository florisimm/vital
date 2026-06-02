import { Suspense, type ReactNode } from 'react'
import { ProfileButton } from './ProfileButton'

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
          <Suspense fallback={<div className="w-[34px] h-[34px]" />}>
            <ProfileButton />
          </Suspense>
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
