'use client'

import { useState, useEffect, useRef } from 'react'
import useSWR, { mutate } from 'swr'
import { User, ChevronRight, Dumbbell, Flame, Cable, SlidersHorizontal, LogOut, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { fetchServices } from '@/lib/services'
import {
  computeZones,
  suggestZoneTargets,
  computeWeekProgress,
  getISOWeek,
  type ZoneTargets,
} from '@/lib/training-plan'

type Units = 'metric' | 'imperial'
type NotifStatus = 'default' | 'granted' | 'denied' | 'unsupported'

export function ProfileButton() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const { data: services, mutate: mutateServices } = useSWR('profile-services', fetchServices, { revalidateOnFocus: false, dedupingInterval: 300_000 })
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
  const [fitbitSyncing, setFitbitSyncing] = useState(false)
  const [fitbitSyncMessage, setFitbitSyncMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [timeFormat, setTimeFormat] = useState<'24h' | '12h'>('24h')
  const [addBurned, setAddBurned] = useState(false)

  // Training preferences
  const [editingTraining, setEditingTraining] = useState(false)
  const [trainingSaving, setTrainingSaving] = useState(false)
  const [trainingGoal, setTrainingGoal] = useState<string | null>(null)
  const [trainingFrequencies, setTrainingFrequencies] = useState<Record<string, number>>({ gym: 0, running: 0, cycling: 0, swimming: 0 })
  const [trainingIntensity, setTrainingIntensity] = useState<string>('moderate')
  const [sportOrder, setSportOrder] = useState<string[]>(['running', 'cycling', 'swimming', 'gym'])
  const [injuries, setInjuries] = useState<Record<string, boolean>>({ running: false, cycling: false, swimming: false, gym: false })
  const [selfPlanned, setSelfPlanned] = useState<Record<string, boolean>>({})
  const [activeSport, setActiveSport] = useState<string | null>(null)
  const [sportActivities, setSportActivities] = useState<any[]>([])
  const [zoneTargets, setZoneTargets] = useState<Record<string, ZoneTargets>>({})
  const [goalOrder, setGoalOrder] = useState<string[]>(['lose_weight', 'build_muscle', 'get_fitter', 'maintain', 'performance'])
  const [draggingGoalKey, setDraggingGoalKey] = useState<string | null>(null)
  const dragGoalKeyRef = useRef<string | null>(null)
  const dragGoalContainerRef = useRef<HTMLDivElement | null>(null)

  // Macro calculator
  const [editingMacroMode, setEditingMacroMode] = useState(false)
  const [editingMacroCalc, setEditingMacroCalc] = useState(false)
  const [editingMacroManual, setEditingMacroManual] = useState(false)
  const [calcStep, setCalcStep] = useState(0)
  const [calcGoal, setCalcGoal] = useState<'lose' | 'maintain' | 'gain' | null>(null)
  const [calcGender, setCalcGender] = useState<'male' | 'female' | null>(null)
  const [calcAge, setCalcAge] = useState('')
  const [calcHeight, setCalcHeight] = useState('')
  const [calcWeight, setCalcWeight] = useState('')
  const [calcSaving, setCalcSaving] = useState(false)
  const [calcSaved, setCalcSaved] = useState(false)
  const [calcTargetKg, setCalcTargetKg] = useState('')
  const [calcTargetWeeks, setCalcTargetWeeks] = useState('')
  const [savedCalcHeight, setSavedCalcHeight] = useState('')
  const [savedCalcAge, setSavedCalcAge] = useState('')
  const [savedCalcGender, setSavedCalcGender] = useState<'male' | 'female' | null>(null)
  const [savedCalcGoal, setSavedCalcGoal] = useState<'lose' | 'maintain' | 'gain' | null>(null)
  const [savedCalcTargetKg, setSavedCalcTargetKg] = useState('')
  const [savedCalcTargetWeeks, setSavedCalcTargetWeeks] = useState('')
  const [manualKcal, setManualKcal] = useState('')
  const [manualProtein, setManualProtein] = useState('')
  const [manualCarbs, setManualCarbs] = useState('')
  const [manualFat, setManualFat] = useState('')
  const [manualSaving, setManualSaving] = useState(false)
  const [savedMacroKcal, setSavedMacroKcal] = useState(0)
  const [savedMacroProtein, setSavedMacroProtein] = useState(0)
  const [savedMacroCarbs, setSavedMacroCarbs] = useState(0)
  const [savedMacroFat, setSavedMacroFat] = useState(0)
  const [estimatedMaint, setEstimatedMaint] = useState<{ kcal: number; protein: number; carbs: number; fat: number; sessionsPerWeek: number } | null>(null)
  const [editingDevices, setEditingDevices] = useState(false)
  const [editingSettings, setEditingSettings] = useState(false)
  const [emailActionSheet, setEmailActionSheet] = useState(false)
  const [editingAccountInfo, setEditingAccountInfo] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [editingEmail, setEditingEmail] = useState(false)
  const [editingPassword, setEditingPassword] = useState(false)
  const [editCurrentPassword, setEditCurrentPassword] = useState('')
  const [passwordStep, setPasswordStep] = useState<'current' | 'new'>('current')
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteStep, setDeleteStep] = useState<'password' | 'confirm'>('password')
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteMsg, setDeleteMsg] = useState<string | null>(null)
  const [hevySyncing, setHevySyncing] = useState(false)
  const [showHevyInput, setShowHevyInput] = useState(false)
  const [hevyKeyInput, setHevyKeyInput] = useState('')
  const [hevyKeySaving, setHevyKeySaving] = useState(false)
  const [shortcutToken, setShortcutToken] = useState<string | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)

  const { data: healthRows = [] } = useSWR<any[]>('health-gezondheid')
  const router = useRouter()

  useEffect(() => {
    const nav = document.querySelector('[data-bottom-nav]') as HTMLElement | null
    if (nav) nav.style.display = open ? 'none' : ''
    return () => { if (nav) nav.style.display = '' }
  }, [open])

  // Allow any empty-state or checklist anywhere in the app to deep-link straight
  // into the Devices & Apps section: window.dispatchEvent(new Event('kern:open-devices'))
  useEffect(() => {
    function openDevices() { setOpen(true); setEditingDevices(true) }
    window.addEventListener('kern:open-devices', openDevices)
    return () => window.removeEventListener('kern:open-devices', openDevices)
  }, [])

  useEffect(() => {
    if (!open) return
    setTimeFormat((localStorage.getItem('time_format') as '24h' | '12h') ?? '24h')
    setAddBurned(localStorage.getItem('add_burned_to_target') === '1')
    const supabase = createClient()

    if ('Notification' in window) {
      setNotifStatus(Notification.permission as NotifStatus)
    } else {
      setNotifStatus('unsupported')
    }

    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null
      setEmail(data.user?.email ?? null)
      setEditName(data.user?.user_metadata?.full_name ?? data.user?.email?.split('@')[0] ?? '')
      setUserId(uid)
      if (!uid) return

      supabase.from('user_settings')
        .select('units,step_goal,strength_squat_ref,strength_bench_ref,strength_deadlift_ref,height_cm,age,gender,macro_kcal,macro_protein,macro_carbs,macro_fat,macro_goal,training_goal,training_frequencies,training_intensity,training_sport_priority,training_goal_priority,training_injuries,training_self_planned,training_zone_targets')
        .eq('user_id', uid).single()
        .then(({ data }) => {
          if (data?.units) setUnits(data.units as Units)
          if (data?.step_goal) setStepGoal(data.step_goal)
          if (data?.strength_squat_ref) setSquatRef(data.strength_squat_ref)
          if (data?.strength_bench_ref) setBenchRef(data.strength_bench_ref)
          if (data?.strength_deadlift_ref) setDeadliftRef(data.strength_deadlift_ref)
if (data?.height_cm) setSavedCalcHeight(String(Math.round(Number(data.height_cm))))
          if (data?.age) setSavedCalcAge(String(data.age))
          if (data?.gender === 'male' || data?.gender === 'female') setSavedCalcGender(data.gender)
          if (data?.macro_kcal) setSavedMacroKcal(data.macro_kcal)
          if (data?.macro_protein) setSavedMacroProtein(data.macro_protein)
          if (data?.macro_carbs) setSavedMacroCarbs(data.macro_carbs)
          if (data?.macro_fat) setSavedMacroFat(data.macro_fat)
          if (data?.macro_goal === 'lose' || data?.macro_goal === 'maintain' || data?.macro_goal === 'gain')
            setSavedCalcGoal(data.macro_goal)
          if (data?.training_goal) setTrainingGoal(data.training_goal)
          if (data?.training_frequencies && typeof data.training_frequencies === 'object')
            setTrainingFrequencies({ gym: 0, running: 0, cycling: 0, swimming: 0, ...data.training_frequencies })
          if (data?.training_intensity) setTrainingIntensity(data.training_intensity)
          if (Array.isArray(data?.training_sport_priority) && data.training_sport_priority.length > 0)
            setSportOrder(data.training_sport_priority)
          if (Array.isArray(data?.training_goal_priority) && data.training_goal_priority.length > 0)
            setGoalOrder(data.training_goal_priority)
          if (data?.training_injuries && typeof data.training_injuries === 'object')
            setInjuries(prev => ({ ...prev, ...data.training_injuries }))
          if (data?.training_self_planned && typeof data.training_self_planned === 'object')
            setSelfPlanned(data.training_self_planned)
          if (data?.training_zone_targets && typeof data.training_zone_targets === 'object')
            setZoneTargets(data.training_zone_targets)

          // Estimated maintenance from actual recent training
          const hCm = Number(data?.height_cm) || 0
          const ageVal = Number(data?.age) || 0
          const genderVal = data?.gender
          if (hCm && ageVal && (genderVal === 'male' || genderVal === 'female')) {
            const since28 = new Date(Date.now() - 28 * 86400000).toISOString()
            Promise.all([
              supabase.from('strava_activities').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('start_date', since28),
              supabase.from('hevy_workouts').select('id', { count: 'exact', head: true }).eq('user_id', uid).gte('start_time', since28),
              supabase.from('gezondheid').select('gewicht').eq('user_id', uid).not('gewicht', 'is', null).order('datum', { ascending: false }).limit(1).maybeSingle(),
            ]).then(([strava, hevy, weightRow]) => {
              const wKg = Number((weightRow as any)?.data?.gewicht) || 0
              if (!wKg) return
              const sessionsPerWeek = ((strava.count ?? 0) + (hevy.count ?? 0)) / 4
              const mult = sessionsPerWeek === 0 ? 1.2 : sessionsPerWeek <= 3 ? 1.375 : sessionsPerWeek <= 6 ? 1.55 : sessionsPerWeek <= 10 ? 1.725 : 1.9
              const bmr = 10 * wKg + 6.25 * hCm - 5 * ageVal + (genderVal === 'male' ? 5 : -161)
              const kcal = Math.round(bmr * mult / 10) * 10
              const protein = Math.round(wKg * 1.8)
              const fat = Math.round(kcal * 0.25 / 9)
              const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
              setEstimatedMaint({ kcal, protein, carbs, fat, sessionsPerWeek: Math.round(sessionsPerWeek * 10) / 10 })
            })
          }
        })

      // Auto-detect injuries from calendar events and recent Strava activities
      const SPORT_KEYWORDS: Record<string, string[]> = {
        running:  ['hardlopen', 'lopen', 'run', 'running'],
        cycling:  ['fietsen', 'fiets', 'bike', 'cycling', 'koers', 'wielren'],
        swimming: ['zwemmen', 'zwem', 'swim', 'swimming', 'pool'],
        gym:      ['gym', 'krachttraining', 'fitness', 'weight'],
      }
      Promise.all([
        supabase.from('calendar_events').select('title').eq('user_id', uid).gte('start_time', new Date(Date.now() - 14 * 86400000).toISOString()),
        supabase.from('strava_activities').select('name').eq('user_id', uid).gte('start_date', new Date(Date.now() - 14 * 86400000).toISOString()),
      ]).then(([cal, strava]) => {
        const allNames = [
          ...(cal.data ?? []).map(e => e.title ?? ''),
          ...(strava.data ?? []).map(a => a.name ?? ''),
        ]
        const detected: Record<string, boolean> = {}
        for (const name of allNames) {
          const lower = name.toLowerCase()
          if (!lower.includes('blessure') && !lower.includes('injured') && !lower.includes('injury')) continue
          for (const [sport, kws] of Object.entries(SPORT_KEYWORDS)) {
            if (kws.some(kw => lower.includes(kw))) detected[sport] = true
          }
        }
        if (Object.keys(detected).length > 0)
          setInjuries(prev => ({ ...prev, ...detected }))
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

  async function loadShortcutToken() {
    if (!userId) return
    const supabase = createClient()
    const { data } = await supabase.from('shortcut_tokens').select('token').eq('user_id', userId).maybeSingle()
    if (data?.token) { setShortcutToken(data.token); return }
    const { data: created } = await supabase.from('shortcut_tokens').insert({ user_id: userId }).select('token').single()
    if (created?.token) setShortcutToken(created.token)
  }

  function maskEmail(addr: string): string {
    const at = addr.indexOf('@')
    if (at < 0) return addr
    const local = addr.slice(0, at)
    const domain = addr.slice(at)
    if (local.length <= 2) return addr
    return local[0] + '*'.repeat(local.length - 2) + local[local.length - 1] + domain
  }

  async function saveName() {
    if (!userId) return
    setEditSaving(true); setEditMsg(null)
    const { error } = await createClient().auth.updateUser({ data: { full_name: editName } })
    setEditSaving(false)
    if (error) {
      setEditMsg({ type: 'err', text: error.message })
    } else {
      setEditMsg({ type: 'ok', text: 'Name saved.' })
      setTimeout(() => { setEditingName(false); setEditMsg(null) }, 800)
    }
  }

  async function saveEmail() {
    if (!editEmail || editEmail === email) { setEditingEmail(false); return }
    setEditSaving(true); setEditMsg(null)
    const { error } = await createClient().auth.updateUser({ email: editEmail })
    setEditSaving(false)
    if (error) {
      setEditMsg({ type: 'err', text: error.message })
    } else {
      setEmail(editEmail)
      setEditMsg({ type: 'ok', text: 'Confirmation email sent to new address.' })
    }
  }

  // Step 1: verify the current password before showing the new-password screen
  async function verifyCurrentPassword() {
    if (!editCurrentPassword) return
    setEditSaving(true); setEditMsg(null)
    const { error: verifyError } = await createClient().auth.signInWithPassword({
      email: email!,
      password: editCurrentPassword,
    })
    setEditSaving(false)
    if (verifyError) {
      setEditMsg({ type: 'err', text: 'Huidig wachtwoord is onjuist' })
      return
    }
    setEditMsg(null)
    setPasswordStep('new')
  }

  // Step 2: save the new password
  async function savePassword() {
    if (!editPassword) return
    if (editPassword !== editPasswordConfirm) {
      setEditMsg({ type: 'err', text: 'Wachtwoorden komen niet overeen' }); return
    }
    if (editPassword.length < 6) {
      setEditMsg({ type: 'err', text: 'Minimaal 6 tekens vereist' }); return
    }
    setEditSaving(true); setEditMsg(null)
    const { error } = await createClient().auth.updateUser({ password: editPassword })
    setEditSaving(false)
    if (error) {
      setEditMsg({ type: 'err', text: error.message })
    } else {
      setEditCurrentPassword(''); setEditPassword(''); setEditPasswordConfirm('')
      setEditMsg({ type: 'ok', text: 'Wachtwoord opgeslagen.' })
      setTimeout(() => { setEditingPassword(false); setEditMsg(null) }, 900)
    }
  }

  async function saveAccount() {
    if (editPassword && editPassword !== editPasswordConfirm) {
      setEditMsg({ type: 'err', text: "Passwords don't match" }); return
    }
    if (editPassword && editPassword.length < 6) {
      setEditMsg({ type: 'err', text: 'Password must be at least 6 characters' }); return
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
      setEditMsg({ type: 'ok', text: updates.email ? 'Confirmation email sent to new address.' : 'Saved.' })
    }
  }

  async function handleSignOut() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function handleDeleteAccount() {
    setDeleteBusy(true); setDeleteMsg(null)
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) {
        setDeleteMsg(data?.error ?? 'Verwijderen mislukt. Probeer het opnieuw.')
        setDeleteBusy(false)
        return
      }
      // Account gone — sign out locally and return to login
      await createClient().auth.signOut().catch(() => {})
      router.push('/login')
      router.refresh()
    } catch {
      setDeleteMsg('Verwijderen mislukt. Probeer het opnieuw.')
      setDeleteBusy(false)
    }
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

  async function connectStrava() {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/strava-auth`)
      const { url } = await res.json()
      if (url) window.location.href = url
    } catch { /* ignore */ }
  }

  async function saveHevyKey() {
    const key = hevyKeyInput.trim()
    if (!key || !userId) return
    setHevyKeySaving(true)
    try {
      const supabase = createClient()
      await supabase.from('api_keys').upsert(
        { service: 'hevy', api_key: key, user_id: userId, updated_at: new Date().toISOString() },
        { onConflict: 'service' },
      )
      // Kick off a first sync so data appears right away
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/hevy-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: '{}',
      }).catch(() => {})
      setHevyKeyInput('')
      setShowHevyInput(false)
      mutateServices(s => s ? { ...s, hevy: true } : s, { revalidate: true })
      mutate('health-gezondheid')
      mutate('today')
    } finally {
      setHevyKeySaving(false)
    }
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
            ? 'Google Health is not connected.'
            : apiError
              ? `Sync error: ${apiError}`
              : 'Google Health sync failed.',
        })
        return
      }

      mutate('health-gezondheid')
      mutate('today')

      const errorCount = Array.isArray(data.errors) ? data.errors.length : 0
      setFitbitSyncMessage({
        type: errorCount ? 'err' : 'ok',
        text: errorCount
          ? `Sync completed with ${errorCount} error${errorCount === 1 ? '' : 's'}.`
          : `Google Health updated: ${data.healthSynced ?? 0} health rows, ${data.stepsSynced ?? 0} step days.`,
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
      mutateServices(s => s ? { ...s, google: false } : s, { revalidate: false })
    } else if (confirmDisconnect === 'strava') {
      await supabase.from('strava_tokens').delete().eq('user_id', userId)
      mutateServices(s => s ? { ...s, strava: false } : s, { revalidate: false })
    } else if (confirmDisconnect === 'fitbit') {
      await supabase.from('fitbit_tokens').delete().eq('user_id', userId)
      mutateServices(s => s ? { ...s, fitbit: false } : s, { revalidate: false })
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

  function toggleTimeFormat() {
    const next: '24h' | '12h' = timeFormat === '24h' ? '12h' : '24h'
    setTimeFormat(next)
    localStorage.setItem('time_format', next)
  }

  function toggleAddBurned() {
    const next = !addBurned
    setAddBurned(next)
    localStorage.setItem('add_burned_to_target', next ? '1' : '0')
    window.dispatchEvent(new Event('kern:add-burned-changed'))
  }

  function openMacroChoice() {
    setEditingMacroMode(true)
  }

  function openMacroCalc() {
    const latestWeightRow = healthRows.find((r: any) => r.gewicht != null)
    const weightIsRecent = latestWeightRow?.datum
      ? Date.now() - new Date(latestWeightRow.datum).getTime() <= 14 * 24 * 60 * 60 * 1000
      : false
    const weight = latestWeightRow && weightIsRecent
      ? String(Math.round(Number(latestWeightRow.gewicht) * 10) / 10)
      : ''

    setCalcGender(savedCalcGender)
    setCalcAge(savedCalcAge)
    setCalcHeight(savedCalcHeight)
    setCalcWeight(weight)
    setCalcGoal(null)       // user fills each time
    setCalcTargetKg('')     // user fills each time
    setCalcTargetWeeks('')  // user fills each time
    setCalcSaved(false)

    const hasBodyStats = !!savedCalcGender && !!savedCalcAge && !!savedCalcHeight
    setCalcStep(hasBodyStats && weight ? 4 : hasBodyStats ? 3 : 0)

    setEditingMacroMode(false)
    setEditingMacroCalc(true)
  }

  function openMacroManual() {
    setManualKcal(savedMacroKcal ? String(savedMacroKcal) : '')
    setManualProtein(savedMacroProtein ? String(savedMacroProtein) : '')
    setManualCarbs(savedMacroCarbs ? String(savedMacroCarbs) : '')
    setManualFat(savedMacroFat ? String(savedMacroFat) : '')
    setEditingMacroMode(false)
    setEditingMacroManual(true)
  }

  function activityFromFreq(f: Record<string, number>): number {
    const total = Object.values(f).reduce((a, b) => a + b, 0)
    return total === 0 ? 1.2 : total <= 3 ? 1.375 : total <= 6 ? 1.55 : total <= 10 ? 1.725 : 1.9
  }

  function computeMacros(rate = 0) {
    const w = Number(calcWeight), h = Number(calcHeight), a = Number(calcAge)
    if (!w || !h || !a || !calcGender || !calcGoal) return null
    const bmr = calcGender === 'male'
      ? 10 * w + 6.25 * h - 5 * a + 5
      : 10 * w + 6.25 * h - 5 * a - 161
    const tdee = Math.round(bmr * activityFromFreq(trainingFrequencies))
    const deficit = Math.round(rate * 7700 / 7)
    const kcal = Math.round(
      calcGoal === 'lose'     ? tdee - deficit :
      calcGoal === 'gain'     ? tdee + deficit :
      tdee
    )
    const protein = Math.round(w * (calcGoal === 'lose' ? 2.2 : calcGoal === 'gain' ? 2.0 : 1.8))
    const fat = Math.round(kcal * (calcGoal === 'lose' ? 0.25 : calcGoal === 'gain' ? 0.28 : 0.30) / 9)
    const carbs = Math.round(Math.max(0, kcal - protein * 4 - fat * 9) / 4)
    return { kcal, protein, fat, carbs, tdee }
  }

  async function saveMacros() {
    if (!userId) return
    const deltaKg = calcTargetKg && Number(calcTargetKg) > 0
      ? Math.abs(Number(calcWeight) - Number(calcTargetKg))
      : 0
    const rateX10 = Number(calcTargetWeeks) > 0 ? Number(calcTargetWeeks) : 5
    const derivedRate = calcGoal !== 'maintain' && deltaKg > 0 ? rateX10 / 10 : 0
    const m = computeMacros(derivedRate)
    if (!m) return
    setCalcSaving(true)
    await createClient()
      .from('user_settings')
      .update({
        macro_kcal: m.kcal, macro_protein: m.protein, macro_carbs: m.carbs, macro_fat: m.fat,
        height_cm: Number(calcHeight) || null,
        age: Number(calcAge) || null,
        gender: calcGender,
        macro_goal: calcGoal,
      })
      .eq('user_id', userId)
    setSavedCalcHeight(calcHeight)
    setSavedCalcAge(calcAge)
    setSavedCalcGender(calcGender)
    setSavedCalcGoal(calcGoal)
    setSavedCalcTargetKg(calcTargetKg)
    setSavedCalcTargetWeeks(calcTargetWeeks)
    setSavedMacroKcal(m.kcal); setSavedMacroProtein(m.protein)
    setSavedMacroCarbs(m.carbs); setSavedMacroFat(m.fat)
    mutate(
      (key) => typeof key === 'string' && key.startsWith('food-log-'),
      (cur: any) => cur && cur.targets ? { ...cur, targets: { ...cur.targets, kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat } } : cur,
      { revalidate: true },
    )
    mutate('food-log')
    mutate('training')
    mutate('today')
    setCalcSaving(false)
    setCalcSaved(true)
    setTimeout(() => { setEditingMacroCalc(false); setOpen(false); router.push('/food') }, 800)
  }

  async function saveMacrosManual() {
    if (!userId) return
    const kcal = Number(manualKcal), protein = Number(manualProtein)
    const carbs = Number(manualCarbs), fat = Number(manualFat)
    if (!kcal || !protein || !carbs || !fat) return
    setManualSaving(true)
    await createClient()
      .from('user_settings')
      .update({ macro_kcal: kcal, macro_protein: protein, macro_carbs: carbs, macro_fat: fat })
      .eq('user_id', userId)
    setSavedMacroKcal(kcal); setSavedMacroProtein(protein)
    setSavedMacroCarbs(carbs); setSavedMacroFat(fat)
    // Optimistically patch the macro targets into every cached food-log day so the
    // Food tab shows the new numbers immediately, without needing a reload.
    mutate(
      (key) => typeof key === 'string' && key.startsWith('food-log-'),
      (cur: any) => cur && cur.targets ? { ...cur, targets: { ...cur.targets, kcal, protein, carbs, fat } } : cur,
      { revalidate: true },
    )
    mutate('food-log')
    mutate('today')
    mutate('training')
    setManualSaving(false)
    setEditingMacroManual(false)
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

async function saveTraining() {
    if (!userId) return
    setTrainingSaving(true)
    await createClient()
      .from('user_settings')
      .update({ training_goal: trainingGoal, training_frequencies: trainingFrequencies, training_intensity: trainingIntensity, training_sport_priority: sportOrder, training_goal_priority: goalOrder, training_injuries: injuries, training_self_planned: selfPlanned, training_zone_targets: zoneTargets })
      .eq('user_id', userId)
    setTrainingSaving(false)
    setEditingTraining(false)
    mutate('today')
    // Optimistisch de frequenties direct in cache zetten zodat tabs meteen updaten
    mutate('training', (cur: any) => cur ? { ...cur, trainingFrequencies, zoneTargets } : cur, { revalidate: true })
    mutate('training-freqs', trainingFrequencies, { revalidate: false })
  }

  function setFreq(sport: string, delta: number) {
    setTrainingFrequencies(prev => ({
      ...prev,
      [sport]: Math.round(Math.max(0, Math.min(20, (prev[sport] ?? 0) + delta)) * 2) / 2,
    }))
    // Clear saved zone targets so SportPlanCard re-derives them from the new freq
    setZoneTargets(prev => {
      const next = { ...prev }
      delete next[sport]
      return next
    })
  }

  function fmtFreq(h: number): string {
    if (h === 0) return '–'
    if (h < 1) return `${Math.round(h * 60)}m`
    const whole = Math.floor(h), mins = Math.round((h % 1) * 60)
    return mins > 0 ? `${whole}h${mins}m` : `${whole}h`
  }

  // Adjust a zone target by ±delta minutes for the given sport, stamping the current ISO week
  function adjustZone(sport: string, zone: 'z2' | 'quality', delta: number, current: ZoneTargets) {
    const now = new Date()
    setZoneTargets(prev => ({
      ...prev,
      [sport]: {
        z2Minutes:      zone === 'z2'      ? Math.max(15, current.z2Minutes + delta)      : current.z2Minutes,
        qualityMinutes: zone === 'quality' ? Math.max(0,  current.qualityMinutes + delta) : current.qualityMinutes,
        updatedWeek: getISOWeek(now),
        updatedYear: now.getFullYear(),
      },
    }))
  }

  // When a sport is opened, fetch its 60-day Strava history so the zone-hours
  // view can compute personal zones, suggested targets and this-week progress.
  useEffect(() => {
    if (!activeSport || !userId) return
    const supabase = createClient()
    const sportTypes: Record<string, string[]> = {
      running:  ['Run', 'VirtualRun', 'TrailRun'],
      cycling:  ['Ride', 'VirtualRide', 'EBikeRide', 'GravelRide', 'MountainBikeRide'],
      swimming: ['Swim'],
      gym:      ['WeightTraining', 'Workout', 'CrossFit'],
    }
    const sixtyDaysAgo = new Date(Date.now() - 60 * 86400000).toISOString()
    supabase.from('strava_activities')
      .select('name, average_speed, average_heartrate, moving_time, distance, start_date, sport_type')
      .eq('user_id', userId)
      .gte('start_date', sixtyDaysAgo)
      .in('sport_type', sportTypes[activeSport] ?? [])
      .order('start_date', { ascending: false })
      .then(({ data }) => setSportActivities(data ?? []))
  }, [activeSport, userId])


  function startGoalDrag(key: string, e: React.MouseEvent | React.TouchEvent) {
    e.stopPropagation()
    if ('touches' in e) e.preventDefault()
    dragGoalKeyRef.current = key
    setDraggingGoalKey(key)

    function onMove(ev: MouseEvent | TouchEvent) {
      ev.preventDefault()
      if (!dragGoalKeyRef.current || !dragGoalContainerRef.current) return
      const y = 'touches' in ev ? (ev as TouchEvent).touches[0]?.clientY ?? 0 : (ev as MouseEvent).clientY
      const rows = dragGoalContainerRef.current.querySelectorAll<HTMLElement>('[data-goal-key]')
      for (const row of Array.from(rows)) {
        const rect = row.getBoundingClientRect()
        const k = row.dataset.goalKey
        if (y >= rect.top && y <= rect.bottom && k && k !== dragGoalKeyRef.current) {
          const fromKey = dragGoalKeyRef.current
          setGoalOrder(prev => {
            const from = prev.indexOf(fromKey); const to = prev.indexOf(k)
            if (from === -1 || to === -1) return prev
            const next = [...prev]; next.splice(from, 1); next.splice(to, 0, fromKey); return next
          })
          break
        }
      }
    }

    function onEnd() {
      dragGoalKeyRef.current = null
      setDraggingGoalKey(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('touchmove', onMove as EventListener)
      document.removeEventListener('mouseup', onEnd)
      document.removeEventListener('touchend', onEnd)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('touchmove', onMove as EventListener, { passive: false })
    document.addEventListener('mouseup', onEnd)
    document.addEventListener('touchend', onEnd)
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

  const disconnectLabel = confirmDisconnect === 'strava' ? 'Strava' : confirmDisconnect === 'fitbit' ? 'Google Health' : 'Google Calendar'

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

          {/* Account Info subpage */}
          {editingAccountInfo && (
            <div className="absolute inset-0 z-10 flex flex-col"
              style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
              <div className="flex items-center justify-between px-5 py-4 shrink-0">
                <button onClick={() => setEditingAccountInfo(false)}
                  className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.10)' }}>
                  Back
                </button>
                <span className="text-[17px] font-semibold text-white">Account</span>
                <div className="w-16" />
              </div>
              <div className="flex-1 overflow-y-auto px-5 pt-2 pb-12 flex flex-col gap-6" style={{ scrollbarWidth: 'none' }}>
                <ProfileSection>
                  <ProfileRow separator>
                    <button className="flex items-center justify-between w-full gap-3"
                      onClick={() => { setEditMsg(null); setEditingName(true) }}>
                      <span className="text-[15px] text-white/40 shrink-0">Name</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[17px] text-white truncate">{editName || '—'}</span>
                        <ChevronRight size={16} className="text-white/25 shrink-0" />
                      </div>
                    </button>
                  </ProfileRow>
                  <ProfileRow separator>
                    <button className="flex items-center justify-between w-full gap-3"
                      onClick={() => setEmailActionSheet(true)}>
                      <span className="text-[15px] text-white/40 shrink-0">Email</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[17px] text-white truncate">{maskEmail(email ?? '—')}</span>
                        <ChevronRight size={16} className="text-white/25 shrink-0" />
                      </div>
                    </button>
                  </ProfileRow>
                  <ProfileRow separator>
                    <button className="flex items-center justify-between w-full gap-3"
                      onClick={() => { setPasswordStep('current'); setEditCurrentPassword(''); setEditPassword(''); setEditPasswordConfirm(''); setEditMsg(null); setEditingPassword(true) }}>
                      <span className="text-[15px] text-white/40 shrink-0">Password</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[17px] text-white truncate">••••••</span>
                        <ChevronRight size={16} className="text-white/25 shrink-0" />
                      </div>
                    </button>
                  </ProfileRow>
                  <ProfileRow>
                    <button className="flex items-center justify-between w-full gap-3"
                      onClick={() => {
                        if (!shortcutToken) { loadShortcutToken(); return }
                        navigator.clipboard.writeText(shortcutToken)
                        setTokenCopied(true)
                        setTimeout(() => setTokenCopied(false), 2000)
                      }}>
                      <span className="text-[15px] text-white/40 shrink-0">Shortcut Key</span>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[13px] text-white/60 font-mono truncate">
                          {shortcutToken ? `${shortcutToken.slice(0, 8)}…` : '—'}
                        </span>
                        <span className="text-[13px] text-teal-400 shrink-0">
                          {tokenCopied ? 'Gekopieerd!' : 'Kopieer'}
                        </span>
                      </div>
                    </button>
                  </ProfileRow>
                </ProfileSection>
              </div>
            </div>
          )}

          {/* Name overlay */}
          {editingName && (
            <div className="absolute inset-0 z-10 flex flex-col"
              style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
              <div className="flex items-center justify-between px-5 py-4 shrink-0">
                <button onClick={() => { setEditingName(false); setEditMsg(null) }}
                  className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.10)' }}>
                  Back
                </button>
                <span className="text-[17px] font-semibold text-white">Name</span>
                <button onClick={saveName} disabled={editSaving || !editName}
                  className="px-4 h-[34px] rounded-full bg-white text-black text-[15px] font-semibold disabled:opacity-40">
                  {editSaving ? '…' : 'Save'}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pt-4 pb-12 flex flex-col gap-4">
                <ProfileSection title="Display name">
                  <ProfileRow>
                    <input
                      autoFocus
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Your name"
                      className="w-full bg-transparent text-white text-[17px] outline-none placeholder:text-white/25"
                    />
                  </ProfileRow>
                </ProfileSection>
                {editMsg && (
                  <p className={`text-[14px] text-center px-1 ${editMsg.type === 'ok' ? 'text-teal-400' : 'text-red-400'}`}>
                    {editMsg.text}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Change Email overlay */}
          {editingEmail && (
            <div className="absolute inset-0 z-10 flex flex-col"
              style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
              <div className="flex items-center justify-between px-5 py-4 shrink-0">
                <button onClick={() => { setEditingEmail(false); setEditMsg(null) }}
                  className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.10)' }}>
                  Back
                </button>
                <span className="text-[17px] font-semibold text-white">Change Email</span>
                <button onClick={saveEmail} disabled={editSaving || !editEmail || editEmail === email}
                  className="px-4 h-[34px] rounded-full bg-white text-black text-[15px] font-semibold disabled:opacity-40">
                  {editSaving ? '…' : 'Save'}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pt-4 pb-12 flex flex-col gap-4">
                <ProfileSection title="New email address">
                  <ProfileRow>
                    <input
                      type="email"
                      autoFocus
                      value={editEmail}
                      onChange={e => setEditEmail(e.target.value)}
                      placeholder="nieuw@email.com"
                      className="w-full bg-transparent text-white text-[17px] outline-none placeholder:text-white/25"
                    />
                  </ProfileRow>
                </ProfileSection>
                {editMsg && (
                  <p className={`text-[14px] text-center px-1 ${editMsg.type === 'ok' ? 'text-teal-400' : 'text-red-400'}`}>
                    {editMsg.text}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Password overlay — two steps: verify current, then set new */}
          {editingPassword && (
            <div className="absolute inset-0 z-10 flex flex-col"
              style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
              <div className="flex items-center justify-between px-5 py-4 shrink-0">
                <button onClick={() => {
                    if (passwordStep === 'new') { setPasswordStep('current'); setEditMsg(null); setEditPassword(''); setEditPasswordConfirm(''); return }
                    setEditingPassword(false); setEditMsg(null); setEditCurrentPassword(''); setEditPassword(''); setEditPasswordConfirm('')
                  }}
                  className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.10)' }}>
                  Back
                </button>
                <span className="text-[17px] font-semibold text-white">Wachtwoord</span>
                {passwordStep === 'current' ? (
                  <button onClick={verifyCurrentPassword} disabled={editSaving || !editCurrentPassword}
                    className="px-4 h-[34px] rounded-full bg-white text-black text-[15px] font-semibold disabled:opacity-40">
                    {editSaving ? '…' : 'Volgende'}
                  </button>
                ) : (
                  <button onClick={savePassword} disabled={editSaving || !editPassword || !editPasswordConfirm}
                    className="px-4 h-[34px] rounded-full bg-white text-black text-[15px] font-semibold disabled:opacity-40">
                    {editSaving ? '…' : 'Save'}
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-5 pt-4 pb-12 flex flex-col gap-4">
                {passwordStep === 'current' ? (
                  <ProfileSection title="Huidig wachtwoord">
                    <ProfileRow>
                      <input
                        type="password"
                        autoFocus
                        value={editCurrentPassword}
                        onChange={e => setEditCurrentPassword(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && editCurrentPassword) verifyCurrentPassword() }}
                        placeholder="Huidig wachtwoord"
                        autoComplete="current-password"
                        className="w-full bg-transparent text-white text-[17px] outline-none placeholder:text-white/25"
                      />
                    </ProfileRow>
                  </ProfileSection>
                ) : (
                  <ProfileSection title="Nieuw wachtwoord">
                    <ProfileRow separator>
                      <input
                        type="password"
                        autoFocus
                        value={editPassword}
                        onChange={e => setEditPassword(e.target.value)}
                        placeholder="Nieuw wachtwoord"
                        autoComplete="new-password"
                        className="w-full bg-transparent text-white text-[17px] outline-none placeholder:text-white/25"
                      />
                    </ProfileRow>
                    <ProfileRow>
                      <input
                        type="password"
                        value={editPasswordConfirm}
                        onChange={e => setEditPasswordConfirm(e.target.value)}
                        placeholder="Bevestig wachtwoord"
                        autoComplete="new-password"
                        className="w-full bg-transparent text-white text-[17px] outline-none placeholder:text-white/25"
                      />
                    </ProfileRow>
                  </ProfileSection>
                )}
                {editMsg && (
                  <p className={`text-[14px] text-center px-1 ${editMsg.type === 'ok' ? 'text-teal-400' : 'text-red-400'}`}>
                    {editMsg.text}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Devices & Apps overlay */}
          {editingDevices && (
            <div className="absolute inset-0 z-10 flex flex-col"
              style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
              <div className="flex items-center justify-between px-5 py-4 shrink-0">
                <button onClick={() => setEditingDevices(false)}
                  className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.10)' }}>
                  Back
                </button>
                <span className="text-[17px] font-semibold text-white">Devices & Apps</span>
                <div className="w-16" />
              </div>
              <div className="flex-1 overflow-y-auto px-5 pt-2 pb-12 flex flex-col gap-6" style={{ scrollbarWidth: 'none' }}>
                <ProfileSection title="Connected">
                  <ProfileRow separator>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 text-[18px]"
                        style={{ background: 'rgba(252,82,0,0.15)' }}>🏃</div>
                      <div className="flex-1">
                        <p className="text-[15px] font-medium text-white">Strava</p>
                        <p className="text-[12px] text-white/40">Running & Cycling</p>
                      </div>
                      {services?.strava === true
                        ? <button onClick={() => setConfirmDisconnect('strava')} className="text-[14px] font-semibold text-green-400 active:opacity-60">Connected</button>
                        : services?.strava === false
                          ? <button onClick={connectStrava} className="text-[14px] font-semibold text-teal-400 active:opacity-60">Connect</button>
                          : <span className="text-[14px] text-white/30">…</span>}
                    </div>
                  </ProfileRow>
                  <ProfileRow separator>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 text-[18px]"
                        style={{ background: 'rgba(0,178,202,0.15)' }}>⌚</div>
                      <div className="flex-1">
                        <p className="text-[15px] font-medium text-white">Google Health</p>
                        {services?.fitbit && services.fitbitNeedsReconnect
                          ? <p className="text-[12px] text-orange-300">Connection expired — reconnect to resume sleep & HRV</p>
                          : <p className="text-[12px] text-white/40">Sleep, HRV & Activity</p>}
                      </div>
                      {services?.fitbit === true ? (
                        services.fitbitNeedsReconnect ? (
                          <button onClick={connectFitbit} className="text-[14px] font-semibold text-orange-400 active:opacity-60">Reconnect</button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button onClick={syncFitbit} disabled={fitbitSyncing}
                              className="text-[14px] font-semibold text-teal-400 disabled:opacity-50 active:opacity-60">
                              {fitbitSyncing ? 'Syncing…' : 'Sync'}
                            </button>
                            <button onClick={() => setConfirmDisconnect('fitbit')} className="text-[14px] font-semibold text-green-400 active:opacity-60">Connected</button>
                          </div>
                        )
                      ) : services?.fitbit === false
                        ? <button onClick={connectFitbit} className="text-[14px] font-semibold text-teal-400 active:opacity-60">Connect</button>
                        : <span className="text-[14px] text-white/30">…</span>}
                    </div>
                  </ProfileRow>
                  {fitbitSyncMessage && (
                    <div className="px-4 pb-2">
                      <p className={`text-[12px] ${fitbitSyncMessage.type === 'ok' ? 'text-teal-400' : 'text-orange-300'}`}>
                        {fitbitSyncMessage.text}
                      </p>
                    </div>
                  )}
                  <ProfileRow separator>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 text-[18px]"
                        style={{ background: 'rgba(255,255,255,0.08)' }}>🏋️</div>
                      <div className="flex-1">
                        <p className="text-[15px] font-medium text-white">Hevy</p>
                        <p className="text-[12px] text-white/40">Strength Training</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {services?.hevy && (
                          <button
                            onClick={async () => {
                              setHevySyncing(true)
                              const supabase = createClient()
                              const { data: { session } } = await supabase.auth.getSession()
                              await fetch(
                                `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/hevy-sync`,
                                { method: 'POST', headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) }, body: '{}' }
                              ).catch(() => {})
                              setHevySyncing(false)
                              mutate('health-gezondheid')
                              mutate('today')
                            }}
                            className="text-[13px] text-teal-400"
                          >
                            {hevySyncing ? 'Syncing…' : 'Sync'}
                          </button>
                        )}
                        {services?.hevy
                          ? <span className="text-[14px] font-semibold text-green-400">Connected</span>
                          : services?.hevy === false
                            ? <button onClick={() => setShowHevyInput(v => !v)} className="text-[14px] font-semibold text-teal-400 active:opacity-60">{showHevyInput ? 'Cancel' : 'Connect'}</button>
                            : <span className="text-[14px] text-white/30">…</span>}
                      </div>
                    </div>
                  </ProfileRow>
                  {showHevyInput && !services?.hevy && (
                    <div className="px-4 pb-3 flex flex-col gap-2">
                      <input
                        type="text"
                        inputMode="text"
                        autoCapitalize="none"
                        autoCorrect="off"
                        placeholder="Paste your Hevy API key"
                        value={hevyKeyInput}
                        onChange={e => setHevyKeyInput(e.target.value)}
                        className="h-[44px] px-3.5 rounded-[12px] text-white placeholder:text-white/30 text-[14px] outline-none"
                        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)' }}
                      />
                      <div className="flex items-center justify-between gap-3">
                        <a href="https://hevy.com/settings?developer" target="_blank" rel="noopener noreferrer"
                          className="text-[12px] text-teal-400/80 active:opacity-60">Where do I find this?</a>
                        <button onClick={saveHevyKey} disabled={hevyKeySaving || !hevyKeyInput.trim()}
                          className="px-4 h-[36px] rounded-full text-black text-[14px] font-semibold bg-white disabled:opacity-30">
                          {hevyKeySaving ? 'Saving…' : 'Save & sync'}
                        </button>
                      </div>
                    </div>
                  )}
                  <ProfileRow>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 text-[18px]"
                        style={{ background: 'rgba(66,133,244,0.15)' }}>📅</div>
                      <div className="flex-1">
                        <p className="text-[15px] font-medium text-white">Google Calendar</p>
                        <p className="text-[12px] text-white/40">Training Schedule</p>
                      </div>
                      {services?.google === true
                        ? <button onClick={() => setConfirmDisconnect('google')} className="text-[14px] font-semibold text-green-400 active:opacity-60">Connected</button>
                        : services?.google === false
                          ? <button onClick={connectGoogleCalendar} className="text-[14px] font-semibold text-teal-400 active:opacity-60">Connect</button>
                          : <span className="text-[14px] text-white/30">…</span>}
                    </div>
                  </ProfileRow>
                </ProfileSection>
                <ProfileSection title="Coming Soon">
                  {([
                    { icon: '🍎', name: 'Apple Health', desc: 'Steps, sleep & workouts', bg: 'rgba(255,59,48,0.12)' },
                    { icon: '⌚', name: 'Garmin',        desc: 'GPS watches & cycling',  bg: 'rgba(0,126,197,0.12)' },
                    { icon: '🔴', name: 'Whoop',         desc: 'Recovery & strain',       bg: 'rgba(220,38,38,0.10)' },
                    { icon: '🫀', name: 'Polar',         desc: 'HR & training load',      bg: 'rgba(235,87,87,0.10)' },
                  ] as const).map((item, i, arr) => (
                    <ProfileRow key={item.name} separator={i < arr.length - 1}>
                      <div className="flex items-center gap-3 opacity-40">
                        <div className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0 text-[18px]"
                          style={{ background: item.bg }}>{item.icon}</div>
                        <div className="flex-1">
                          <p className="text-[15px] font-medium text-white">{item.name}</p>
                          <p className="text-[12px] text-white/40">{item.desc}</p>
                        </div>
                        <span className="text-[11px] font-semibold text-white/30 px-2.5 py-1 rounded-full"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          Soon
                        </span>
                      </div>
                    </ProfileRow>
                  ))}
                </ProfileSection>
              </div>
            </div>
          )}

          {/* Settings overlay */}
          {editingSettings && (
            <div className="absolute inset-0 z-10 flex flex-col"
              style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
              <div className="flex items-center justify-between px-5 py-4 shrink-0">
                <button onClick={() => setEditingSettings(false)}
                  className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.10)' }}>
                  Back
                </button>
                <span className="text-[17px] font-semibold text-white">Settings</span>
                <div className="w-16" />
              </div>
              <div className="flex-1 overflow-y-auto px-5 pt-2 pb-12 flex flex-col gap-6" style={{ scrollbarWidth: 'none' }}>
                <ProfileSection title="Display">
                  <ProfileRow separator>
                    <button className="flex items-center justify-between w-full" onClick={toggleUnits}>
                      <span className="text-[17px] text-white">Units</span>
                      <span className="text-[15px] text-white/40 capitalize">{units}</span>
                    </button>
                  </ProfileRow>
                  <ProfileRow separator>
                    <button className="flex items-center justify-between w-full" onClick={toggleTimeFormat}>
                      <span className="text-[17px] text-white">Time Format</span>
                      <span className="text-[15px] text-white/40">{timeFormat === '12h' ? '12h (AM/PM)' : '24h'}</span>
                    </button>
                  </ProfileRow>
                  <ProfileRow separator>
                    <button className="flex items-center justify-between w-full" onClick={toggleAddBurned}>
                      <div className="flex flex-col items-start">
                        <span className="text-[17px] text-white">Add Burned Calories</span>
                        <span className="text-[13px] text-white/40">{addBurned ? 'Added to daily budget' : 'Shown separately'}</span>
                      </div>
                      <div className="w-[44px] h-[26px] rounded-full flex items-center p-[3px] transition-colors shrink-0"
                        style={{ background: addBurned ? 'rgb(45,212,191)' : 'rgba(255,255,255,0.15)' }}>
                        <div className="w-[20px] h-[20px] rounded-full bg-white transition-transform"
                          style={{ transform: addBurned ? 'translateX(18px)' : 'translateX(0)' }} />
                      </div>
                    </button>
                  </ProfileRow>
                  <ProfileRow>
                    <div className="flex items-center justify-between">
                      <span className="text-[17px] text-white">Appearance</span>
                      <span className="text-[15px] text-white/40">Dark</span>
                    </div>
                  </ProfileRow>
                </ProfileSection>
                <ProfileSection title="Notifications">
                  <ProfileRow>
                    <button className="flex items-center justify-between w-full"
                      onClick={requestNotifications}
                      disabled={notifStatus === 'denied' || notifStatus === 'unsupported'}>
                      <span className="text-[17px] text-white">Push Notifications</span>
                      <span className={`text-[15px] ${notifStatus === 'granted' ? 'text-green-400' : notifStatus === 'denied' ? 'text-red-400' : 'text-white/40'}`}>
                        {notifLabel}
                      </span>
                    </button>
                  </ProfileRow>
                </ProfileSection>
                <ProfileSection title="Data">
                  <ProfileRow>
                    <button className="flex items-center justify-between w-full" onClick={() => setEditingTargets(true)}>
                      <span className="text-[17px] text-white">Targets & Standards</span>
                      <ChevronRight size={18} className="text-white/25 shrink-0" />
                    </button>
                  </ProfileRow>
                </ProfileSection>
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
                  Back
                </button>
                <span className="text-[17px] font-semibold text-white">Targets</span>
                <button onClick={saveTargets} disabled={targetsSaving}
                  className="px-4 h-[34px] rounded-full bg-white text-black text-[15px] font-semibold disabled:opacity-50">
                  {targetsSaving ? '…' : 'Save'}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pt-4 pb-12 flex flex-col gap-4">
                <ProfileSection title="Activity">
                  <ProfileRow>
                    <div className="flex items-center justify-between">
                      <span className="text-[17px] text-white">Step goal</span>
                      <input
                        type="number"
                        value={stepGoal}
                        onChange={e => setStepGoal(Number(e.target.value))}
                        className="w-24 bg-transparent text-white text-[17px] text-right outline-none"
                      />
                    </div>
                  </ProfileRow>
                </ProfileSection>
                <ProfileSection title="Strength standards (kg)">
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

          {/* Training preferences overlay */}
          {editingTraining && (
            <div className="absolute inset-0 z-10 flex flex-col"
              style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>

              {/* Sport weekly zone-hours sub-overlay */}
              {activeSport && (() => {
                const SPORT_META: Record<string, { label: string; icon: string }> = {
                  running:  { label: 'Running',        icon: '🏃' },
                  cycling:  { label: 'Cycling',        icon: '🚴' },
                  swimming: { label: 'Swimming',       icon: '🏊' },
                  gym:      { label: 'Gym / Strength', icon: '🏋️' },
                }
                const meta = SPORT_META[activeSport]
                const freq = trainingFrequencies[activeSport] ?? 0
                const isEndurance = activeSport === 'running' || activeSport === 'cycling' || activeSport === 'swimming'

                const fmt = (min: number) => {
                  if (min <= 0) return '0 min'
                  if (min < 60) return `${min} min`
                  const h = Math.floor(min / 60), m = min % 60
                  return m > 0 ? `${h}h ${m}m` : `${h}h`
                }

                const suggested = isEndurance ? suggestZoneTargets(activeSport, freq) : null
                const targets = zoneTargets[activeSport] ?? suggested
                const zones = isEndurance ? computeZones(sportActivities, activeSport) : null
                const progress = isEndurance ? computeWeekProgress(sportActivities, activeSport, zones ?? undefined, undefined, 0) : null

                const ZoneRow = ({ zone, emoji, label, sublabel, hint, done, target }: { zone: 'z2' | 'quality'; emoji: string; label: string; sublabel?: string; hint?: string; done: number; target: number }) => {
                  const pct = target > 0 ? Math.min(100, (done / target) * 100) : 0
                  const barColor = pct >= 100 ? '#4ade80' : pct >= 50 ? '#fb923c' : 'rgba(255,255,255,0.15)'
                  return (
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <span className="text-[18px] leading-none w-7 shrink-0 text-center">{emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-white/80">{label}</p>
                        {sublabel && <p className="text-[11px] text-white/30 leading-none mt-0.5">{sublabel}</p>}
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
                          </div>
                          <span className="text-[11px] text-white/35 shrink-0 tabular-nums">{fmt(done)} / {fmt(target)}</span>
                        </div>
                        {hint && <p className="text-[10px] text-white/20 mt-1 leading-snug">{hint}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => targets && adjustZone(activeSport, zone, -15, targets)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 active:opacity-50"
                          style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <span className="text-[16px] leading-none select-none">−</span>
                        </button>
                        <button onClick={() => targets && adjustZone(activeSport, zone, 15, targets)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white/60 active:opacity-50"
                          style={{ background: 'rgba(255,255,255,0.08)' }}>
                          <span className="text-[16px] leading-none select-none">+</span>
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div className="absolute inset-0 z-20 flex flex-col"
                    style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
                    <div className="flex items-center justify-between px-5 py-4 shrink-0">
                      <button onClick={() => setActiveSport(null)}
                        className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
                        style={{ background: 'rgba(255,255,255,0.10)' }}>
                        Back
                      </button>
                      <span className="text-[17px] font-semibold text-white">{meta?.label}</span>
                      <div className="w-16" />
                    </div>
                    <div className="flex-1 overflow-y-auto px-5 pt-2 pb-12 flex flex-col gap-5" style={{ scrollbarWidth: 'none' }}>
                      <div className="px-1">
                        <p className="text-[13px] text-white/35">{fmt(freq * 60)} per week · weekly targets</p>
                        <p className="text-[11px] text-white/25 mt-1 leading-snug">
                          Polarized model — most time easy in Zone 2, a smaller share at quality intensity. Adjust the hours to fit your week.
                        </p>
                      </div>

                      {isEndurance && targets ? (
                        <>
                          <div className="rounded-[18px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            <ZoneRow zone="z2" emoji="🟢" label="Zone 2"
                                hint="No HR monitor? Name your activity 'easy run', 'zone 2' or 'endurance'"
                                done={progress?.z2Minutes ?? 0} target={targets.z2Minutes} />
                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                              <ZoneRow zone="quality" emoji="⚡"
                                label={activeSport === 'running' ? 'Intervals & tempo' : 'Intervals'}
                                sublabel={activeSport === 'running' ? 'tempo, drempeltraining, VO2max' : 'FTP-blokken, drempelritten, VO2max'}
                                hint="No HR monitor? Name your activity 'interval' or 'tempo'"
                                done={progress?.qualityMinutes ?? 0} target={targets.qualityMinutes} />
                            </div>
                          </div>
                          <div className="rounded-[18px] px-4 py-3.5 flex flex-col gap-2.5" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                            <div className="flex items-center justify-between">
                              <span className="text-[12px] text-white/35">Weekly target</span>
                              <span className="text-[13px] font-semibold text-white/60">{fmt(freq * 60)}</span>
                            </div>
                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} className="pt-2.5 flex items-center justify-between">
                              <span className="text-[12px] text-white/35">This week done</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-white/25">🟢 {fmt(progress?.z2Minutes ?? 0)} · ⚡ {fmt(progress?.qualityMinutes ?? 0)}</span>
                                <span className="text-[13px] font-semibold text-white/60">{fmt((progress?.z2Minutes ?? 0) + (progress?.qualityMinutes ?? 0))}</span>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="rounded-[18px] px-4 py-4" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <p className="text-[14px] text-white/70 font-semibold">{fmt(freq * 60)} strength per week</p>
                          <p className="text-[12px] text-white/35 mt-1 leading-snug">Strength volume is tracked per session rather than by zone hours.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}

              <div className="flex items-center justify-between px-5 py-4 shrink-0">
                <button onClick={saveTraining} disabled={trainingSaving}
                  className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold disabled:opacity-40"
                  style={{ background: 'rgba(255,255,255,0.10)' }}>
                  {trainingSaving ? '…' : 'Back'}
                </button>
                <span className="text-[17px] font-semibold text-white">Training</span>
                <div className="w-16" />
              </div>

              <div className="flex-1 overflow-y-auto px-5 pt-2 pb-12 flex flex-col gap-6" style={{ scrollbarWidth: 'none' }}>

                {/* Weekly frequency */}
                <div className="flex flex-col gap-2">
                  <div className="px-1">
                    <span className="text-[13px] font-medium text-white/40">Weekly hours</span>
                    <p className="text-[11px] text-white/25 mt-0.5">Tap a sport to see zone targets</p>
                  </div>
                  {(() => {
                    const SPORT_META: Record<string, { label: string; icon: string }> = {
                      running:  { label: 'Running',        icon: '🏃' },
                      cycling:  { label: 'Cycling',        icon: '🚴' },
                      swimming: { label: 'Swimming',       icon: '🏊' },
                      gym:      { label: 'Gym / Strength', icon: '🏋️' },
                    }
                    return (
                      <div className="rounded-[18px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        {sportOrder.map((key, i) => {
                          const meta = SPORT_META[key]; if (!meta) return null
                          const val = trainingFrequencies[key] ?? 0
                          return (
                            <div
                              key={key}
                              style={{ borderBottom: i < sportOrder.length - 1 ? '1px solid rgba(255,255,255,0.06)' : undefined }}
                            >
                              <div className="flex items-center gap-3 px-4 py-3.5">
                                <button
                                  onClick={() => val > 0 && setActiveSport(key)}
                                  className="flex items-center gap-3 flex-1 min-w-0 text-left active:opacity-60"
                                >
                                  <span className="text-[16px] shrink-0">{injuries[key] ? '🤕' : meta.icon}</span>
                                  <div className="flex-1 flex flex-col gap-0">
                                    <span className="text-[15px] text-white">{meta.label}</span>
                                    {injuries[key] && <span className="text-[11px] text-orange-400/80">Injured — plan still available</span>}
                                  </div>
                                  {val > 0 && <ChevronRight size={14} className="text-white/25 shrink-0" />}
                                </button>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button onClick={() => setFreq(key, -0.5)} disabled={val === 0}
                                    className="w-[28px] h-[28px] rounded-full text-[18px] text-white flex items-center justify-center disabled:opacity-25 active:opacity-60"
                                    style={{ background: 'rgba(255,255,255,0.10)' }}>−</button>
                                  <span className="text-[15px] font-semibold text-white w-10 text-center tabular-nums">{fmtFreq(val)}</span>
                                  <button onClick={() => setFreq(key, +0.5)} disabled={val >= 20}
                                    className="w-[28px] h-[28px] rounded-full text-[18px] text-white flex items-center justify-center disabled:opacity-25 active:opacity-60"
                                    style={{ background: 'rgba(255,255,255,0.10)' }}>+</button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>

                {/* Self-planned sports */}
                {sportOrder.some(key => (trainingFrequencies[key] ?? 0) > 0) && (() => {
                  const SPORT_META: Record<string, { label: string; icon: string }> = {
                    running:  { label: 'Running',        icon: '🏃' },
                    cycling:  { label: 'Cycling',        icon: '🚴' },
                    swimming: { label: 'Swimming',       icon: '🏊' },
                    gym:      { label: 'Gym / Strength', icon: '🏋️' },
                  }
                  const activeSports = sportOrder.filter(key => (trainingFrequencies[key] ?? 0) > 0)
                  return (
                    <div className="flex flex-col gap-2">
                      <div className="px-1">
                        <span className="text-[13px] font-medium text-white/40">Plan yourself</span>
                        <p className="text-[11px] text-white/25 mt-0.5">No coach advice for sports you schedule yourself</p>
                      </div>
                      <div className="rounded-[18px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        {activeSports.map((key, i) => {
                          const meta = SPORT_META[key]; if (!meta) return null
                          const active = !!selfPlanned[key]
                          return (
                            <button
                              key={key}
                              onClick={() => setSelfPlanned(p => ({ ...p, [key]: !p[key] }))}
                              className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-60"
                              style={{ borderBottom: i < activeSports.length - 1 ? '1px solid rgba(255,255,255,0.06)' : undefined }}
                            >
                              <div className="w-[20px] h-[20px] rounded-[6px] flex items-center justify-center shrink-0"
                                style={{ background: active ? 'rgba(45,212,191,0.20)' : 'rgba(255,255,255,0.08)', border: `1px solid ${active ? 'rgba(45,212,191,0.45)' : 'rgba(255,255,255,0.14)'}` }}>
                                {active && <span className="text-[12px] text-teal-400">✓</span>}
                              </div>
                              <span className="text-[15px]" style={{ color: active ? 'rgb(45,212,191)' : 'white' }}>
                                {meta.icon} {meta.label}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {/* Intensity preference */}
                <div className="flex flex-col gap-3">
                  <div className="px-1">
                    <span className="text-[13px] font-medium text-white/40">Intensity preference</span>
                    <p className="text-[12px] text-white/25 mt-0.5">Higher = harder sessions recommended more easily</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { id: 'easy',     label: 'Easy',     desc: 'Zone 2 & recovery focus' },
                      { id: 'moderate', label: 'Moderate', desc: 'Balanced, default' },
                      { id: 'hard',     label: 'Hard',     desc: 'Push when body allows' },
                      { id: 'all_out',  label: 'All Out',  desc: 'Max effort, high threshold' },
                    ]).map(({ id, label, desc }) => {
                      const selected = trainingIntensity === id
                      return (
                        <button key={id} onClick={() => setTrainingIntensity(id)}
                          className="flex flex-col gap-0.5 px-4 py-3 rounded-[16px] text-left active:opacity-70 transition-opacity"
                          style={{ background: selected ? 'rgba(45,212,191,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${selected ? 'rgba(45,212,191,0.4)' : 'rgba(255,255,255,0.07)'}` }}>
                          <span className="text-[15px] font-semibold" style={{ color: selected ? 'rgb(45,212,191)' : 'white' }}>{label}</span>
                          <span className="text-[11px] text-white/35">{desc}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Goal priority — drag to reorder, top = highest priority */}
                <div className="flex flex-col gap-2">
                  <div className="px-1">
                    <span className="text-[13px] font-medium text-white/40">Goals</span>
                    <p className="text-[11px] text-white/25 mt-0.5">Sleep om volgorde te bepalen — bovenaan = hoogste prioriteit</p>
                  </div>
                  {(() => {
                    const GOAL_META: Record<string, { emoji: string; title: string; desc: string }> = {
                      lose_weight:  { emoji: '🔥', title: 'Lose weight',   desc: 'Calorie deficit, preserve muscle' },
                      build_muscle: { emoji: '💪', title: 'Build muscle',  desc: 'Progressive overload, calorie surplus' },
                      get_fitter:   { emoji: '🏃', title: 'Get fitter',    desc: 'Improve endurance and cardiovascular fitness' },
                      maintain:     { emoji: '⚖️', title: 'Maintain',      desc: 'Keep current weight and performance' },
                      performance:  { emoji: '🏆', title: 'Performance',   desc: 'Train for a race or competition' },
                    }
                    return (
                      <div ref={dragGoalContainerRef} className="rounded-[18px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.07)', touchAction: 'none' }}>
                        {goalOrder.map((key, i) => {
                          const m = GOAL_META[key]; if (!m) return null
                          const isDragging = draggingGoalKey === key
                          return (
                            <div
                              key={key}
                              data-goal-key={key}
                              className="flex items-center gap-3 px-4 py-3.5 cursor-grab active:cursor-grabbing select-none"
                              style={{ opacity: isDragging ? 0.4 : 1, borderBottom: i < goalOrder.length - 1 ? '1px solid rgba(255,255,255,0.06)' : undefined }}
                              onMouseDown={e => startGoalDrag(key, e)}
                              onTouchStart={e => startGoalDrag(key, e)}
                            >
                              <svg width="12" height="16" viewBox="0 0 12 20" fill="currentColor" className="shrink-0 text-white/30">
                                <circle cx="3" cy="3" r="2"/><circle cx="9" cy="3" r="2"/>
                                <circle cx="3" cy="10" r="2"/><circle cx="9" cy="10" r="2"/>
                                <circle cx="3" cy="17" r="2"/><circle cx="9" cy="17" r="2"/>
                              </svg>
                              <span className="text-[13px] text-teal-400/60 font-bold w-4 shrink-0">{i + 1}</span>
                              <span className="text-[18px] shrink-0">{m.emoji}</span>
                              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                <span className="text-[15px] font-semibold text-white">{m.title}</span>
                                <span className="text-[11px] text-white/35">{m.desc}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>

              </div>
            </div>
          )}

          {/* Macro mode choice overlay */}
          {editingMacroMode && (
            <div className="absolute inset-0 z-10 flex flex-col"
              style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
              <div className="flex items-center justify-between px-5 py-4 shrink-0">
                <button onClick={() => setEditingMacroMode(false)}
                  className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.10)' }}>
                  Back
                </button>
                <span className="text-[17px] font-semibold text-white">Macro Targets</span>
                <div className="w-16" />
              </div>
              <div className="flex-1 overflow-y-auto px-5 pb-8 flex flex-col gap-6 pt-4">
                <div>
                  <p className="text-[30px] font-bold text-white leading-tight">How do you want to set your macros?</p>
                  <p className="text-[15px] text-white/40 mt-1.5">The calculator uses your body stats and goal to compute optimal targets.</p>
                </div>
                <div className="flex flex-col gap-3">
                  <CalcCard emoji="🧮" title="Calculator"
                    desc="Answer a few questions and we'll calculate your targets"
                    selected={false} onSelect={openMacroCalc} />
                  <CalcCard emoji="✏️" title="Set manually"
                    desc="Enter your calorie and macro targets directly"
                    selected={false} onSelect={openMacroManual} />
                </div>
                {(savedMacroKcal > 0) && (
                  <div className="rounded-[14px] px-4 py-3"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <p className="text-[12px] text-white/35 mb-1 uppercase tracking-[0.08em] font-semibold">Current targets</p>
                    <p className="text-[15px] text-white/70">
                      {savedMacroKcal} kcal · {savedMacroProtein}g protein · {savedMacroCarbs}g carbs · {savedMacroFat}g fat
                    </p>
                  </div>
                )}

                {estimatedMaint && (
                  <div className="rounded-[14px] px-4 py-4"
                    style={{ background: 'rgba(45,212,191,0.05)', border: '1px solid rgba(45,212,191,0.18)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[12px] text-teal-400/80 uppercase tracking-[0.08em] font-semibold">Estimated maintenance</p>
                      <p className="text-[11px] text-white/30">~{estimatedMaint.sessionsPerWeek} sessions/wk</p>
                    </div>
                    <p className="text-[26px] font-bold text-white leading-none mb-2.5">
                      {estimatedMaint.kcal} <span className="text-[14px] font-normal text-white/40">kcal</span>
                    </p>
                    <div className="flex gap-3">
                      <span className="text-[13px] text-white/55">{estimatedMaint.protein}g protein</span>
                      <span className="text-[13px] text-white/25">·</span>
                      <span className="text-[13px] text-white/55">{estimatedMaint.carbs}g carbs</span>
                      <span className="text-[13px] text-white/25">·</span>
                      <span className="text-[13px] text-white/55">{estimatedMaint.fat}g fat</span>
                    </div>
                    <p className="text-[11px] text-white/25 mt-2.5">Based on your workouts · last 4 weeks · Mifflin–St Jeor</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Manual macro input overlay */}
          {editingMacroManual && (
            <div className="absolute inset-0 z-10 flex flex-col"
              style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
              <div className="flex items-center justify-between px-5 py-4 shrink-0">
                <button onClick={() => setEditingMacroManual(false)}
                  className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
                  style={{ background: 'rgba(255,255,255,0.10)' }}>
                  Back
                </button>
                <span className="text-[17px] font-semibold text-white">Set Macros</span>
                <button onClick={saveMacrosManual} disabled={manualSaving || !manualKcal || !manualProtein || !manualCarbs || !manualFat}
                  className="px-4 h-[34px] rounded-full bg-white text-black text-[15px] font-semibold disabled:opacity-40">
                  {manualSaving ? '…' : 'Save'}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pt-2 pb-12 flex flex-col gap-4">
                <ProfileSection title="Daily targets">
                  {([
                    { label: 'Calories', unit: 'kcal', value: manualKcal, set: setManualKcal },
                    { label: 'Protein',  unit: 'g',    value: manualProtein, set: setManualProtein },
                    { label: 'Carbs',    unit: 'g',    value: manualCarbs,   set: setManualCarbs },
                    { label: 'Fat',      unit: 'g',    value: manualFat,     set: setManualFat },
                  ] as const).map(({ label, unit, value, set }, i, arr) => (
                    <ProfileRow key={label} separator={i < arr.length - 1}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[17px] text-white">{label}</span>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            inputMode="numeric"
                            value={value}
                            onChange={e => (set as (v: string) => void)(e.target.value)}
                            placeholder="—"
                            className="w-20 bg-transparent text-white text-[17px] text-right outline-none placeholder:text-white/25"
                          />
                          <span className="text-[14px] text-white/35 w-8">{unit}</span>
                        </div>
                      </div>
                    </ProfileRow>
                  ))}
                </ProfileSection>
              </div>
            </div>
          )}

          {/* Macro calculator overlay */}
          {editingMacroCalc && (() => {
            // Steps: 0=gender 1=age 2=height 3=weight 4=goal
            //        5=target-weight+weeks-slider(lose/gain only) 6=results
            const deltaKg = calcTargetKg && Number(calcTargetKg) > 0
              ? Math.abs(Number(calcWeight) - Number(calcTargetKg))
              : 0

            // Slider controls rate in 0.1 kg/week steps (1–20 = 0.1–2.0 kg/week)
            const sliderRateX10 = Number(calcTargetWeeks) > 0 ? Number(calcTargetWeeks) : 5
            const sliderRate = sliderRateX10 / 10
            const sliderWeeks = deltaKg > 0 && sliderRate > 0 ? Math.ceil(deltaKg / sliderRate) : 0
            const sliderPct = (sliderRateX10 - 1) / (20 - 1) * 100

            const derivedRate = calcGoal !== 'maintain' && deltaKg > 0 ? sliderRate : 0
            const macros = calcStep === 6 ? computeMacros(derivedRate) : null

            const canNextMap: Record<number, boolean> = {
              0: !!calcGender,
              1: !!calcAge && Number(calcAge) > 0,
              2: !!calcHeight && Number(calcHeight) > 0,
              3: !!calcWeight && Number(calcWeight) > 0,
              4: !!calcGoal,
              5: deltaKg > 0,
            }
            const canNext = canNextMap[calcStep] ?? false

            const questionSteps = calcGoal === 'maintain' ? [0,1,2,3,4] : [0,1,2,3,4,5]
            const dotIdx = questionSteps.indexOf(calcStep)
            const totalDots = calcGoal === 'maintain' ? 5 : 6

            function goBack() {
              if (calcStep === 0) { setEditingMacroCalc(false); return }
              if (calcStep === 6) { setCalcSaved(false); setCalcStep(calcGoal === 'maintain' ? 4 : 5); return }
              setCalcStep(s => s - 1)
            }

            const deficit = macros ? Math.round(derivedRate * 7700 / 7) : 0
            const safeLabel = calcGoal === 'maintain' || !derivedRate ? null
              : derivedRate < 0.5  ? { text: 'Recommended',                          color: '#2dd4bf', icon: '✅' }
              : derivedRate < 0.75 ? { text: 'Acceptable',                            color: '#a3e635', icon: '⚠️' }
              : derivedRate < 1.5  ? { text: 'Aggressive — risk of muscle loss',      color: '#fb923c', icon: '🚨' }
              :                      { text: 'Not recommended — serious health risks', color: '#f87171', icon: '❌' }

            return (
              <div className="absolute inset-0 z-10 flex flex-col"
                style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>

                <div className="flex items-center justify-between px-5 py-4 shrink-0">
                  <button onClick={goBack}
                    className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
                    style={{ background: 'rgba(255,255,255,0.10)' }}>
                    {calcStep === 0 ? 'Back' : '‹ Back'}
                  </button>
                  {calcStep < 6 ? (
                    <div className="flex gap-1.5 items-center">
                      {Array.from({ length: totalDots }).map((_, i) => (
                        <div key={i} className="rounded-full transition-all duration-300"
                          style={{ width: i === dotIdx ? '16px' : '6px', height: '6px',
                            background: i <= dotIdx ? 'rgb(45,212,191)' : 'rgba(255,255,255,0.18)' }} />
                      ))}
                    </div>
                  ) : (
                    <span className="text-[17px] font-semibold text-white">Your macros</span>
                  )}
                  <div className="w-16" />
                </div>

                <div className="flex-1 overflow-y-auto px-5 pb-6" style={{ scrollbarWidth: 'none' }}>

                  {calcStep === 0 && (
                    <div className="flex flex-col gap-6 pt-3">
                      <div>
                        <p className="text-[30px] font-bold text-white leading-tight">What is your sex?</p>
                        <p className="text-[15px] text-white/40 mt-1.5">Required for the BMR calculation.</p>
                      </div>
                      <div className="flex flex-col gap-3">
                        {([
                          { v: 'male'   as const, e: '♂️', t: 'Male' },
                          { v: 'female' as const, e: '♀️', t: 'Female' },
                        ] as const).map(({ v, e, t }) => (
                          <CalcCard key={v} emoji={e} title={t} selected={calcGender === v}
                            onSelect={() => { setCalcGender(v); setCalcStep(1) }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {calcStep === 1 && <CalcNumberStep question="How old are you?"   unit="yrs" value={calcAge}    onChange={setCalcAge}    min={10}  max={100} />}
                  {calcStep === 2 && <CalcNumberStep question="How tall are you?"  unit="cm"  value={calcHeight} onChange={setCalcHeight} min={100} max={250} />}
                  {calcStep === 3 && <CalcNumberStep question="What do you weigh?" unit="kg"  value={calcWeight} onChange={setCalcWeight} min={30}  max={300} decimal />}

                  {calcStep === 4 && (
                    <div className="flex flex-col gap-6 pt-3">
                      <div>
                        <p className="text-[30px] font-bold text-white leading-tight">What is your goal?</p>
                        <p className="text-[15px] text-white/40 mt-1.5">This determines your calorie and macro targets.</p>
                      </div>
                      <div className="flex flex-col gap-3">
                        {([
                          { v: 'lose'     as const, e: '🔥', t: 'Lose weight',    d: 'Calorie deficit based on your target' },
                          { v: 'maintain' as const, e: '⚖️', t: 'Maintain weight', d: 'Maintenance calories' },
                          { v: 'gain'     as const, e: '💪', t: 'Build muscle',    d: 'Calorie surplus based on your target' },
                        ] as const).map(({ v, e, t, d }) => (
                          <CalcCard key={v} emoji={e} title={t} desc={d} selected={calcGoal === v}
                            onSelect={() => { setCalcGoal(v); setCalcStep(v === 'maintain' ? 6 : 5) }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Step 5: target weight + dynamic weeks slider */}
                  {calcStep === 5 && (
                    <div className="flex flex-col gap-8 pt-3">
                      <p className="text-[30px] font-bold text-white leading-tight">What do you want to weigh?</p>

                      {/* Current vs Goal side by side */}
                      <div className="flex items-end gap-4">
                        {/* Current weight (static) */}
                        <div className="flex flex-col items-center gap-1 flex-1">
                          <span className="text-[12px] font-semibold text-white/35 uppercase tracking-[0.10em]">Now</span>
                          <div className="flex items-baseline gap-1">
                            <span className="text-[48px] font-bold text-white/40 leading-none">{calcWeight || '—'}</span>
                            <span className="text-[16px] text-white/25">kg</span>
                          </div>
                        </div>

                        <span className="text-[24px] text-white/20 pb-2 shrink-0">→</span>

                        {/* Target weight (editable) */}
                        <div className="flex flex-col items-center gap-1 flex-1">
                          <span className="text-[12px] font-semibold text-teal-400 uppercase tracking-[0.10em]">Goal</span>
                          <div className="flex items-baseline gap-1">
                            <input
                              type="text" inputMode="decimal"
                              value={calcTargetKg}
                              onChange={e => {
                                const v = e.target.value.replace(',', '.')
                                if (/^\d*\.?\d*$/.test(v)) { setCalcTargetKg(v); setCalcTargetWeeks('') }
                              }}
                              placeholder="—"
                              className="text-[48px] font-bold text-white bg-transparent outline-none text-center"
                              style={{ width: '120px', caretColor: 'rgb(45,212,191)' }}
                            />
                            <span className="text-[16px] text-white/40">kg</span>
                          </div>
                        </div>
                      </div>

                      {/* ± buttons */}
                      <div className="flex justify-center gap-4 -mt-2">
                        <button onClick={() => { const v = Math.round((Math.max(30, (Number(calcTargetKg) || Number(calcWeight) || 70) - 0.5)) * 10) / 10; setCalcTargetKg(String(v)); setCalcTargetWeeks('') }}
                          className="w-[52px] h-[52px] rounded-full text-[26px] text-white flex items-center justify-center"
                          style={{ background: 'rgba(255,255,255,0.10)' }}>−</button>
                        <button onClick={() => { const v = Math.round((Math.min(300, (Number(calcTargetKg) || Number(calcWeight) || 70) + 0.5)) * 10) / 10; setCalcTargetKg(String(v)); setCalcTargetWeeks('') }}
                          className="w-[52px] h-[52px] rounded-full text-[26px] text-white flex items-center justify-center"
                          style={{ background: 'rgba(255,255,255,0.10)' }}>+</button>
                      </div>

                      {deltaKg > 0 && (
                        <div className="flex flex-col gap-3">
                          {/* Rate label (controlled) + weeks label (derived) */}
                          <div className="flex justify-between items-center px-1">
                            <span className="text-[13px] font-semibold text-white/50">
                              {sliderWeeks} week{sliderWeeks !== 1 ? 's' : ''}
                            </span>
                            <span className="text-[13px] font-semibold"
                              style={{ color: sliderRate < 0.5 ? '#2dd4bf' : sliderRate < 0.75 ? '#a3e635' : sliderRate < 1.5 ? '#fb923c' : '#f87171' }}>
                              {sliderRate.toFixed(1)} kg/week
                            </span>
                          </div>

                          {/* Slider — controls rate in 0.1 steps (1–20 = 0.1–2.0 kg/week) */}
                          <input
                            type="range"
                            min={1} max={20} step={1}
                            value={sliderRateX10}
                            onChange={e => setCalcTargetWeeks(e.target.value)}
                            className="w-full h-[4px] rounded-full appearance-none outline-none"
                            style={{
                              background: `linear-gradient(to right, rgb(45,212,191) 0%, rgb(45,212,191) ${sliderPct}%, rgba(255,255,255,0.15) ${sliderPct}%, rgba(255,255,255,0.15) 100%)`,
                              WebkitAppearance: 'none',
                            }}
                          />

                          {/* Safety indicator */}
                          {sliderRate >= 1.5 && (
                            <div className="rounded-[14px] px-4 py-3 mt-1"
                              style={{ background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)' }}>
                              <p className="text-[13px] text-red-400/80 leading-relaxed">
                                1.5 kg/week or more carries serious health risks. Slide left to slow down.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 6: results */}
                  {calcStep === 6 && macros && (
                    <div className="flex flex-col gap-5 pt-3">
                      <div>
                        <p className="text-[13px] font-semibold text-teal-400 uppercase tracking-[0.12em] mb-2">
                          {calcGoal === 'lose' ? 'Losing weight' : calcGoal === 'gain' ? 'Building muscle' : 'Maintaining weight'}
                        </p>
                        <p className="text-[56px] font-bold text-white leading-none">{macros.kcal}</p>
                        <p className="text-[16px] text-white/40 mt-1">
                          kcal per day
                          {calcGoal !== 'maintain' && macros.tdee && (
                            <span className="text-[13px] ml-2" style={{ color: calcGoal === 'lose' ? '#f87171' : '#4ade80' }}>
                              ({calcGoal === 'lose' ? '−' : '+'}{deficit} vs maintenance)
                            </span>
                          )}
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-2.5">
                        {([
                          { label: 'Protein', value: macros.protein, color: '#2dd4bf' },
                          { label: 'Carbs',   value: macros.carbs,   color: '#facc15' },
                          { label: 'Fat',     value: macros.fat,     color: '#818cf8' },
                        ]).map(({ label, value, color }) => (
                          <div key={label} className="flex flex-col gap-1.5 p-3.5 rounded-[16px]"
                            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <span className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color }}>{label}</span>
                            <div className="flex items-baseline gap-0.5">
                              <span className="text-[28px] font-bold text-white leading-none">{value}</span>
                              <span className="text-[10px] text-white/35 ml-0.5">g</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {calcGoal !== 'maintain' && safeLabel && (
                        <div className="rounded-[14px] px-4 py-3 flex items-center gap-3"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          <span className="text-[18px]">{safeLabel.icon}</span>
                          <div>
                            <p className="text-[14px] font-semibold" style={{ color: safeLabel.color }}>{safeLabel.text}</p>
                            <p className="text-[12px] text-white/35 mt-0.5">
                              {calcWeight} → {calcTargetKg} kg in {sliderWeeks} weeks · {derivedRate.toFixed(2)} kg/week
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="rounded-[14px] p-4"
                        style={{ background: 'rgba(45,212,191,0.06)', border: '1px solid rgba(45,212,191,0.14)' }}>
                        <p className="text-[13px] text-white/50 leading-relaxed">
                          Calculated via <span className="text-white/70 font-medium">Mifflin-St Jeor</span> · maintenance {macros.tdee} kcal · {calcGoal === 'lose' ? 2.2 : calcGoal === 'gain' ? 2.0 : 1.8}g protein/kg
                        </p>
                      </div>

                      <button onClick={saveMacros} disabled={calcSaving || calcSaved}
                        className="w-full h-[52px] rounded-[16px] font-bold text-[16px] transition-all disabled:opacity-60"
                        style={{
                          background: calcSaved ? 'rgba(45,212,191,0.12)' : 'rgba(45,212,191,0.18)',
                          border: '1.5px solid rgba(45,212,191,0.38)',
                          color: 'rgb(45,212,191)',
                        }}>
                        {calcSaving ? 'Saving…' : calcSaved ? '✓ Saved as targets' : 'Save as targets'}
                      </button>
                    </div>
                  )}
                </div>

                {(calcStep >= 1 && calcStep <= 3 || calcStep === 6) && (
                  <div className="shrink-0 px-5 pb-8 pt-2">
                    <button onClick={() => setCalcStep(s => s + 1)} disabled={!canNext}
                      className="w-full h-[52px] rounded-[16px] font-bold text-[16px] text-white transition-all disabled:opacity-30"
                      style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.12)' }}>
                      {calcStep === 6 ? 'Calculate my macros →' : 'Next →'}
                    </button>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-5 pt-2 pb-12 flex flex-col gap-6" style={{ scrollbarWidth: 'none' }}>

            {/* Profile hero */}
            <button onClick={() => { setEditingAccountInfo(true); loadShortcutToken() }}
              className="flex items-center gap-4 w-full p-4 rounded-[18px] text-left active:opacity-70"
              style={{ background: 'rgba(255,255,255,0.07)' }}>
              <div className="w-[56px] h-[56px] rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.28), rgba(45,212,191,0.05))', border: '1px solid rgba(45,212,191,0.25)' }}>
                <User size={26} className="text-teal-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[19px] font-semibold text-white truncate">{editName || '—'}</p>
                <p className="text-[13px] text-white/40 truncate">{maskEmail(email ?? '—')}</p>
              </div>
              <ChevronRight size={20} className="text-white/25 shrink-0" />
            </button>

            {/* Your Plan */}
            <ProfileSection title="Your Plan">
              <MenuRow separator
                icon={<Dumbbell size={16} className="text-teal-300" />} tint="rgba(45,212,191,0.15)"
                label="Training"
                value={trainingGoal ? trainingGoal.replace('_', ' ').replace(/\b\w/, c => c.toUpperCase()) : undefined}
                onClick={() => setEditingTraining(true)} />
              <MenuRow
                icon={<Flame size={16} className="text-orange-300" />} tint="rgba(251,146,60,0.15)"
                label="Nutrition & Macros"
                value={savedMacroKcal > 0 ? `${savedMacroKcal} kcal` : undefined}
                onClick={openMacroChoice} />
            </ProfileSection>

            {/* Connections */}
            <ProfileSection title="Connections">
              <MenuRow
                icon={<Cable size={16} className="text-sky-300" />} tint="rgba(56,189,248,0.15)"
                label="Devices & Apps"
                value={(() => {
                  const count = [
                    services?.strava, services?.fitbit, services?.hevy, services?.google,
                  ].filter(Boolean).length
                  return count ? `${count} connected` : 'None'
                })()}
                onClick={() => setEditingDevices(true)} />
            </ProfileSection>

            {/* Preferences */}
            <ProfileSection title="Preferences">
              <MenuRow
                icon={<SlidersHorizontal size={16} className="text-white/70" />} tint="rgba(255,255,255,0.10)"
                label="App Settings"
                onClick={() => setEditingSettings(true)} />
            </ProfileSection>

            {/* Account */}
            <ProfileSection title="Account">
              <button onClick={handleSignOut}
                className="flex items-center gap-3.5 w-full px-4 py-3.5 text-left active:opacity-60"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <LogOut size={18} className="text-red-400 shrink-0" />
                <span className="text-[17px] font-medium text-red-400">Sign Out</span>
              </button>
              <button onClick={() => { setDeleteStep('password'); setDeletePassword(''); setDeleteMsg(null); setDeletingAccount(true) }}
                className="flex items-center gap-3.5 w-full px-4 py-3.5 text-left active:opacity-60">
                <Trash2 size={18} className="text-red-400 shrink-0" />
                <span className="text-[17px] font-medium text-red-400">Delete Account</span>
              </button>
            </ProfileSection>

          </div>
        </div>
      )}

      {emailActionSheet && (
        <div className="fixed inset-0 z-[10001] flex items-end justify-center pb-8 px-5"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setEmailActionSheet(false)}>
          <div className="w-full max-w-sm flex flex-col gap-3" onClick={e => e.stopPropagation()}>
            <div className="rounded-[14px] overflow-hidden" style={{ background: 'rgba(28,28,30,0.99)' }}>
              <div className="px-5 pt-4 pb-3.5 border-b border-white/[0.08] text-center">
                <p className="text-[13px] text-white/40">{maskEmail(email ?? '')}</p>
              </div>
              <button
                onClick={() => { setEmailActionSheet(false); setEditEmail(email ?? ''); setEditMsg(null); setEditingEmail(true) }}
                className="w-full py-4 text-[17px] text-white text-center border-b border-white/[0.08] active:bg-white/[0.06]">
                Change Email
              </button>
              <button
                onClick={() => setEmailActionSheet(false)}
                className="w-full py-4 text-[17px] text-orange-400 font-semibold text-center active:bg-white/[0.06]">
                Unlink Email
              </button>
            </div>
            <button onClick={() => setEmailActionSheet(false)}
              className="w-full py-4 rounded-[14px] text-[17px] font-semibold text-white text-center active:opacity-70"
              style={{ background: 'rgba(28,28,30,0.99)' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Delete account — step 1: password, step 2: confirm */}
      {deletingAccount && (
        <div className="fixed inset-0 z-[10001] flex flex-col"
          style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>
          <div className="flex items-center justify-between px-5 py-4 shrink-0">
            <button onClick={() => {
                if (deleteStep === 'confirm') { setDeleteStep('password'); setDeleteMsg(null); return }
                setDeletingAccount(false); setDeletePassword(''); setDeleteMsg(null)
              }}
              className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
              style={{ background: 'rgba(255,255,255,0.10)' }}>
              {deleteStep === 'confirm' ? 'Back' : 'Cancel'}
            </button>
            <span className="text-[17px] font-semibold text-white">Delete Account</span>
            {deleteStep === 'password' ? (
              <button onClick={() => { setDeleteMsg(null); setDeleteStep('confirm') }} disabled={!deletePassword}
                className="px-4 h-[34px] rounded-full bg-white text-black text-[15px] font-semibold disabled:opacity-40">
                Volgende
              </button>
            ) : <div className="w-16" />}
          </div>

          <div className="flex-1 overflow-y-auto px-5 pt-4 pb-12 flex flex-col gap-4">
            {deleteStep === 'password' ? (
              <>
                <ProfileSection title="Bevestig je wachtwoord">
                  <ProfileRow>
                    <input
                      type="password"
                      autoFocus
                      value={deletePassword}
                      onChange={e => setDeletePassword(e.target.value)}
                      placeholder="Wachtwoord"
                      autoComplete="current-password"
                      className="w-full bg-transparent text-white text-[17px] outline-none placeholder:text-white/25"
                    />
                  </ProfileRow>
                </ProfileSection>
                <p className="text-[13px] text-white/40 px-1 leading-relaxed">
                  Voer je wachtwoord in om door te gaan. In de volgende stap bevestig je het definitief verwijderen.
                </p>
              </>
            ) : (
              <>
                <div className="rounded-[18px] px-4 py-4"
                  style={{ background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)' }}>
                  <p className="text-[15px] font-semibold text-red-400 mb-1.5">Weet je het zeker?</p>
                  <p className="text-[13.5px] text-white/55 leading-relaxed">
                    Dit verwijdert je account en <strong className="text-white/80">alle</strong> bijbehorende data
                    permanent — voeding, trainingen, gezondheid, koppelingen en instellingen. Dit kan niet ongedaan
                    worden gemaakt.
                  </p>
                </div>
                <button
                  onClick={handleDeleteAccount}
                  disabled={deleteBusy}
                  className="h-[54px] rounded-[16px] text-white font-semibold text-[16px] flex items-center justify-center disabled:opacity-50 active:scale-[0.98] transition-transform"
                  style={{ background: 'rgb(220,38,38)' }}>
                  {deleteBusy ? 'Verwijderen…' : 'Verwijder mijn account permanent'}
                </button>
              </>
            )}
            {deleteMsg && (
              <p className="text-[14px] text-center px-1 text-red-400">{deleteMsg}</p>
            )}
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
                <p className="text-[17px] font-semibold text-white mb-1">Disconnect {disconnectLabel}</p>
                <p className="text-[13px] text-white/50">Your data will no longer be synced.</p>
              </div>
              <button
                onClick={handleDisconnect}
                className="w-full py-4 text-[17px] font-semibold text-red-400 text-center"
              >
                Disconnect
              </button>
            </div>
            <button
              onClick={() => setConfirmDisconnect(null)}
              className="w-full py-4 rounded-[14px] text-[17px] font-semibold text-white text-center"
              style={{ background: 'rgba(30,30,30,0.98)' }}
            >
              Cancel
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

function MenuRow({ icon, tint, label, value, onClick, separator }: {
  icon: React.ReactNode; tint?: string; label: string; value?: string
  onClick: () => void; separator?: boolean
}) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-3.5 w-full px-4 py-3 text-left active:opacity-60"
      style={{ borderBottom: separator ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
      <div className="w-[30px] h-[30px] rounded-[9px] flex items-center justify-center shrink-0"
        style={{ background: tint ?? 'rgba(255,255,255,0.08)' }}>
        {icon}
      </div>
      <span className="flex-1 text-[17px] text-white">{label}</span>
      {value && <span className="text-[13px] text-white/40">{value}</span>}
      <ChevronRight size={18} className="text-white/25 shrink-0" />
    </button>
  )
}

function CalcCard({ emoji, title, desc, selected, onSelect }: {
  emoji?: string; title: string; desc?: string; selected: boolean; onSelect: () => void
}) {
  return (
    <button onClick={onSelect}
      className="w-full px-4 py-4 rounded-[16px] flex items-center gap-3.5 text-left active:scale-[0.98] transition-transform"
      style={{
        background: selected ? 'rgba(45,212,191,0.10)' : 'rgba(255,255,255,0.07)',
        border: `1.5px solid ${selected ? 'rgba(45,212,191,0.35)' : 'rgba(255,255,255,0.08)'}`,
      }}>
      {emoji && <span className="text-[26px] shrink-0 leading-none">{emoji}</span>}
      <div className="flex-1">
        <p className="text-[17px] font-semibold text-white leading-snug">{title}</p>
        {desc && <p className="text-[13px] text-white/40 mt-0.5">{desc}</p>}
      </div>
      <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${selected ? 'bg-teal-400 border-teal-400' : 'border-white/20'}`}>
        {selected && <span className="text-[10px] text-black font-bold leading-none">✓</span>}
      </div>
    </button>
  )
}

function CalcNumberStep({ question, unit, value, onChange, min, max, decimal }: {
  question: string; unit: string; value: string; onChange: (v: string) => void; min: number; max: number; decimal?: boolean
}) {
  const step = decimal ? 0.5 : 1
  return (
    <div className="flex flex-col gap-10 pt-3">
      <p className="text-[30px] font-bold text-white leading-tight">{question}</p>
      <div className="flex flex-col items-center gap-6">
        <div className="flex items-baseline gap-2">
          <input
            type="text" inputMode="decimal" value={value}
            onChange={e => {
              const v = e.target.value.replace(',', '.')
              if (/^\d*\.?\d*$/.test(v)) onChange(v)
            }}
            placeholder="—"
            className="text-[72px] font-bold text-white bg-transparent outline-none text-center"
            style={{ width: '180px', caretColor: 'rgb(45,212,191)' }}
          />
          <span className="text-[22px] text-white/40 font-medium">{unit}</span>
        </div>
        <div className="flex gap-4">
          <button onClick={() => {
            const next = Math.round((Math.max(min, (Number(value) || 0) - step)) * 10) / 10
            onChange(String(next))
          }}
            className="w-[52px] h-[52px] rounded-full text-[26px] text-white flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.10)' }}>−</button>
          <button onClick={() => {
            const next = Math.round((Math.min(max, (Number(value) || 0) + step)) * 10) / 10
            onChange(String(next))
          }}
            className="w-[52px] h-[52px] rounded-full text-[26px] text-white flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.10)' }}>+</button>
        </div>
      </div>
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
