'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRight, ArrowLeft, Check, ChevronUp, ChevronDown, Minus, Plus,
  Activity, PartyPopper, Info,
} from 'lucide-react'
import { createClient } from '@/lib/supabase'

// Multi-step onboarding. Works in two modes:
//  - 'signup'     : collects everything + creates the account (used from /login)
//  - 'onboarding' : user is already logged in; persists straight to user_settings
// Every data step carries a short "why" note so the user understands what each
// answer powers — lowering the barrier to filling it in honestly.

const PENDING_PROFILE_KEY = 'kern_pending_profile'

type Units = 'metric' | 'imperial'
type Sex = 'male' | 'female' | null
type Goal = 'lose_weight' | 'build_muscle' | 'get_fitter' | 'maintain' | 'performance'
type NutritionFocus = 'lose' | 'maintain' | 'gain'
type Intensity = 'easy' | 'moderate' | 'hard' | 'all_out'
type Sport = 'running' | 'cycling' | 'swimming' | 'gym'

const GOALS: { id: Goal; emoji: string; title: string; desc: string }[] = [
  { id: 'lose_weight',  emoji: '🔥', title: 'Lose weight',  desc: 'Calorie deficit, preserve muscle' },
  { id: 'build_muscle', emoji: '💪', title: 'Build muscle', desc: 'Progressive overload, calorie surplus' },
  { id: 'get_fitter',   emoji: '🏃', title: 'Get fitter',   desc: 'Improve endurance & cardiovascular fitness' },
  { id: 'maintain',     emoji: '⚖️', title: 'Maintain',     desc: 'Keep current weight and performance' },
  { id: 'performance',  emoji: '🏆', title: 'Performance',  desc: 'Train for a race or competition' },
]

const INTENSITIES: { id: Intensity; label: string; desc: string }[] = [
  { id: 'easy',     label: 'Easy',     desc: 'Zone 2 & recovery focus' },
  { id: 'moderate', label: 'Moderate', desc: 'Balanced, default' },
  { id: 'hard',     label: 'Hard',     desc: 'Push when body allows' },
  { id: 'all_out',  label: 'All Out',  desc: 'Max effort, high threshold' },
]

const ACTIVITY: { label: string; desc: string; v: number }[] = [
  { label: 'Sedentary',         desc: 'Desk job, no exercise',  v: 1.2 },
  { label: 'Lightly active',    desc: '1–3× per week',          v: 1.375 },
  { label: 'Moderately active', desc: '3–5× per week',          v: 1.55 },
  { label: 'Very active',       desc: '6–7× per week',          v: 1.725 },
]

const NUTRITION: { id: NutritionFocus; emoji: string; title: string }[] = [
  { id: 'lose',     emoji: '📉', title: 'Lose fat' },
  { id: 'maintain', emoji: '➡️', title: 'Maintain' },
  { id: 'gain',     emoji: '📈', title: 'Gain muscle' },
]

const SPORTS: { id: Sport; emoji: string; label: string }[] = [
  { id: 'running',  emoji: '🏃', label: 'Running' },
  { id: 'cycling',  emoji: '🚴', label: 'Cycling' },
  { id: 'swimming', emoji: '🏊', label: 'Swimming' },
  { id: 'gym',      emoji: '🏋️', label: 'Gym / Strength' },
]

const APPS = [
  { id: 'strava', label: 'Strava', desc: 'Runs & rides' },
  { id: 'hevy',   label: 'Hevy',   desc: 'Strength workouts' },
]

const WEARABLES = [
  { id: 'fitbit', label: 'Google Health',      desc: 'Sleep, HRV & steps' },
  { id: 'garmin', label: 'Garmin',             desc: 'Any Garmin watch' },
  { id: 'apple',  label: 'Apple Watch',        desc: 'Apple Health' },
  { id: 'google', label: 'Google Calendar',    desc: 'Your schedule' },
  { id: 'other',  label: 'Any other wearable', desc: 'Whoop, Oura, Polar, Suunto…' },
]

