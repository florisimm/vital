'use client'

import { useState } from 'react'
import {
  ArrowRight, ArrowLeft, Check, ChevronUp, ChevronDown, Minus, Plus,
  Activity, PartyPopper,
} from 'lucide-react'

// Multi-step sign-up onboarding. Collects all the profile questions in a nice
// order — but does NOT create a real account yet (sign-up isn't open). The final
// step shows a friendly "coming soon" confirmation.

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

const DEVICES = [
  { id: 'strava',   label: 'Strava',          desc: 'Runs & rides' },
  { id: 'hevy',     label: 'Hevy',            desc: 'Strength workouts' },
  { id: 'fitbit',   label: 'Fitbit',          desc: 'Sleep, HRV & steps' },
  { id: 'garmin',   label: 'Garmin',          desc: 'Any Garmin watch' },
  { id: 'apple',    label: 'Apple Watch',     desc: 'Apple Health' },
  { id: 'google',   label: 'Google Calendar', desc: 'Your schedule' },
  { id: 'other',    label: 'Any other wearable', desc: 'Whoop, Oura, Polar, Suunto…' },
]

export function SignupOnboarding({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)

  // Collected answers (not persisted — sign-up isn't open yet)
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
  const [injuries, setInjuries] = useState<Record<Sport, boolean>>({ running: false, cycling: false, swimming: false, gym: false })
  const [stepGoal, setStepGoal] = useState(10000)
  const [squat, setSquat] = useState(100)
  const [bench, setBench] = useState(70)
  const [deadlift, setDeadlift] = useState(120)
  const [devices, setDevices] = useState<string[]>([])
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const wUnit = units === 'metric' ? 'kg' : 'lb'
  const hUnit = units === 'metric' ? 'cm' : 'in'
  const doesGym = freq.gym > 0

  // Build the step list dynamically (strength step only if gym is selected)
  const steps = [
    'welcome', 'about', 'goal', 'nutrition', 'sports', 'intensity',
    'priority', 'injuries', 'targets', ...(doesGym ? ['strength'] : []),
    'devices', 'account', 'done',
  ] as const
  const current = steps[step]
  const total = steps.length
  const isFirst = step === 0
  const isLast = current === 'done'

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

  // Per-step "can continue" gate (kept lenient — most steps are optional)
  const canNext = (() => {
    switch (current) {
      case 'about': return !!sex && !!age
      case 'goal': return !!goal
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

        <button onClick={onClose} className="text-[14px] text-white/40 active:text-white/70 shrink-0">
          Close
        </button>
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
            <Sub>A few quick questions so Kern can tailor every recommendation to you. Takes about a minute.</Sub>
          </Center>
        )}

        {current === 'about' && (
          <StepWrap title="About you" subtitle="This powers your readiness, zones and macros.">
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
          </StepWrap>
        )}

        {current === 'goal' && (
          <StepWrap title="What's your main goal?" subtitle="Kern prioritises advice around this.">
            <div className="flex flex-col gap-2.5">
              {GOALS.map(g => (
                <Choice key={g.id} selected={goal === g.id} onClick={() => setGoal(g.id)} emoji={g.emoji} title={g.title} desc={g.desc} />
              ))}
            </div>
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
          </StepWrap>
        )}

        {current === 'intensity' && (
          <StepWrap title="Training intensity" subtitle="How hard should Kern push you?">
            <div className="grid grid-cols-2 gap-2.5">
              {INTENSITIES.map(it => (
                <Choice key={it.id} selected={intensity === it.id} onClick={() => setIntensity(it.id)} title={it.label} desc={it.desc} />
              ))}
            </div>
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
          </StepWrap>
        )}

        {current === 'injuries' && (
          <StepWrap title="Any injuries?" subtitle="Kern will avoid recommending these sports.">
            <div className="flex flex-col gap-2.5">
              {SPORTS.map(s => (
                <Toggle key={s.id} emoji={s.emoji} label={s.label} on={injuries[s.id]}
                  onClick={() => setInjuries(prev => ({ ...prev, [s.id]: !prev[s.id] }))} />
              ))}
            </div>
          </StepWrap>
        )}

        {current === 'targets' && (
          <StepWrap title="Your targets" subtitle="You can fine-tune these later.">
            <div className="flex items-center gap-3 px-4 py-3.5 rounded-[16px]"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-[22px] shrink-0">👟</span>
              <span className="flex-1 text-[16px] font-semibold text-white">Daily steps</span>
              <Stepper value={stepGoal} onChange={(d) => setStepGoal(v => Math.max(1000, v + d * 1000))} fmt={(v) => v.toLocaleString()} />
            </div>
          </StepWrap>
        )}

        {current === 'strength' && (
          <StepWrap title="Strength standards" subtitle={`Your reference 1-rep maxes (${wUnit}).`}>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-[16px]" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="flex-1 text-[16px] font-semibold text-white">Squat</span>
                <Stepper value={squat} onChange={(d) => setSquat(v => Math.max(0, v + d * 5))} suffix={wUnit} />
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-[16px]" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="flex-1 text-[16px] font-semibold text-white">Bench Press</span>
                <Stepper value={bench} onChange={(d) => setBench(v => Math.max(0, v + d * 5))} suffix={wUnit} />
              </div>
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-[16px]" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="flex-1 text-[16px] font-semibold text-white">Deadlift</span>
                <Stepper value={deadlift} onChange={(d) => setDeadlift(v => Math.max(0, v + d * 5))} suffix={wUnit} />
              </div>
            </div>
          </StepWrap>
        )}

        {current === 'devices' && (
          <StepWrap title="Connect your devices" subtitle="Any wearable works — pick what you use. You can link them after sign-up.">
            <div className="flex flex-col gap-2.5">
              {DEVICES.map(d => (
                <Toggle key={d.id} label={d.label} desc={d.desc} on={devices.includes(d.id)}
                  onClick={() => setDevices(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])} />
              ))}
            </div>
          </StepWrap>
        )}

        {current === 'account' && (
          <StepWrap title="Create your account" subtitle="Last step — your login details.">
            <div className="flex flex-col gap-2.5">
              <TextField placeholder="Name" value={name} onChange={setName} />
              <TextField placeholder="Email address" value={email} onChange={setEmail} type="email" />
              <TextField placeholder="Password" value={password} onChange={setPassword} type="password" />
            </div>
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
              Thanks for setting up your profile. Sign-up isn&apos;t open to everyone just yet —
              we&apos;ll let you know the moment your spot is ready.
            </Sub>
          </Center>
        )}
      </div>

      {/* Footer CTA */}
      <div className="px-6 pb-6 pt-2 shrink-0" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
        {isLast ? (
          <button onClick={onClose}
            className="w-full h-[56px] rounded-[18px] bg-white text-black font-semibold text-[17px] active:scale-[0.98] transition-transform">
            Back to home
          </button>
        ) : (
          <button onClick={next} disabled={!canNext}
            className="w-full h-[56px] rounded-[18px] bg-white text-black font-semibold text-[17px] flex items-center justify-center gap-2 disabled:opacity-40 active:scale-[0.98] transition-transform">
            {current === 'welcome' ? 'Get started' : current === 'account' ? 'Finish' : 'Continue'}
            <ArrowRight size={18} strokeWidth={2.3} />
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
