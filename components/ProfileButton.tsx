'use client'

import { useState, useEffect, useRef } from 'react'
import useSWR, { mutate } from 'swr'
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
  const [timeFormat, setTimeFormat] = useState<'24h' | '12h'>('24h')

  // Training preferences
  const [editingTraining, setEditingTraining] = useState(false)
  const [trainingSaving, setTrainingSaving] = useState(false)
  const [trainingGoal, setTrainingGoal] = useState<string | null>(null)
  const [trainingFrequencies, setTrainingFrequencies] = useState<Record<string, number>>({ gym: 0, running: 0, cycling: 0, swimming: 0 })
  const [trainingIntensity, setTrainingIntensity] = useState<string>('moderate')
  const [sportOrder, setSportOrder] = useState<string[]>(['running', 'cycling', 'swimming', 'gym'])
  const [activeSport, setActiveSport] = useState<string | null>(null)
  const [weeklyDone, setWeeklyDone] = useState<Record<string, number>>({})
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
  const [calcActivity, setCalcActivity] = useState<number | null>(null)
  const [calcSaving, setCalcSaving] = useState(false)
  const [calcSaved, setCalcSaved] = useState(false)
  const [calcTargetKg, setCalcTargetKg] = useState('')
  const [calcTargetWeeks, setCalcTargetWeeks] = useState('')
  const [savedCalcHeight, setSavedCalcHeight] = useState('')
  const [savedCalcAge, setSavedCalcAge] = useState('')
  const [savedCalcGender, setSavedCalcGender] = useState<'male' | 'female' | null>(null)
  const [manualKcal, setManualKcal] = useState('')
  const [manualProtein, setManualProtein] = useState('')
  const [manualCarbs, setManualCarbs] = useState('')
  const [manualFat, setManualFat] = useState('')
  const [manualSaving, setManualSaving] = useState(false)
  const [savedMacroKcal, setSavedMacroKcal] = useState(0)
  const [savedMacroProtein, setSavedMacroProtein] = useState(0)
  const [savedMacroCarbs, setSavedMacroCarbs] = useState(0)
  const [savedMacroFat, setSavedMacroFat] = useState(0)

  const { data: healthRows = [] } = useSWR<any[]>('health-gezondheid')
  const router = useRouter()

  useEffect(() => {
    const nav = document.querySelector('[data-bottom-nav]') as HTMLElement | null
    if (nav) nav.style.display = open ? 'none' : ''
    return () => { if (nav) nav.style.display = '' }
  }, [open])

  useEffect(() => {
    if (!open) return
    setTimeFormat((localStorage.getItem('time_format') as '24h' | '12h') ?? '24h')
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
        .select('units,step_goal,strength_squat_ref,strength_bench_ref,strength_deadlift_ref,hidden_pages,height_cm,age,gender,macro_kcal,macro_protein,macro_carbs,macro_fat,training_goal,training_frequencies,training_intensity,training_sport_priority,training_goal_priority')
        .eq('user_id', uid).single()
        .then(({ data }) => {
          if (data?.units) setUnits(data.units as Units)
          if (data?.step_goal) setStepGoal(data.step_goal)
          if (data?.strength_squat_ref) setSquatRef(data.strength_squat_ref)
          if (data?.strength_bench_ref) setBenchRef(data.strength_bench_ref)
          if (data?.strength_deadlift_ref) setDeadliftRef(data.strength_deadlift_ref)
          setHiddenPages(Array.isArray(data?.hidden_pages) ? data.hidden_pages : [])
          if (data?.height_cm) setSavedCalcHeight(String(Math.round(Number(data.height_cm))))
          if (data?.age) setSavedCalcAge(String(data.age))
          if (data?.gender === 'male' || data?.gender === 'female') setSavedCalcGender(data.gender)
          if (data?.macro_kcal) setSavedMacroKcal(data.macro_kcal)
          if (data?.macro_protein) setSavedMacroProtein(data.macro_protein)
          if (data?.macro_carbs) setSavedMacroCarbs(data.macro_carbs)
          if (data?.macro_fat) setSavedMacroFat(data.macro_fat)
          if (data?.training_goal) setTrainingGoal(data.training_goal)
          if (data?.training_frequencies && typeof data.training_frequencies === 'object')
            setTrainingFrequencies({ gym: 0, running: 0, cycling: 0, swimming: 0, ...data.training_frequencies })
          if (data?.training_intensity) setTrainingIntensity(data.training_intensity)
          if (Array.isArray(data?.training_sport_priority) && data.training_sport_priority.length > 0)
            setSportOrder(data.training_sport_priority)
          if (Array.isArray(data?.training_goal_priority) && data.training_goal_priority.length > 0)
            setGoalOrder(data.training_goal_priority)
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
            ? 'Fitbit is not connected.'
            : apiError
              ? `Sync error: ${apiError}`
              : 'Fitbit sync failed.',
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
          : `Fitbit updated: ${data.healthSynced ?? 0} health rows, ${data.stepsSynced ?? 0} step days.`,
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

  function toggleTimeFormat() {
    const next: '24h' | '12h' = timeFormat === '24h' ? '12h' : '24h'
    setTimeFormat(next)
    localStorage.setItem('time_format', next)
  }

  function openMacroChoice() {
    setEditingMacroMode(true)
  }

  function openMacroCalc() {
    const latestWeight = healthRows.find((r: any) => r.gewicht != null)?.gewicht ?? null
    setCalcStep(0); setCalcGoal(null)
    setCalcGender(savedCalcGender)
    setCalcAge(savedCalcAge)
    setCalcHeight(savedCalcHeight)
    setCalcWeight(latestWeight ? String(Math.round(Number(latestWeight) * 10) / 10) : '')
    setCalcActivity(null); setCalcSaved(false); setCalcTargetKg(''); setCalcTargetWeeks('')
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

  function computeMacros(rate = 0) {
    const w = Number(calcWeight), h = Number(calcHeight), a = Number(calcAge)
    if (!w || !h || !a || !calcGender || !calcActivity || !calcGoal) return null
    const bmr = calcGender === 'male'
      ? 10 * w + 6.25 * h - 5 * a + 5
      : 10 * w + 6.25 * h - 5 * a - 161
    const tdee = Math.round(bmr * calcActivity)
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
    const resolvedWeeks = Number(calcTargetWeeks) > 0
      ? Number(calcTargetWeeks)
      : deltaKg > 0 ? Math.round(deltaKg / 0.5) : 1
    const derivedRate = calcGoal !== 'maintain' && deltaKg > 0
      ? Math.max(0.1, deltaKg / resolvedWeeks)
      : 0
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
      })
      .eq('user_id', userId)
    setSavedCalcHeight(calcHeight)
    setSavedCalcAge(calcAge)
    setSavedCalcGender(calcGender)
    setSavedMacroKcal(m.kcal); setSavedMacroProtein(m.protein)
    setSavedMacroCarbs(m.carbs); setSavedMacroFat(m.fat)
    const newTargets = { kcal: m.kcal, protein: m.protein, carbs: m.carbs, fat: m.fat }
    const today = new Date().toISOString().split('T')[0]
    mutate('food-log', (cur: any) => cur ? { ...cur, targets: newTargets } : cur, false)
    mutate(`food-log-${today}`, (cur: any) => cur ? { ...cur, targets: newTargets } : cur, false)
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
    const newTargets = { kcal, protein, carbs, fat }
    const today = new Date().toISOString().split('T')[0]
    mutate('food-log', (cur: any) => cur ? { ...cur, targets: newTargets } : cur, false)
    mutate(`food-log-${today}`, (cur: any) => cur ? { ...cur, targets: newTargets } : cur, false)
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

  async function saveTraining() {
    if (!userId) return
    setTrainingSaving(true)
    await createClient()
      .from('user_settings')
      .update({ training_goal: trainingGoal, training_frequencies: trainingFrequencies, training_intensity: trainingIntensity, training_sport_priority: sportOrder, training_goal_priority: goalOrder })
      .eq('user_id', userId)
    setTrainingSaving(false)
    setEditingTraining(false)
    mutate('today')
    mutate('training')
  }

  function setFreq(sport: string, delta: number) {
    setTrainingFrequencies(prev => ({ ...prev, [sport]: Math.max(0, Math.min(7, (prev[sport] ?? 0) + delta)) }))
  }

  useEffect(() => {
    if (!activeSport || !userId) return
    const supabase = createClient()
    const now = new Date()
    const day = now.getDay() // 0=Sun
    const diffToMon = (day === 0 ? -6 : 1 - day)
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() + diffToMon)
    weekStart.setHours(0, 0, 0, 0)
    const weekStartStr = weekStart.toISOString()

    const done: Record<string, number> = { running: 0, cycling: 0, swimming: 0, gym: 0 }

    Promise.all([
      supabase.from('strava_activities').select('sport_type').eq('user_id', userId).gte('start_date', weekStartStr),
      supabase.from('hevy_workouts').select('id').eq('user_id', userId).gte('start_time', weekStartStr),
    ]).then(([strava, hevy]) => {
      for (const a of strava.data ?? []) {
        const t = (a.sport_type ?? '').toLowerCase().replace(/_/g, '')
        if (['run', 'virtualrun', 'trailrun'].includes(t)) done.running++
        else if (['ride', 'virtualride', 'ebikeride', 'gravelride', 'mountainbikeride'].includes(t)) done.cycling++
        else if (['swim'].includes(t)) done.swimming++
        else if (['weighttraining', 'workout', 'crossfit', 'elliptical', 'rockclimbing'].includes(t)) done.gym++
      }
      done.gym += hevy.data?.length ?? 0
      setWeeklyDone({ ...done })
    })
  }, [activeSport, userId])

  type SessionTemplate = { title: string; subtitle: string; duration: string; emoji: string; href: string }

  function getSessionTemplates(sport: string, freq: number): SessionTemplate[] {
    const n = Math.max(1, Math.min(freq, 7))
    if (sport === 'running') {
      const all: SessionTemplate[] = [
        { title: 'Easy run',          subtitle: 'Zone 2 aerobic — conversational pace',        duration: '40–50 min', emoji: '🏃', href: '/training/session?title=Easy+Run' },
        { title: 'Interval training', subtitle: '5×1 km at 5K pace — VO2max boost',             duration: '45–55 min', emoji: '⚡', href: '/training/session?title=Running+Intervals' },
        { title: 'Long run',          subtitle: 'Slow & steady — builds endurance base',        duration: '60–90 min', emoji: '🛣️', href: '/training/session?title=Long+Run' },
        { title: 'Tempo run',         subtitle: 'Comfortably hard — lactate threshold',         duration: '35–45 min', emoji: '🔥', href: '/training/session?title=Tempo+Run' },
        { title: 'Hill repeats',      subtitle: '6–8 × 90s uphill — strength & power',         duration: '40–50 min', emoji: '⛰️', href: '/training/session?title=Hill+Repeats' },
      ]
      return all.slice(0, n)
    }
    if (sport === 'cycling') {
      const all: SessionTemplate[] = [
        { title: 'Endurance ride',  subtitle: 'Zone 2 — fat metabolism & aerobic base',       duration: '60–90 min', emoji: '🚴', href: '/training/session?title=Endurance+Ride' },
        { title: 'FTP intervals',   subtitle: '3×10 min threshold — raise FTP',               duration: '55–65 min', emoji: '⚡', href: '/training/session?title=FTP+Intervals' },
        { title: 'Recovery ride',   subtitle: 'Easy spin — flush legs & recover',             duration: '30–45 min', emoji: '🌱', href: '/training/session?title=Recovery+Ride' },
        { title: 'VO₂max effort',   subtitle: '5×3 min at 110% FTP — aerobic ceiling',       duration: '50–60 min', emoji: '🔥', href: '/training/session?title=VO2max+Cycling' },
        { title: 'Long ride',       subtitle: 'Steady endurance — big aerobic volume',        duration: '90–120 min', emoji: '🛣️', href: '/training/session?title=Long+Ride' },
      ]
      return all.slice(0, n)
    }
    if (sport === 'swimming') {
      const all: SessionTemplate[] = [
        { title: 'Endurance swim',   subtitle: 'Steady aerobic pace — 2000–3000m',            duration: '45–60 min', emoji: '🏊', href: '/training/session?title=Endurance+Swim' },
        { title: 'Speed intervals',  subtitle: '8×100m with 20s rest — pace work',            duration: '45–55 min', emoji: '⚡', href: '/training/session?title=Swimming+Intervals' },
        { title: 'Technique drills', subtitle: 'Pull buoy, catch drills, form focus',         duration: '40–50 min', emoji: '🎯', href: '/training/session?title=Swim+Technique' },
        { title: 'Mixed session',    subtitle: 'Warm-up + speed + endurance + cool-down',     duration: '55–70 min', emoji: '🌊', href: '/training/session?title=Swimming' },
      ]
      return all.slice(0, n)
    }
    if (sport === 'gym') {
      const splits: SessionTemplate[][] = [
        [{ title: 'Full body',  subtitle: 'Squat · press · row · hinge — all patterns',         duration: '55–65 min', emoji: '🏋️', href: '/training/strength' }],
        [
          { title: 'Upper body', subtitle: 'Chest · shoulders · back · arms',                   duration: '50–60 min', emoji: '💪', href: '/training/strength' },
          { title: 'Lower body', subtitle: 'Squat · hinge · calves · core',                     duration: '50–60 min', emoji: '🦵', href: '/training/strength' },
        ],
        [
          { title: 'Push',  subtitle: 'Chest · shoulders · triceps',                            duration: '55–65 min', emoji: '⬆️', href: '/training/strength' },
          { title: 'Pull',  subtitle: 'Back · rear delts · biceps',                             duration: '55–65 min', emoji: '⬇️', href: '/training/strength' },
          { title: 'Legs',  subtitle: 'Quads · hamstrings · glutes · calves',                  duration: '55–65 min', emoji: '🦵', href: '/training/strength' },
        ],
        [
          { title: 'Upper A', subtitle: 'Chest focus — bench · OHP · rows',                    duration: '55–65 min', emoji: '💪', href: '/training/strength' },
          { title: 'Lower A', subtitle: 'Squat focus — back squat · lunges · RDL',             duration: '55–65 min', emoji: '🦵', href: '/training/strength' },
          { title: 'Upper B', subtitle: 'Back focus — pull-ups · rows · chest',                duration: '55–65 min', emoji: '🔄', href: '/training/strength' },
          { title: 'Lower B', subtitle: 'Hinge focus — deadlift · leg press · core',           duration: '55–65 min', emoji: '🔁', href: '/training/strength' },
        ],
      ]
      const split = splits[Math.min(n - 1, splits.length - 1)]
      return split.slice(0, n)
    }
    return []
  }


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
                  Back
                </button>
                <span className="text-[17px] font-semibold text-white">Account</span>
                <button onClick={saveAccount} disabled={editSaving}
                  className="px-4 h-[34px] rounded-full bg-white text-black text-[15px] font-semibold disabled:opacity-50">
                  {editSaving ? '…' : 'Save'}
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 pt-4 pb-12 flex flex-col gap-4">
                <ProfileSection title="Name">
                  <ProfileRow>
                    <input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      placeholder="Name"
                      className="w-full bg-transparent text-white text-[17px] outline-none placeholder:text-white/30"
                    />
                  </ProfileRow>
                </ProfileSection>
                <ProfileSection title="Email">
                  <ProfileRow>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={e => setEditEmail(e.target.value)}
                      placeholder="Email address"
                      className="w-full bg-transparent text-white text-[17px] outline-none placeholder:text-white/30"
                    />
                  </ProfileRow>
                </ProfileSection>
                <ProfileSection title="Password">
                  <ProfileRow separator>
                    <input
                      type="password"
                      value={editPassword}
                      onChange={e => setEditPassword(e.target.value)}
                      placeholder="New password"
                      className="w-full bg-transparent text-white text-[17px] outline-none placeholder:text-white/30"
                    />
                  </ProfileRow>
                  <ProfileRow>
                    <input
                      type="password"
                      value={editPasswordConfirm}
                      onChange={e => setEditPasswordConfirm(e.target.value)}
                      placeholder="Confirm password"
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

                <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
                  <button onClick={() => setEditingPages(false)}
                    className="px-4 h-[34px] rounded-full text-white text-[15px] font-semibold"
                    style={{ background: 'rgba(255,255,255,0.10)' }}>
                    Back
                  </button>
                  <button onClick={savePages} disabled={pagesSaving}
                    className="px-4 h-[34px] rounded-full bg-white text-black text-[15px] font-semibold disabled:opacity-50">
                    {pagesSaving ? '…' : 'Save'}
                  </button>
                </div>

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

          {/* Training preferences overlay */}
          {editingTraining && (
            <div className="absolute inset-0 z-10 flex flex-col"
              style={{ background: 'rgb(5, 6, 8)', paddingTop: 'env(safe-area-inset-top, 0px)' }}>

              {/* Sport session templates sub-overlay */}
              {activeSport && (() => {
                const SPORT_META: Record<string, { label: string; icon: string }> = {
                  running:  { label: 'Running',        icon: '🏃' },
                  cycling:  { label: 'Cycling',        icon: '🚴' },
                  swimming: { label: 'Swimming',       icon: '🏊' },
                  gym:      { label: 'Gym / Strength', icon: '🏋️' },
                }
                const meta = SPORT_META[activeSport]
                const freq = trainingFrequencies[activeSport] ?? 0
                const templates = getSessionTemplates(activeSport, freq)
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
                        {(() => {
                          const done = weeklyDone[activeSport] ?? 0
                          const remaining = Math.max(0, freq - done)
                          return (
                            <p className="text-[13px] text-white/35">
                              {freq}× per week ·{' '}
                              {done > 0 ? <span className="text-green-400/70">{done} gedaan</span> : null}
                              {done > 0 && remaining > 0 ? ' · ' : null}
                              {remaining > 0 ? <span className="text-teal-400/70">{remaining} te gaan</span> : null}
                              {done >= freq && freq > 0 ? <span className="text-green-400/70"> Week voltooid 🎉</span> : null}
                            </p>
                          )
                        })()}
                      </div>
                      <div className="flex flex-col gap-3">
                        {templates.map((t, i) => {
                          const done = i < (weeklyDone[activeSport] ?? 0)
                          const isNext = !done && i === (weeklyDone[activeSport] ?? 0)
                          return (
                            <button
                              key={i}
                              onClick={() => { if (!done) { saveTraining(); setOpen(false); router.push(t.href) } }}
                              className="flex items-center gap-4 px-4 py-4 rounded-[18px] text-left transition-opacity"
                              style={{
                                background: done ? 'rgba(74,222,128,0.06)' : isNext ? 'rgba(45,212,191,0.10)' : 'rgba(255,255,255,0.05)',
                                border: `1px solid ${done ? 'rgba(74,222,128,0.20)' : isNext ? 'rgba(45,212,191,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                opacity: done ? 0.65 : 1,
                              }}
                            >
                              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-[20px]"
                                style={{ background: done ? 'rgba(74,222,128,0.15)' : 'rgba(45,212,191,0.12)' }}>
                                {done ? '✓' : t.emoji}
                              </div>
                              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-[11px] font-bold uppercase tracking-[0.1em] ${done ? 'text-green-400/70' : isNext ? 'text-teal-400' : 'text-white/30'}`}>
                                    {done ? 'Gedaan' : isNext ? 'Volgende' : `Sessie ${i + 1}`}
                                  </span>
                                </div>
                                <span className={`text-[15px] font-semibold leading-tight ${done ? 'text-white/50' : 'text-white'}`}>{t.title}</span>
                                <span className="text-[12px] text-white/40 leading-snug">{t.subtitle}</span>
                                <span className="text-[11px] text-white/25 mt-0.5">{t.duration}</span>
                              </div>
                              {!done && <ChevronRight size={16} className={`shrink-0 ${isNext ? 'text-teal-400/50' : 'text-white/20'}`} />}
                            </button>
                          )
                        })}
                      </div>
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
                    <span className="text-[13px] font-medium text-white/40">Weekly frequency</span>
                    <p className="text-[11px] text-white/25 mt-0.5">Tap een sport voor trainingsschema's</p>
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
                                  <span className="text-[16px] shrink-0">{meta.icon}</span>
                                  <span className="flex-1 text-[15px] text-white">{meta.label}</span>
                                  {val > 0 && <ChevronRight size={14} className="text-white/25 shrink-0" />}
                                </button>
                                <div className="flex items-center gap-2 shrink-0">
                                  <button onClick={() => setFreq(key, -1)} disabled={val === 0}
                                    className="w-[28px] h-[28px] rounded-full text-[18px] text-white flex items-center justify-center disabled:opacity-25 active:opacity-60"
                                    style={{ background: 'rgba(255,255,255,0.10)' }}>−</button>
                                  <span className="text-[15px] font-semibold text-white w-6 text-center">{val === 0 ? '–' : `${val}×`}</span>
                                  <button onClick={() => setFreq(key, +1)} disabled={val === 7}
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
            // Steps: 0=gender 1=age 2=height 3=weight 4=activity 5=goal
            //        6=target-weight+weeks-slider(lose/gain only) 7=results
            const ACTS = [
              { label: 'Sedentary',         desc: 'Desk job, no exercise',     v: 1.2   },
              { label: 'Lightly active',    desc: '1–3× exercise per week',    v: 1.375 },
              { label: 'Moderately active', desc: '3–5× exercise per week',    v: 1.55  },
              { label: 'Very active',       desc: '6–7× exercise per week',    v: 1.725 },
              { label: 'Extra active',      desc: 'Athlete / physical job',    v: 1.9   },
            ]

            const deltaKg = calcTargetKg && Number(calcTargetKg) > 0
              ? Math.abs(Number(calcWeight) - Number(calcTargetKg))
              : 0

            // Dynamic slider range: fastest = 2 kg/week, slowest = 0.1 kg/week
            const minWeeks = deltaKg > 0 ? Math.max(1, Math.ceil(deltaKg / 2)) : 1
            const maxWeeks = deltaKg > 0 ? Math.max(minWeeks + 1, Math.floor(deltaKg / 0.1)) : 10
            const defaultWeeks = deltaKg > 0 ? Math.round(deltaKg / 0.5) : Math.round((minWeeks + maxWeeks) / 2)
            const sliderWeeks = Number(calcTargetWeeks) > 0 ? Number(calcTargetWeeks) : defaultWeeks
            const sliderRate = deltaKg > 0 && sliderWeeks > 0 ? Math.round(deltaKg / sliderWeeks * 100) / 100 : 0
            const sliderPct = maxWeeks > minWeeks ? (sliderWeeks - minWeeks) / (maxWeeks - minWeeks) * 100 : 0

            const derivedRate = calcGoal !== 'maintain' && deltaKg > 0
              ? Math.max(0.1, deltaKg / Math.max(1, sliderWeeks))
              : 0
            const macros = calcStep === 7 ? computeMacros(derivedRate) : null

            const canNextMap: Record<number, boolean> = {
              0: !!calcGender,
              1: !!calcAge && Number(calcAge) > 0,
              2: !!calcHeight && Number(calcHeight) > 0,
              3: !!calcWeight && Number(calcWeight) > 0,
              4: calcActivity !== null,
              5: !!calcGoal,
              6: deltaKg > 0,
            }
            const canNext = canNextMap[calcStep] ?? false

            const questionSteps = calcGoal === 'maintain' ? [0,1,2,3,4,5] : [0,1,2,3,4,5,6]
            const dotIdx = questionSteps.indexOf(calcStep)
            const totalDots = calcGoal === 'maintain' ? 6 : 7

            function goBack() {
              if (calcStep === 0) { setEditingMacroCalc(false); return }
              if (calcStep === 7) { setCalcSaved(false); setCalcStep(calcGoal === 'maintain' ? 5 : 6); return }
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
                  {calcStep < 7 ? (
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
                        <p className="text-[30px] font-bold text-white leading-tight">How active are you?</p>
                        <p className="text-[15px] text-white/40 mt-1.5">Average week, including exercise.</p>
                      </div>
                      <div className="flex flex-col gap-3">
                        {ACTS.map(({ label, desc, v }) => (
                          <CalcCard key={v} title={label} desc={desc} selected={calcActivity === v}
                            onSelect={() => { setCalcActivity(v); setCalcStep(5) }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {calcStep === 5 && (
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
                            onSelect={() => { setCalcGoal(v); setCalcStep(v === 'maintain' ? 7 : 6) }} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Step 6: target weight + dynamic weeks slider */}
                  {calcStep === 6 && (
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
                          {/* Labels above slider */}
                          <div className="flex justify-between items-center px-1">
                            <span className="text-[13px] font-semibold text-white/50">{sliderWeeks} weeks</span>
                            <span className="text-[13px] font-semibold"
                              style={{ color: sliderRate < 0.5 ? '#2dd4bf' : sliderRate < 0.75 ? '#a3e635' : sliderRate < 1.5 ? '#fb923c' : '#f87171' }}>
                              {sliderRate.toFixed(2)} kg/week
                            </span>
                          </div>

                          {/* Slider */}
                          <input
                            type="range"
                            min={minWeeks} max={maxWeeks} step={1}
                            value={sliderWeeks}
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
                                1.5 kg/week or more carries serious health risks. Consider spreading your goal over more weeks.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Step 7: results */}
                  {calcStep === 7 && macros && (
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
                <button className="flex items-center justify-between w-full" onClick={() => setEditingTraining(true)}>
                  <span className="text-[17px] text-white">Training</span>
                  <div className="flex items-center gap-2">
                    {trainingGoal && (
                      <span className="text-[13px] text-white/40 capitalize">{trainingGoal.replace('_', ' ')}</span>
                    )}
                    <ChevronRight size={18} className="text-white/25 shrink-0" />
                  </div>
                </button>
              </ProfileRow>
              <ProfileRow separator>
                <button className="flex items-center justify-between w-full" onClick={openMacroChoice}>
                  <span className="text-[17px] text-white">Macro Targets</span>
                  <ChevronRight size={18} className="text-white/25 shrink-0" />
                </button>
              </ProfileRow>
              <ProfileRow separator>
                <button className="flex items-center justify-between w-full" onClick={() => setEditingTargets(true)}>
                  <span className="text-[17px] text-white">Targets & Standards</span>
                  <ChevronRight size={18} className="text-white/25 shrink-0" />
                </button>
              </ProfileRow>
              <ProfileRow separator>
                <button className="flex items-center justify-between w-full" onClick={() => setEditingPages(true)}>
                  <span className="text-[17px] text-white">Pages</span>
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
                <button className="flex items-center justify-between w-full" onClick={toggleTimeFormat}>
                  <span className="text-[17px] text-white">Time Format</span>
                  <span className="text-[15px] text-white/40">{timeFormat === '12h' ? '12h (AM/PM)' : '24h'}</span>
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
