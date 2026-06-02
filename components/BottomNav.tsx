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

  return (
    <div
      className="fixed bottom-0 inset-x-0 z-50 flex justify-center"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
    >
      <nav
        className="flex items-center px-2 py-1.5 gap-1"
        style={{
          background: 'rgba(30, 30, 30, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '999px',
        }}
      >
        {tabs.map(({ href, label, Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              prefetch={true}
              className="flex flex-col items-center gap-[3px] px-4 py-2 rounded-full transition-all"
              style={active ? { background: 'rgba(255,255,255,0.15)' } : {}}
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.2 : 1.8}
                className={active ? 'text-white' : 'text-white/60'}
              />
              <span className={`text-[10px] font-semibold ${active ? 'text-white' : 'text-white/60'}`}>
                {label}
              </span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
