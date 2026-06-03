'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MessageSquare, PersonStanding, Heart, Utensils } from 'lucide-react'

const tabs = [
  { href: '/',         label: 'Today',    Icon: Home },
  { href: '/coach',    label: 'Coach',    Icon: MessageSquare },
  { href: '/training', label: 'Training', Icon: PersonStanding },
  { href: '/health',   label: 'Health',   Icon: Heart },
  { href: '/food',     label: 'Food',     Icon: Utensils },
]

export function BottomNav() {
  const pathname = usePathname()

  if (pathname === '/training/session' || pathname === '/login') return null

  return (
    <div
      data-bottom-nav
      className="fixed bottom-0 inset-x-0 z-[60] flex justify-center"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}
    >
      <nav
        className="flex items-center p-1 gap-0.5"
        style={{
          background: 'rgba(38,38,42,0.78)',
          backdropFilter: 'blur(24px) saturate(180%)',
          WebkitBackdropFilter: 'blur(24px) saturate(180%)',
          borderRadius: '999px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 0.5px 0 rgba(255,255,255,0.15), inset 0 -0.5px 0 rgba(0,0,0,0.2)',
          border: '1px solid rgba(255,255,255,0.09)',
        }}
      >
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              prefetch={true}
              className="flex flex-col items-center gap-[3px] px-[14px] py-[9px] rounded-full transition-all duration-200"
              style={active ? { background: 'rgba(255,255,255,0.13)' } : {}}
            >
              <Icon
                size={21}
                strokeWidth={active ? 2.2 : 1.7}
                className={active ? 'text-white' : 'text-white/55'}
              />
              <span
                className="text-[10px] font-semibold leading-none"
                style={{ color: active ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.55)' }}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
