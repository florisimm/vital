'use client'

import { useState, useEffect } from 'react'
import { mutate } from 'swr'
import { User, ChevronRight } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Services = { strava: boolean; hevy: boolean; google: boolean; fitbit: boolean }
type Units = 'metric' | 'imperial'
type NotifStatus = 'default' | 'granted' | 'denied' | 'unsupported'

const TRAINING_MODULES = [
  { label: 'Running',     href: '/training/running',     icon: '🏃', desc: 'Runs, pace, zones and records' },
  { label: 'Cycling',     href: '/training/cycling',     icon: '🚴', desc: 'Rides, power, FTP and trends' },
  { label: 'Swimming',    href: '/training/swimming',    icon: '🏊', desc: 'Swims, pace per 100m and volume' },
  { label: 'Strength',    href: '/training/strength',    icon: '🏋️', desc: 'Lifts, muscle groups and recovery' },
  { label: 'History',     href: '/training/history',     icon: '📜', desc: 'Full workout timeline' },
  { label: 'Performance', href: '/training/performance', icon: '📈', desc: 'Score, VO₂max, FTP and projections' },
]

const HEALTH_MODULES = [
  { label: 'Sleep',    href: '/health/sleep',    icon: '😴', desc: 'Duration, quality and trends' },
  { label: 'Recovery', href: '/health/recovery', icon: '🔋', desc: 'Readiness and strain balance' },
  { label: 'Heart',    href: '/health/heart',    icon: '❤️', desc: 'Resting HR and HRV trends' },
  { label: 'Weight',   href: '/health/weight',   icon: '⚖️', desc: 'Body weight history and trends' },
  { label: 'Activity', href: '/health/activity', icon: '👟', desc: 'Steps, rings and active calories' },
]

const ALL_MODULES = [...TRAINING_MODULES, ...HEALTH_MODULES]

