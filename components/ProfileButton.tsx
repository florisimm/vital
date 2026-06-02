'use client'

import { useState, useEffect } from 'react'
import { User, X } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export function ProfileButton() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (open && !email) {
      createClient().auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
    }
  }, [open])

  async function handleSignOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Profile"
        className="w-[34px] h-[34px] rounded-full border border-white/[0.18] flex items-center justify-center"
        style={{ background: 'rgba(255,255,255,0.10)' }}
      >
        <User size={16} className="text-white/70" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgb(5, 6, 8)' }}>
          {/* Nav bar */}
          <div
            className="flex items-center justify-between px-5 pt-4 pb-3 shrink-0"
            style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}
          >
            <div className="w-16" />
            <span className="text-[17px] font-semibold text-white">Profile</span>
            <button
              onClick={() => setOpen(false)}
              className="px-4 h-[34px] rounded-full bg-white text-black text-[15px] font-semibold"
            >
              Done
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-5 pt-3 pb-10 flex flex-col gap-6">

            {/* Profile section */}
            <Section title="Profile">
              <Row>
                <div className="flex items-center gap-4 py-1">
                  <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(255,255,255,0.12)' }}>
                    <User size={26} className="text-white/50" />
                  </div>
                  <div>
                    <p className="text-[17px] font-semibold text-white">
                      {email?.split('@')[0] ?? 'Alex Rivera'}
                    </p>
                    <p className="text-[14px] text-white/40">{email ?? 'alex@vital.app'}</p>
                  </div>
                </div>
              </Row>
            </Section>

            {/* Connected Services */}
            <Section title="Connected Services">
              <Row separator>
                <ServiceRow
                  icon="❤️"
                  label="Apple Health"
                  status="Connected"
                  statusColor="text-green-400"
                />
              </Row>
              <Row separator>
                <ServiceRow
                  icon="⌚"
                  label="Apple Watch"
                  status="Connected"
                  statusColor="text-green-400"
                />
              </Row>
              <Row>
                <ServiceRow
                  icon="🏃"
                  label="Strava"
                  status="Not connected"
                  statusColor="text-white/30"
                />
              </Row>
            </Section>

            {/* Preferences */}
            <Section title="Preferences">
              <Row separator>
                <PrefRow label="Units" value="Metric" />
              </Row>
              <Row separator>
                <PrefRow label="Notifications" value="All" />
              </Row>
              <Row>
                <PrefRow label="Appearance" value="Dark" />
              </Row>
            </Section>

            {/* Account */}
            <Section title="Account">
              <Row separator>
                <button
                  onClick={handleSignOut}
                  className="w-full text-left py-1 text-[17px] font-medium text-red-400"
                >
                  Sign Out
                </button>
              </Row>
              <Row>
                <button className="w-full text-left py-1 text-[17px] font-medium text-red-400/50">
                  Delete Account
                </button>
              </Row>
            </Section>

          </div>
        </div>
      )}
    </>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] font-medium text-white/40 px-1">{title}</span>
      <div className="rounded-[14px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ children, separator }: { children: React.ReactNode; separator?: boolean }) {
  return (
    <div className="px-4 py-3" style={{ borderBottom: separator ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
      {children}
    </div>
  )
}

function ServiceRow({ icon, label, status, statusColor }: {
  icon: string; label: string; status: string; statusColor: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[18px] w-6 text-center">{icon}</span>
      <span className="flex-1 text-[17px] text-white">{label}</span>
      <span className={`text-[15px] ${statusColor}`}>{status}</span>
    </div>
  )
}

function PrefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[17px] text-white">{label}</span>
      <span className="text-[15px] text-white/40">{value}</span>
    </div>
  )
}