export function SignupOnboarding({
  mode = 'signup',
  onClose,
  onComplete,
}: {
  mode?: 'signup' | 'onboarding'
  onClose: () => void
  onComplete?: () => void
}) {
  const router = useRouter()
  useEffect(() => {
    const nav = document.querySelector('[data-bottom-nav]') as HTMLElement | null
    if (nav) nav.style.display = 'none'
    return () => { if (nav) nav.style.display = '' }
  }, [])

  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sessionCreated, setSessionCreated] = useState(false)

  // Collected answers
  const [units, setUnits] = useState<Units>('metric')
  const [sex, setSex] = useState<Sex>(null)
  const [age, setAge] = useState('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [goal, setGoal] = useState<Goal | null>(null)
  const [nutrition, setNutrition] = useState<NutritionFocus | null>(null)
  const [activity, setActivity] = useState<number | null>(null)
  const [freq, setFreq] = useState<Record<Sport, number>>({ running: 0, cycling: 0, swimming: 0, gym: 0 })
  const [intensity, setIntensity] = useState<Intensity>('moderate')
  const [sportOrder, setSportOrder] = useState<Sport[]>(['running', 'cycling', 'swimming', 'gym'])
  const [devices, setDevices] = useState<string[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const wUnit = units === 'metric' ? 'kg' : 'lb'
  const hUnit = units === 'metric' ? 'cm' : 'in'

  const computedMacros = (() => {
    const kg = units === 'imperial' ? Number(weight) / 2.2046 : Number(weight)
    const cm = units === 'imperial' ? Number(height) * 2.54 : Number(height)
    const a = Number(age) || 0
    if (!(kg > 0 && cm > 0 && sex && a > 0)) return null
    const bmr = 10 * kg + 6.25 * cm - 5 * a + (sex === 'male' ? 5 : -161)
    const tdee = bmr * (activity ?? 1.55)
    const adj = nutrition === 'lose' ? -500 : nutrition === 'gain' ? 300 : 0
    const kcal = Math.max(1200, Math.round((tdee + adj) / 10) * 10)
    const protein = Math.round(kg * 1.8)
    const fat = Math.round(kcal * 0.25 / 9)
    const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
    return { kcal, protein, carbs, fat }
  })()

  // Step list — the account step only exists when creating a new account.
  const steps = [
    'welcome', 'about', 'goal', 'nutrition', 'sports', 'intensity',
    'priority',
    'apps', 'wearables', ...(mode === 'signup' ? ['account'] : []), 'done',
  ] as const
  const current = steps[step]
  const total = steps.length
  const isFirst = step === 0
  const isLast = current === 'done'
  const lastDataStep = 'wearables'

  function next() { setStep(s => Math.min(s + 1, total - 1)) }
  function back() { setStep(s => Math.max(s - 1, 0)) }

  function moveSport(i: number, dir: -1 | 1) {
    setSportOrder(prev => {
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const nextArr = [...prev]
      ;[nextArr[i], nextArr[j]] = [nextArr[j], nextArr[i]]
      return nextArr
    })
  }

  // Build the user_settings payload from the collected answers.
  function buildPayload() {
    const kg = units === 'imperial' ? Number(weight) / 2.2046 : Number(weight)
    const cm = units === 'imperial' ? Number(height) * 2.54 : Number(height)
    const a = Number(age) || 0

    // Macros via Mifflin–St Jeor → TDEE → goal adjustment
    let macros: Record<string, number> = {}
    if (kg > 0 && cm > 0 && sex && a > 0) {
      const bmr = 10 * kg + 6.25 * cm - 5 * a + (sex === 'male' ? 5 : -161)
      const tdee = bmr * (activity ?? 1.55)
      const adj = nutrition === 'lose' ? -500 : nutrition === 'gain' ? 300 : 0
      const kcal = Math.max(1200, Math.round((tdee + adj) / 10) * 10)
      const protein = Math.round(kg * 1.8)
      const fat = Math.round(kcal * 0.25 / 9)
      const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4))
      macros = { macro_kcal: kcal, macro_protein: protein, macro_carbs: carbs, macro_fat: fat }
    }

    return {
      units,
      gender: sex,
      age: a || null,
      height_cm: cm > 0 ? Math.round(cm) : null,
      training_goal: goal,
      training_frequencies: freq,
      training_intensity: intensity,
      training_sport_priority: sportOrder,
      ...macros,
      onboarded: true,
    }
  }

  async function persistForLoggedInUser() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('user_settings')
      .upsert({ user_id: user.id, user_email: user.email, ...buildPayload() }, { onConflict: 'user_id' })
    if (error) setErr(error.message)
  }

  async function createAccount(): Promise<boolean> {
    if (!email || !password) { setErr('Enter an email and password'); return false }
    if (password.length < 6) { setErr('Password must be at least 6 characters'); return false }
    setBusy(true); setErr(null)
    const supabase = createClient()
    const payload = buildPayload()
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: name, kern_profile: JSON.stringify(payload) } },
    })
    if (error) { setErr(error.message); setBusy(false); return false }

    if (data.session) {
      await supabase.from('user_settings')
        .upsert({ user_id: data.user!.id, user_email: data.user!.email, ...payload }, { onConflict: 'user_id' })
      setSessionCreated(true)
    } else {
      // Fallback: also stash in localStorage for same-device confirmation
      try { localStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(payload)) } catch { /* ignore */ }
    }
    setBusy(false)
    return true
  }

  async function advance() {
    setErr(null)
    if (mode === 'signup' && current === 'account') {
      const ok = await createAccount()
      if (ok) next()
      return
    }
    if (mode === 'onboarding' && current === lastDataStep) {
      setBusy(true)
      try { await persistForLoggedInUser() } finally { setBusy(false) }
      next()
      return
    }
    next()
  }

  async function markOnboarded() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('user_settings')
        .upsert({ user_id: user.id, user_email: user.email, onboarded: true }, { onConflict: 'user_id' })
    }
  }

  async function skipWizard() {
    await markOnboarded()
    onClose()
  }

  async function finish() {
    if (mode === 'onboarding') { await persistForLoggedInUser(); onComplete?.(); return }
    if (sessionCreated) { router.push('/'); router.refresh(); return }
    await markOnboarded()
    onClose()
  }

  // Per-step "can continue" gate (kept lenient — most steps are optional)
  const canNext = (() => {
    if (busy) return false
    switch (current) {
      case 'about': return !!sex && !!age
      case 'goal': return !!goal
      case 'account': return !!email && password.length >= 6
      default: return true
    }
  })()

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col"
      style={{
        background:
          'radial-gradient(ellipse at 75% -10%, rgba(0,210,220,0.22) 0%, transparent 52%), ' +
          'radial-gradient(ellipse at 10% 105%, rgba(255,120,0,0.12) 0%, transparent 52%), ' +
          'rgb(5, 6, 8)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      {/* Top bar: back + progress + close */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 shrink-0">
        {!isFirst && !isLast ? (
          <button onClick={back} className="text-white/60 active:text-white shrink-0">
            <ArrowLeft size={22} />
          </button>
        ) : <div className="w-[22px] shrink-0" />}

        <div className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.10)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / total) * 100}%`, background: 'rgb(45,212,191)' }}
          />
        </div>

        {!isLast
          ? <button onClick={skipWizard} className="text-[14px] text-white/40 active:text-white/70 shrink-0">Skip</button>
          : <div className="w-[36px] shrink-0" />}
      </div>

      {/* Step body */}
      <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6" style={{ scrollbarWidth: 'none' }}>
        {current === 'welcome' && (
          <Center>
            <div
              className="w-[76px] h-[76px] rounded-[22px] flex items-center justify-center mb-7 mx-auto"
              style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.25) 0%, rgba(255,120,0,0.18) 100%)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <Activity size={36} className="text-teal-400" strokeWidth={2} />
            </div>
            <H>Let&apos;s set up your coach</H>
            <Sub>A few quick questions so Kern can tailor every recommendation to you. Each answer powers a specific part of your coaching — we&apos;ll explain why as we go. Takes about a minute.</Sub>
          </Center>
        )}

        {current === 'about' && (
          <StepWrap title="About you" subtitle="The basics behind every number.">
            {/* Units toggle */}
            <div className="flex p-1 rounded-[14px] mb-4" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {(['metric', 'imperial'] as Units[]).map(u => (
                <button key={u} onClick={() => setUnits(u)}
                  className="flex-1 h-[38px] rounded-[10px] text-[14px] font-semibold capitalize transition-all"
                  style={u === units ? { background: 'rgba(255,255,255,0.95)', color: 'rgb(5,6,8)' } : { color: 'rgba(255,255,255,0.5)' }}>
                  {u}
                </button>
              ))}
            </div>

            <Label>Sex</Label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(['male', 'female'] as const).map(s => (
                <Choice key={s} selected={sex === s} onClick={() => setSex(s)} title={s === 'male' ? 'Male' : 'Female'} />
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <NumField label="Age" value={age} onChange={setAge} suffix="yr" />
              <NumField label="Height" value={height} onChange={setHeight} suffix={hUnit} />
              <NumField label="Weight" value={weight} onChange={setWeight} suffix={wUnit} />
            </div>

            <Why>Your sex, age, height and weight set your metabolic baseline (BMR), heart-rate zones and macro targets. Without them Kern can&apos;t calculate personalised numbers.</Why>
          </StepWrap>
        )}

        {current === 'goal' && (
          <StepWrap title="What's your main goal?" subtitle="The lens for every recommendation.">
            <div className="flex flex-col gap-2.5">
              {GOALS.map(g => (
                <Choice key={g.id} selected={goal === g.id} onClick={() => setGoal(g.id)} emoji={g.emoji} title={g.title} desc={g.desc} />
              ))}
            </div>
            <Why>Your main goal decides whether Kern steers toward a calorie deficit, muscle gain or endurance — all advice is prioritised around it.</Why>
          </StepWrap>
        )}

        {current === 'nutrition' && (
          <StepWrap title="Nutrition & activity" subtitle="Sets your calorie and protein targets.">
            <Label>Nutrition focus</Label>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {NUTRITION.map(n => (
                <Choice key={n.id} selected={nutrition === n.id} onClick={() => setNutrition(n.id)} emoji={n.emoji} title={n.title} center />
              ))}
            </div>
            <Label>Daily activity level</Label>
            <div className="flex flex-col gap-2.5">
              {ACTIVITY.map(a => (
                <Choice key={a.v} selected={activity === a.v} onClick={() => setActivity(a.v)} title={a.label} desc={a.desc} />
              ))}
            </div>
            <Why>Your focus and daily activity set your calorie and protein goals on the Food tab. A more active day means a higher calorie budget.</Why>
          </StepWrap>
        )}

        {current === 'sports' && (
          <StepWrap title="Which sports do you do?" subtitle="Set how many sessions per week you aim for.">
            <div className="flex flex-col gap-2.5">
              {SPORTS.map(s => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3 rounded-[16px]"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="text-[22px] shrink-0">{s.emoji}</span>
                  <span className="flex-1 text-[16px] font-semibold text-white">{s.label}</span>
                  <Stepper
                    value={freq[s.id]}
                    onChange={(d) => setFreq(f => ({ ...f, [s.id]: Math.max(0, Math.min(7, f[s.id] + d)) }))}
                    suffix="×"
                  />
                </div>
              ))}
            </div>
            <Why>How often you train each sport builds your weekly schedule — and decides which sport tabs show up in the app. Set a sport to 0 and Kern hides it.</Why>
          </StepWrap>
        )}

        {current === 'intensity' && (
          <StepWrap title="Training intensity" subtitle="How hard should Kern push you?">
            <div className="grid grid-cols-2 gap-2.5">
              {INTENSITIES.map(it => (
                <Choice key={it.id} selected={intensity === it.id} onClick={() => setIntensity(it.id)} title={it.label} desc={it.desc} />
              ))}
            </div>
            <Why>This tunes how aggressive your daily readiness advice is — from relaxed zone-2 work to all-out threshold sessions.</Why>
          </StepWrap>
        )}

        {current === 'priority' && (
          <StepWrap title="Sport priority" subtitle="Top = most important when sessions clash.">
            <div className="rounded-[18px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              {sportOrder.map((id, i) => {
                const s = SPORTS.find(x => x.id === id)!
                return (
                  <div key={id} className={`flex items-center gap-3 px-4 py-3.5 ${i < sportOrder.length - 1 ? 'border-b border-white/[0.06]' : ''}`}>
                    <span className="text-[13px] text-teal-400/70 font-bold w-4 shrink-0">{i + 1}</span>
                    <span className="text-[20px] shrink-0">{s.emoji}</span>
                    <span className="flex-1 text-[16px] font-semibold text-white">{s.label}</span>
                    <div className="flex flex-col gap-0.5 shrink-0">
                      <button onClick={() => moveSport(i, -1)} disabled={i === 0} className="text-white/50 active:text-white disabled:opacity-20"><ChevronUp size={18} /></button>
                      <button onClick={() => moveSport(i, 1)} disabled={i === sportOrder.length - 1} className="text-white/50 active:text-white disabled:opacity-20"><ChevronDown size={18} /></button>
                    </div>
                  </div>
                )
              })}
            </div>
            <Why>When two sessions compete on the same day, Kern recommends the sport you ranked highest.</Why>
          </StepWrap>
        )}


        {current === 'apps' && (
          <StepWrap title="Which apps do you use?" subtitle="Kern imports your workouts from these.">
            <div className="flex flex-col gap-2.5">
              {APPS.map(d => (
                <Toggle key={d.id} label={d.label} desc={d.desc} on={devices.includes(d.id)}
                  onClick={() => setDevices(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])} />
              ))}
            </div>
            <Why>Strava and Hevy sync your runs, rides and strength sessions automatically. You&apos;ll connect the actual accounts from your profile{mode === 'signup' ? ' after sign-up' : ''}.</Why>
          </StepWrap>
        )}

        {current === 'wearables' && (
          <StepWrap title="Any wearables?" subtitle="For sleep, HRV, steps and health data.">
            <div className="flex flex-col gap-2.5">
              {WEARABLES.map(d => (
                <Toggle key={d.id} label={d.label} desc={d.desc} on={devices.includes(d.id)}
                  onClick={() => setDevices(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])} />
              ))}
            </div>
            <Why>The more sources you link, the more accurate your readiness and recovery advice. Connect from your profile{mode === 'signup' ? ' after sign-up' : ''}.</Why>
          </StepWrap>
        )}

        {current === 'account' && (
          <StepWrap title="Create your account" subtitle="Last step — your login details.">
            <div className="flex flex-col gap-2.5">
              <TextField placeholder="Name" value={name} onChange={setName} />
              <TextField placeholder="Email address" value={email} onChange={setEmail} type="email" />
              <TextField placeholder="Password (min. 6 characters)" value={password} onChange={setPassword} type="password" />
            </div>
            {err && <p className="text-red-400 text-[14px] text-center mt-3">{err}</p>}
            <p className="text-[12px] text-white/30 mt-4 text-center">
              By continuing you agree to our terms. Your data is only used to power your coaching.
            </p>
          </StepWrap>
        )}

        {current === 'done' && (
          <Center>
            <div
              className="w-[76px] h-[76px] rounded-full flex items-center justify-center mb-7 mx-auto"
              style={{ background: 'rgba(45,212,191,0.15)', border: '1px solid rgba(45,212,191,0.35)' }}
            >
              <PartyPopper size={34} className="text-teal-400" />
            </div>
            <H>You&apos;re all set!</H>
            <Sub>
              {mode === "onboarding"
                ? "Your coach is tuned to you. You can adjust everything from your Profile page at any time."
                : sessionCreated
                  ? "Your profile is ready. You can adjust everything from your Profile page."
                  : "Check your email to confirm your address, then sign in."}
            </Sub>
            {computedMacros && (
              <div className="mt-6 rounded-[18px] overflow-hidden text-left" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/35 px-4 pt-3.5 pb-2">Your daily targets</p>
                <div className="grid grid-cols-4 divide-x divide-white/[0.06]">
                  {[
                    { label: "Calories", value: computedMacros.kcal,     unit: "kcal" },
                    { label: "Protein",  value: computedMacros.protein,   unit: "g" },
                    { label: "Carbs",    value: computedMacros.carbs,     unit: "g" },
                    { label: "Fat",      value: computedMacros.fat,       unit: "g" },
                  ].map(m => (
                    <div key={m.label} className="flex flex-col items-center py-3 px-1">
                      <span className="text-[18px] font-bold text-white">{m.value}</span>
                      <span className="text-[10px] text-white/35 mt-0.5">{m.unit}</span>
                      <span className="text-[10px] text-white/30 mt-0.5">{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Center>
        )}
      </div>

      {/* Footer CTA */}
      <div className="px-6 pb-6 pt-2 shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
        {isLast ? (
          <button onClick={finish}
            className="w-full h-[56px] rounded-[18px] bg-white text-black font-semibold text-[17px] active:scale-[0.98] transition-transform">
            {mode === 'onboarding' || sessionCreated ? 'Enter Kern' : 'Back to sign in'}
          </button>
        ) : (
          <button onClick={advance} disabled={!canNext}
            className="w-full h-[56px] rounded-[18px] bg-white text-black font-semibold text-[17px] flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-transform">
            {busy ? 'Saving…'
              : current === 'welcome' ? 'Get started'
              : current === 'account' ? 'Create account'
              : (mode === 'onboarding' && current === lastDataStep) ? 'Finish'
              : 'Continue'}
            {!busy && <ArrowRight size={18} strokeWidth={2.3} />}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Small building blocks ───────────────────────────────────────

function Center({ children }: { children: React.ReactNode }) {
  return <div className="h-full flex flex-col justify-center text-center max-w-sm mx-auto">{children}</div>
}
function H({ children }: { children: React.ReactNode }) {
  return <h1 className="text-[30px] font-bold text-white tracking-tight leading-tight">{children}</h1>
}
function Sub({ children }: { children: React.ReactNode }) {
  return <p className="text-[16px] text-white/50 mt-3 leading-relaxed">{children}</p>
}
function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] font-medium text-white/40 mb-2 px-1">{children}</p>
}

// "Why we ask" callout — shown under each data step so the user understands
// what their answer powers.
function Why({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 mt-5 px-3.5 py-3 rounded-[14px]"
      style={{ background: 'rgba(45,212,191,0.07)', border: '1px solid rgba(45,212,191,0.18)' }}>
      <Info size={15} className="text-teal-400/80 shrink-0 mt-0.5" strokeWidth={2.2} />
      <p className="text-[12.5px] leading-relaxed text-white/55">{children}</p>
    </div>
  )
}

function StepWrap({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-[28px] font-bold text-white tracking-tight leading-tight">{title}</h1>
      {subtitle && <p className="text-[15px] text-white/45 mt-2 mb-6 leading-relaxed">{subtitle}</p>}
      {!subtitle && <div className="mb-6" />}
      {children}
    </div>
  )
}

function Choice({ selected, onClick, emoji, title, desc, center = false }: {
  selected: boolean; onClick: () => void; emoji?: string; title: string; desc?: string; center?: boolean
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-3 px-4 py-3.5 rounded-[16px] text-left active:opacity-80 transition-all ${center ? 'flex-col !text-center !gap-1.5 py-4' : ''}`}
      style={{
        background: selected ? 'rgba(45,212,191,0.15)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${selected ? 'rgba(45,212,191,0.45)' : 'rgba(255,255,255,0.08)'}`,
      }}>
      {emoji && <span className={`shrink-0 ${center ? 'text-[26px]' : 'text-[22px]'}`}>{emoji}</span>}
      <div className={center ? '' : 'flex-1 min-w-0'}>
        <p className="text-[16px] font-semibold leading-tight" style={{ color: selected ? 'rgb(45,212,191)' : 'white' }}>{title}</p>
        {desc && <p className="text-[12px] text-white/40 mt-0.5">{desc}</p>}
      </div>
      {!center && selected && <Check size={18} className="text-teal-400 shrink-0" strokeWidth={2.5} />}
    </button>
  )
}

