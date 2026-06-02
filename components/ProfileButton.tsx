'use client'

import { useState, useEffect } from 'react'
import { User } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Services = { strava: boolean; hevy: boolean; google: boolean }
type Units = 'metric' | 'imperial'
type NotifStatus = 'default' | 'granted' | 'denied' | 'unsupported'

export function ProfileButton() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [services, setServices] = useState<Services | null>(null)
  const [units, setUnits] = useState<Units>('metric')
  const [notifStatus, setNotifStatus] = useState<NotifStatus>('default')
  const [userId, setUserId] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    const supabase = createClient()

    // Notification permission status
    if ('Notification' in window) {
      setNotifStatus(Notification.permission as NotifStatus)
    } else {
      setNotifStatus('unsupported')
    }

    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null
      setEmail(data.user?.email ?? null)
      setUserId(uid)
      if (!uid) return

      // Connected services
      Promise.all([
        supabase.from('strava_tokens').select('id').eq('user_id', uid).limit(1),
        supabase.from('hevy_workouts').select('id').eq('user_id', uid).limit(1),
        supabase.from('google_calendar_tokens').select('user_id').eq('user_id', uid).limit(1),
      ]).then(([strava, hevy, google]) => {
        setServices({
          strava: (strava.data?.length ?? 0) > 0,
          hevy:   (hevy.data?.length   ?? 0) > 0,
          google: (google.data?.length ?? 0) > 0,
        })
      })

      // Units preference
      supabase.from('user_settings').select('units').eq('user_id', uid).single()
        .then(({ data }) => { if (data?.units) setUnits(data.units as Units) })
    })
  }, [open])

  async function handleSignOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function toggleUnits() {
    if (!userId) return
    const next: Units = units === 'metric' ? 'imperial' : 'metric'
    setUnits(next)
    await createClient()
      .from('user_settings')
      .update({ units: next })
      .eq('user_id', userId)
  }

  async function requestNotifications() {
    if (!('Notification' in window)) return
    if (Notification.permission === 'denied') return
    const result = await Notification.requestPermission()
    setNotifStatus(result as NotifStatus)
  }

  const notifLabel = notifStatus === 'granted' ? 'Enabled'
    : notifStatus === 'denied' ? 'Blocked'
    : notifStatus === 'unsupported' ? 'N/A'
    : 'Ask'

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
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          {/* Nav bar */}
          <div className="flex items-center justify-between px-5 py-4 shrink-0">
            <div className="w-16" />
            <span className="text-[17px] font-semibold text-white">Profile</span>
            <button
              onClick={() => setOpen(false)}
              className="px-4 h-[34px] rounded-full bg-white text-black text-[15px] font-semibold"
            >
              Done
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 pt-2 pb-12 flex flex-col gap-6">

            {/* Profile */}
            <ProfileSection>
              <ProfileRow>
                <div className="flex items-center gap-4 py-1">
                  <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(255,255,255,0.12)' }}>
                    <User size={26} className="text-white/50" />
                  </div>
                  <div>
                    <p className="text-[17px] font-semibold text-white">
                      {email?.split('@')[0] ?? '—'}
                    </p>
                    <p className="text-[14px] text-white/40">{email ?? '—'}</p>
                  </div>
                </div>
              </ProfileRow>
            </ProfileSection>

            {/* Connected Services */}
            <ProfileSection title="Connected Services">
              <ProfileRow separator>
                <ServiceRow icon="🏋️" label="Hevy"
                  connected={services?.hevy} />
              </ProfileRow>
              <ProfileRow separator>
                <ServiceRow icon="🏃" label="Strava"
                  connected={services?.strava} />
              </ProfileRow>
              <ProfileRow>
                <ServiceRow icon="📅" label="Google Calendar"
                  connected={services?.google} />
              </ProfileRow>
            </ProfileSection>

            {/* Preferences */}
            <ProfileSection title="Preferences">
              <ProfileRow separator>
                <button className="flex items-center justify-between w-full" onClick={toggleUnits}>
                  <span className="text-[17px] text-white">Units</span>
                  <span className="text-[15px] text-white/40 capitalize">{units}</span>
                </button>
              </ProfileRow>
              <ProfileRow separator>
                <button
                  className="flex items-center justify-between w-full"
                  onClick={requestNotifications}
                  disabled={notifStatus === 'denied' || notifStatus === 'unsupported'}
                >
                  <span className="text-[17px] text-white">Notifications</span>
                  <span className={`text-[15px] ${notifStatus === 'granted' ? 'text-green-400' : notifStatus === 'denied' ? 'text-red-400' : 'text-white/40'}`}>
                    {notifLabel}
                  </span>
                </button>
              </ProfileRow>
              <ProfileRow>
                <div className="flex items-center justify-between">
                  <span className="text-[17px] text-white">Appearance</span>
                  <span className="text-[15px] text-white/40">Dark</span>
                </div>
              </ProfileRow>
            </ProfileSection>

            {/* Account */}
            <ProfileSection title="Account">
              <ProfileRow separator>
                <button onClick={handleSignOut} className="w-full text-left py-0.5 text-[17px] font-medium text-red-400">
                  Sign Out
                </button>
              </ProfileRow>
              <ProfileRow>
                <button className="w-full text-left py-0.5 text-[17px] font-medium text-red-400/50">
                  Delete Account
                </button>
              </ProfileRow>
            </ProfileSection>

          </div>
        </div>
      )}
    </>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProfileSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {title && (
        <span className="text-[13px] font-medium text-white/40 px-1">{title}</span>
      )}
      <div className="rounded-[14px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        {children}
      </div>
    </div>
  )
}

function ProfileRow({ children, separator }: { children: React.ReactNode; separator?: boolean }) {
  return (
    <div className="px-4 py-3.5" style={{ borderBottom: separator ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
      {children}
    </div>
  )
}

function ServiceRow({ icon, label, connected }: { icon: string; label: string; connected: boolean | undefined }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[18px] w-6 text-center">{icon}</span>
      <span className="flex-1 text-[17px] text-white">{label}</span>
      <span className={`text-[15px] ${connected ? 'text-green-400' : 'text-white/30'}`}>
        {connected === undefined ? '…' : connected ? 'Connected' : 'Not connected'}
      </span>
    </div>
  )
}