export function ProfileButton() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [services, setServices] = useState<Services | null>(null)
  const [units, setUnits] = useState<Units>('metric')
  const [notifStatus, setNotifStatus] = useState<NotifStatus>('default')
  const [userId, setUserId] = useState<string | null>(null)
  const [confirmDisconnect, setConfirmDisconnect] = useState<'strava' | 'google' | 'fitbit' | null>(null)
  const [editingAccount, setEditingAccount] = useState(false)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editPasswordConfirm, setEditPasswordConfirm] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editMsg, setEditMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [editingTargets, setEditingTargets] = useState(false)
  const [stepGoal, setStepGoal] = useState(10000)
  const [squatRef, setSquatRef] = useState(140)
  const [benchRef, setBenchRef] = useState(100)
  const [deadliftRef, setDeadliftRef] = useState(180)
  const [targetsSaving, setTargetsSaving] = useState(false)
  const [editingPages, setEditingPages] = useState(false)
  const [hiddenPages, setHiddenPages] = useState<string[]>([])
  const [pagesSaving, setPagesSaving] = useState(false)
  const [fitbitSyncing, setFitbitSyncing] = useState(false)
  const [fitbitSyncMessage, setFitbitSyncMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const router = useRouter()

  useEffect(() => {
    const nav = document.querySelector('[data-bottom-nav]') as HTMLElement | null
    if (nav) nav.style.display = open ? 'none' : ''
    return () => { if (nav) nav.style.display = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    const supabase = createClient()

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

      Promise.all([
        supabase.from('strava_tokens').select('id').eq('user_id', uid).limit(1),
        supabase.from('hevy_workouts').select('id').eq('user_id', uid).limit(1),
        supabase.from('google_tokens').select('user_id').eq('user_id', uid).limit(1),
        supabase.from('fitbit_tokens').select('user_id').eq('user_id', uid).limit(1),
      ]).then(([strava, hevy, google, fitbit]) => {
        setServices({
          strava:  (strava.data?.length  ?? 0) > 0,
          hevy:    (hevy.data?.length    ?? 0) > 0,
          google:  (google.data?.length  ?? 0) > 0,
          fitbit:  (fitbit.data?.length  ?? 0) > 0,
        })
      })

      supabase.from('user_settings')
        .select('units,step_goal,strength_squat_ref,strength_bench_ref,strength_deadlift_ref,hidden_pages')
        .eq('user_id', uid).single()
        .then(({ data }) => {
          if (data?.units) setUnits(data.units as Units)
          if (data?.step_goal) setStepGoal(data.step_goal)
          if (data?.strength_squat_ref) setSquatRef(data.strength_squat_ref)
          if (data?.strength_bench_ref) setBenchRef(data.strength_bench_ref)
          if (data?.strength_deadlift_ref) setDeadliftRef(data.strength_deadlift_ref)
          setHiddenPages(Array.isArray(data?.hidden_pages) ? data.hidden_pages : [])
        })
    })
  }, [open])

  function openEditAccount() {
    setEditName(email?.split('@')[0] ?? '')
    setEditEmail(email ?? '')
    setEditPassword('')
    setEditPasswordConfirm('')
    setEditMsg(null)
    setEditingAccount(true)
  }

  async function saveAccount() {
    if (editPassword && editPassword !== editPasswordConfirm) {
      setEditMsg({ type: 'err', text: 'Wachtwoorden komen niet overeen' }); return
    }
    if (editPassword && editPassword.length < 6) {
      setEditMsg({ type: 'err', text: 'Wachtwoord moet minimaal 6 tekens zijn' }); return
    }
    setEditSaving(true); setEditMsg(null)
    const supabase = createClient()
    const updates: { email?: string; password?: string; data?: { full_name: string } } = {}
    if (editEmail !== email) updates.email = editEmail
    if (editPassword) updates.password = editPassword
    updates.data = { full_name: editName }
    const { error } = await supabase.auth.updateUser(updates)
    setEditSaving(false)
    if (error) {
      setEditMsg({ type: 'err', text: error.message })
    } else {
      if (updates.email) setEmail(updates.email)
      setEditPassword('')
      setEditPasswordConfirm('')
      setEditMsg({ type: 'ok', text: updates.email ? 'Bevestigingsmail verstuurd naar nieuw adres.' : 'Opgeslagen.' })
    }
  }

  async function handleSignOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function connectGoogleCalendar() {
    if (!userId) return
    window.location.href =
      `https://pzuhodpxqofgzdawoydq.supabase.co/functions/v1/google-calendar-auth?user_id=${userId}`
  }

  function connectFitbit() {
    if (!userId) return
    window.location.href = `/api/fitbit/connect?user_id=${userId}`
  }

  async function syncFitbit() {
    setFitbitSyncing(true)
    setFitbitSyncMessage(null)
    try {
      const res = await fetch('/api/fitbit/sync', { method: 'POST' })
      const data = await res.json().catch(() => null)

      if (!res.ok || !data?.ok) {
        const apiError = Array.isArray(data?.errors) && data.errors.length ? String(data.errors[0]) : null
        setFitbitSyncMessage({
          type: 'err',
          text: data?.error === 'not connected'
            ? 'Fitbit is nog niet gekoppeld.'
            : apiError
              ? `Sync fout: ${apiError}`
              : 'Fitbit sync mislukt.',
        })
        return
      }

      mutate('health-gezondheid')
      mutate('today')

      const errorCount = Array.isArray(data.errors) ? data.errors.length : 0
      setFitbitSyncMessage({
        type: errorCount ? 'err' : 'ok',
        text: errorCount
          ? `Sync met ${errorCount} fout${errorCount === 1 ? '' : 'en'}.`
          : `Fitbit bijgewerkt: ${data.healthSynced ?? 0} health rows, ${data.stepsSynced ?? 0} step days.`,
      })
    } finally {
      setFitbitSyncing(false)
    }
  }

  async function handleDisconnect() {
    if (!userId || !confirmDisconnect) return
    const supabase = createClient()
    if (confirmDisconnect === 'google') {
      await supabase.from('google_tokens').delete().eq('user_id', userId)
      setServices(s => s ? { ...s, google: false } : s)
    } else if (confirmDisconnect === 'strava') {
      await supabase.from('strava_tokens').delete().eq('user_id', userId)
      setServices(s => s ? { ...s, strava: false } : s)
    } else if (confirmDisconnect === 'fitbit') {
      await supabase.from('fitbit_tokens').delete().eq('user_id', userId)
      setServices(s => s ? { ...s, fitbit: false } : s)
    }
    setConfirmDisconnect(null)
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

  async function saveTargets() {
    if (!userId) return
    setTargetsSaving(true)
    await createClient()
      .from('user_settings')
      .update({ step_goal: stepGoal, strength_squat_ref: squatRef, strength_bench_ref: benchRef, strength_deadlift_ref: deadliftRef })
      .eq('user_id', userId)
    setTargetsSaving(false)
    setEditingTargets(false)
  }

  async function savePages() {
    if (!userId) return
    setPagesSaving(true)
    await createClient()
      .from('user_settings')
      .update({ hidden_pages: hiddenPages })
      .eq('user_id', userId)
    mutate('user-settings-pages', hiddenPages, false)
    setPagesSaving(false)
    setEditingPages(false)
  }

  function togglePage(href: string) {
    setHiddenPages(prev => prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href])
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

  const disconnectLabel = confirmDisconnect === 'strava' ? 'Strava' : confirmDisconnect === 'fitbit' ? 'Fitbit' : 'Google Calendar'

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
          className="fixed inset-0 z-[9999] flex flex-col"
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

          {/* Edit account overlay */}
          {editingAccount && (
            <div className="absolute inset-0 z-10 flex flex-col"
              style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
              <div className="flex items-center justify-between px-5 py-4 shrink-0">
                <button onClick={() => setEditingAccount(false)}
                  className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.10)' }}>
                  Terug
                </button>
                <span className="text-[17px] font-semibold text-white">Account</span>
                <button onClick={saveAccount} disabled={editSaving}
                  className="px-4 h-[34px] rounded-full bg-white text-black text-[15px] font-semibold disabled:opacity-50">
                  {editSaving ? '…' : 'Opslaan'}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pt-4 pb-12 flex flex-col gap-4">
                <ProfileSection title="Naam">
                  <ProfileRow>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Naam"
                      className="w-full bg-transparent text-white text-[17px] outline-none placeholder:text-white/30"
                    />
                  </ProfileRow>
                </ProfileSection>
                <ProfileSection title="E-mailadres">
                  <ProfileRow>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={e => setEditEmail(e.target.value)}
                      placeholder="E-mailadres"
                      className="w-full bg-transparent text-white text-[17px] outline-none placeholder:text-white/30"
                    />
                  </ProfileRow>
                </ProfileSection>
                <ProfileSection title="Wachtwoord">
                  <ProfileRow separator>
                    <input
                      type="password"
                      value={editPassword}
                      onChange={e => setEditPassword(e.target.value)}
                      placeholder="Nieuw wachtwoord"
                      className="w-full bg-transparent text-white text-[17px] outline-none placeholder:text-white/30"
                    />
                  </ProfileRow>
                  <ProfileRow>
                    <input
                      type="password"
                      value={editPasswordConfirm}
                      onChange={e => setEditPasswordConfirm(e.target.value)}
                      placeholder="Bevestig wachtwoord"
                      className="w-full bg-transparent text-white text-[17px] outline-none placeholder:text-white/30"
                    />
                  </ProfileRow>
                </ProfileSection>
                {editMsg && (
                  <p className={`text-[14px] text-center ${editMsg.type === 'ok' ? 'text-teal-400' : 'text-red-400'}`}>
                    {editMsg.text}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Targets editing overlay */}
          {editingTargets && (
            <div className="absolute inset-0 z-10 flex flex-col"
              style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
              <div className="flex items-center justify-between px-5 py-4 shrink-0">
                <button onClick={() => setEditingTargets(false)}
                  className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.10)' }}>
                  Terug
                </button>
                <span className="text-[17px] font-semibold text-white">Targets</span>
                <button onClick={saveTargets} disabled={targetsSaving}
                  className="px-4 h-[34px] rounded-full bg-white text-black text-[15px] font-semibold disabled:opacity-50">
                  {targetsSaving ? '…' : 'Opslaan'}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pt-4 pb-12 flex flex-col gap-4">
                <ProfileSection title="Activiteit">
                  <ProfileRow>
                    <div className="flex items-center justify-between">
                      <span className="text-[17px] text-white">Stappendoel</span>
                      <input
                        type="number"
                        value={stepGoal}
                        onChange={e => setStepGoal(Number(e.target.value))}
                        className="w-24 bg-transparent text-white text-[17px] text-right outline-none"
                      />
                    </div>
                  </ProfileRow>
                </ProfileSection>
                <ProfileSection title="Kracht-standaarden (kg)">
                  <ProfileRow separator>
                    <div className="flex items-center justify-between">
                      <span className="text-[17px] text-white">Squat</span>
                      <input type="number" value={squatRef} onChange={e => setSquatRef(Number(e.target.value))}
                        className="w-20 bg-transparent text-white text-[17px] text-right outline-none" />
                    </div>
                  </ProfileRow>
                  <ProfileRow separator>
                    <div className="flex items-center justify-between">
                      <span className="text-[17px] text-white">Bench Press</span>
                      <input type="number" value={benchRef} onChange={e => setBenchRef(Number(e.target.value))}
                        className="w-20 bg-transparent text-white text-[17px] text-right outline-none" />
                    </div>
                  </ProfileRow>
                  <ProfileRow>
                    <div className="flex items-center justify-between">
                      <span className="text-[17px] text-white">Deadlift</span>
                      <input type="number" value={deadliftRef} onChange={e => setDeadliftRef(Number(e.target.value))}
                        className="w-20 bg-transparent text-white text-[17px] text-right outline-none" />
                    </div>
                  </ProfileRow>
                </ProfileSection>
              </div>
            </div>
          )}

          {/* Pages overlay */}
          {editingPages && (() => {
            const activeCount = ALL_MODULES.length - hiddenPages.length
            const onlyOne = activeCount === 1

            const ModuleRow = ({ label, href, icon, desc, isLast }: { label: string; href: string; icon: string; desc: string; isLast: boolean }) => {
              const hidden = hiddenPages.includes(href)
              const disableToggle = !hidden && onlyOne
              return (
                <div
                  className="px-4 py-3.5 transition-all duration-200"
                  style={{
                    opacity: hidden ? 0.38 : 1,
                    background: hidden ? 'rgba(0,0,0,0.18)' : 'transparent',
                    borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div className="flex items-center gap-3.5">
                    <span className="text-[22px] w-8 text-center shrink-0 leading-none"
                      style={{ filter: hidden ? 'grayscale(1) opacity(0.5)' : 'none', transition: 'filter 0.2s' }}>
                      {icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[16px] font-semibold text-white leading-tight">{label}</p>
                      <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{desc}</p>
                    </div>
                    <button onClick={() => !disableToggle && togglePage(href)} disabled={disableToggle} className="shrink-0 active:scale-95 transition-transform">
                      <div className={`w-[44px] h-[26px] rounded-full relative transition-colors duration-250 ${!hidden ? 'bg-teal-400' : 'bg-white/15'}`}>
                        <div className={`absolute top-[3px] w-5 h-5 rounded-full bg-white transition-all duration-250 ${!hidden ? 'left-[21px]' : 'left-[3px]'}`}
                          style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.35)' }} />
                      </div>
                    </button>
                  </div>
                </div>
              )
            }

            return (
              <div className="absolute inset-0 z-10 flex flex-col"
                style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>

                {/* Nav */}
                <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
                  <button onClick={() => setEditingPages(false)}
                    className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
                    style={{ background: 'rgba(255,255,255,0.10)' }}>
                    Terug
                  </button>
                  <button onClick={savePages} disabled={pagesSaving}
                    className="px-4 h-[34px] rounded-full bg-white text-black text-[15px] font-semibold disabled:opacity-50">
                    {pagesSaving ? '…' : 'Opslaan'}
                  </button>
                </div>

                {/* Title block */}
                <div className="px-5 pt-3 pb-5 shrink-0 flex items-end justify-between">
                  <div>
                    <h1 className="text-[28px] font-bold text-white leading-tight">Pages</h1>
                    <p className="text-[13px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      Choose which modules appear in your dashboard
                    </p>
                  </div>
                  <div className="pb-0.5 text-right shrink-0 ml-4">
                    <span className="text-[13px] font-semibold text-teal-400">
                      {activeCount} of {ALL_MODULES.length} active
                    </span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 pb-12 flex flex-col gap-5" style={{ scrollbarWidth: 'none' }}>

                  {/* Training section */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold px-1 tracking-[0.12em]"
                      style={{ color: 'rgba(255,255,255,0.28)' }}>
                      TRAINING · {TRAINING_MODULES.length} MODULES
                    </span>
                    <div className="rounded-[18px] overflow-hidden"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      {TRAINING_MODULES.map((m, i) => (
                        <ModuleRow key={m.href} {...m} isLast={i === TRAINING_MODULES.length - 1} />
                      ))}
                    </div>
                  </div>

                  {/* Health section */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold px-1 tracking-[0.12em]"
                      style={{ color: 'rgba(255,255,255,0.28)' }}>
                      HEALTH · {HEALTH_MODULES.length} MODULES
                    </span>
                    <div className="rounded-[18px] overflow-hidden"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      {HEALTH_MODULES.map((m, i) => (
                        <ModuleRow key={m.href} {...m} isLast={i === HEALTH_MODULES.length - 1} />
                      ))}
                    </div>
                  </div>

                  {/* Warning — only 1 active */}
                  {onlyOne && (
                    <div className="rounded-[14px] px-4 py-3.5 flex items-center gap-3"
                      style={{ background: 'rgba(251,146,60,0.10)', border: '1px solid rgba(251,146,60,0.22)' }}>
                      <span className="text-[18px] shrink-0">⚠️</span>
                      <p className="text-[13px] font-medium text-orange-400">
                        At least one module must remain active.
                      </p>
                    </div>
                  )}

                </div>
              </div>
            )
          })()}

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 pt-2 pb-12 flex flex-col gap-6">

            {/* Profile */}
            <ProfileSection>
              <ProfileRow>
                <button className="flex items-center gap-4 py-1 w-full text-left active:opacity-70" onClick={openEditAccount}>
                  <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(255,255,255,0.12)' }}>
                    <User size={26} className="text-white/50" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[17px] font-semibold text-white">
                      {email?.split('@')[0] ?? '—'}
                    </p>
                    <p className="text-[14px] text-white/40">{email ?? '—'}</p>
                  </div>
                  <ChevronRight size={18} className="text-white/25 shrink-0" />
                </button>
              </ProfileRow>
            </ProfileSection>

            {/* Connected Services */}
            <ProfileSection title="Connected Services">
              <ProfileRow separator>
                <ServiceRow icon="🏋️" label="Hevy" connected={services?.hevy} />
              </ProfileRow>
              <ProfileRow separator>
                <ServiceRow icon="🏃" label="Strava"
                  connected={services?.strava}
                  onDisconnect={services?.strava === true ? () => setConfirmDisconnect('strava') : undefined} />
              </ProfileRow>
              <ProfileRow separator>
                <ServiceRow icon="📅" label="Google Calendar"
                  connected={services?.google}
                  onConnect={services?.google === false ? connectGoogleCalendar : undefined}
                  onDisconnect={services?.google === true ? () => setConfirmDisconnect('google') : undefined} />
              </ProfileRow>
              <ProfileRow>
                <div className="flex items-center gap-3">
                  <span className="text-[18px] w-6 text-center">⌚</span>
                  <span className="flex-1 text-[17px] text-white">Fitbit</span>
                  {services?.fitbit === false && (
                    <button onClick={connectFitbit} className="text-[15px] font-semibold text-teal-400 active:opacity-60">
                      Connect
                    </button>
                  )}
                  {services?.fitbit === true && (
                    <>
                      <button
                        onClick={syncFitbit}
                        disabled={fitbitSyncing}
                        className="text-[15px] font-semibold text-teal-400 active:opacity-60 disabled:opacity-50"
                      >
                        {fitbitSyncing ? 'Syncing…' : 'Sync'}
                      </button>
                      <button onClick={() => setConfirmDisconnect('fitbit')} className="text-[15px] font-semibold text-green-400 active:opacity-60">
                        Connected
                      </button>
                    </>
                  )}
                  {services?.fitbit === undefined && (
                    <span className="text-[15px] text-white/30">…</span>
                  )}
                </div>
              </ProfileRow>
            </ProfileSection>
            {fitbitSyncMessage && (
              <p className={`-mt-3 px-1 text-[13px] ${fitbitSyncMessage.type === 'ok' ? 'text-teal-400' : 'text-orange-300'}`}>
                {fitbitSyncMessage.text}
              </p>
            )}

            {/* Preferences */}
            <ProfileSection title="Preferences">
              <ProfileRow separator>
                <button className="flex items-center justify-between w-full" onClick={() => setEditingTargets(true)}>
                  <span className="text-[17px] text-white">Targets & Standards</span>
                  <ChevronRight size={18} className="text-white/25 shrink-0" />
                </button>
              </ProfileRow>
              <ProfileRow separator>
                <button className="flex items-center justify-between w-full" onClick={() => setEditingPages(true)}>
                  <span className="text-[17px] text-white">Pagina's</span>
                  <ChevronRight size={18} className="text-white/25 shrink-0" />
                </button>
              </ProfileRow>
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

      {confirmDisconnect && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center pb-8 px-5"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setConfirmDisconnect(null)}
        >
          <div className="w-full max-w-sm flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <div className="rounded-[14px] overflow-hidden" style={{ background: 'rgba(30,30,30,0.98)' }}>
              <div className="px-5 pt-5 pb-4 text-center border-b border-white/[0.08]">
                <p className="text-[17px] font-semibold text-white mb-1">{disconnectLabel} loskoppelen</p>
                <p className="text-[13px] text-white/50">Je data wordt niet meer gesynchroniseerd.</p>
              </div>
              <button
                onClick={handleDisconnect}
                className="w-full py-4 text-[17px] font-semibold text-red-400 text-center"
              >
                Loskoppelen
              </button>
            </div>
            <button
              onClick={() => setConfirmDisconnect(null)}
              className="w-full py-4 rounded-[14px] text-[17px] font-semibold text-white text-center"
              style={{ background: 'rgba(30,30,30,0.98)' }}
            >
              Annuleren
            </button>
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

function ServiceRow({ icon, label, connected, onConnect, onDisconnect }: { icon: string; label: string; connected: boolean | undefined; onConnect?: () => void; onDisconnect?: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[18px] w-6 text-center">{icon}</span>
      <span className="flex-1 text-[17px] text-white">{label}</span>
      {onConnect ? (
        <button onClick={onConnect} className="text-[15px] font-semibold text-teal-400 active:opacity-60">
          Connect
        </button>
      ) : onDisconnect ? (
        <button onClick={onDisconnect} className="text-[15px] font-semibold text-green-400 active:opacity-60">
          Connected
        </button>
      ) : (
        <span className={`text-[15px] ${connected ? 'text-green-400' : 'text-white/30'}`}>
          {connected === undefined ? '…' : connected ? 'Connected' : 'Not connected'}
        </span>
      )}
    </div>
  )
}