function Toggle({ emoji, label, desc, on, onClick }: { emoji?: string; label: string; desc?: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="flex items-center gap-3 px-4 py-3.5 rounded-[16px] text-left active:opacity-80 transition-all"
      style={{ background: on ? 'rgba(45,212,191,0.12)' : 'rgba(255,255,255,0.05)', border: `1px solid ${on ? 'rgba(45,212,191,0.4)' : 'rgba(255,255,255,0.08)'}` }}>
      {emoji && <span className="text-[22px] shrink-0">{emoji}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-[16px] font-semibold text-white leading-tight">{label}</p>
        {desc && <p className="text-[12px] text-white/40 mt-0.5">{desc}</p>}
      </div>
      <div className={`w-[44px] h-[26px] rounded-full relative transition-colors shrink-0 ${on ? 'bg-teal-400' : 'bg-white/15'}`}>
        <div className={`absolute top-[3px] w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[21px]' : 'left-[3px]'}`} style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.35)' }} />
      </div>
    </button>
  )
}

function Stepper({ value, onChange, suffix, fmt }: { value: number; onChange: (d: -1 | 1) => void; suffix?: string; fmt?: (v: number) => string }) {
  return (
    <div className="flex items-center gap-3 shrink-0">
      <button onClick={() => onChange(-1)} className="w-8 h-8 rounded-full flex items-center justify-center active:opacity-60" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <Minus size={16} className="text-white" />
      </button>
      <span className="text-[16px] font-bold text-white tabular-nums min-w-[52px] text-center">
        {fmt ? fmt(value) : value}{suffix ? ` ${suffix}` : ''}
      </span>
      <button onClick={() => onChange(1)} className="w-8 h-8 rounded-full flex items-center justify-center active:opacity-60" style={{ background: 'rgba(255,255,255,0.08)' }}>
        <Plus size={16} className="text-white" />
      </button>
    </div>
  )
}

function NumField({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <div className="rounded-[16px] px-3 py-3" style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}>
      <p className="text-[11px] text-white/35 mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <input type="number" inputMode="numeric" value={value} onChange={e => onChange(e.target.value)} placeholder="—"
          className="w-full bg-transparent text-white text-[20px] font-bold outline-none placeholder:text-white/25" />
        {suffix && <span className="text-[12px] text-white/35 shrink-0">{suffix}</span>}
      </div>
    </div>
  )
}

function TextField({ placeholder, value, onChange, type = 'text' }: { placeholder: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-[56px] px-4 rounded-[18px] border border-white/[0.09] bg-white/[0.07] text-white text-[17px] outline-none placeholder:text-white/30"
    />
  )
}

export { PENDING_PROFILE_KEY }
