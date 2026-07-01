'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  Activity, Brain, HeartPulse, Utensils, Dumbbell, Moon,
  Home, MessageCircle, Bike, Footprints, Send, Flame, Zap,
} from 'lucide-react'

// Public marketing page shown to logged-out visitors on `/`.
// Logged-in users get the dashboard instead (gated in app/page.tsx).
//
// Single purpose: drive App Store downloads. The app itself is the hero —
// every section is anchored by a live-looking phone mockup of a real screen
// (Today, Rico, Training, Food) built from the app's own design tokens.
// Set APP_STORE_URL once the app is live and every badge becomes a link.

const APP_STORE_URL: string | null = null

const INTEGRATIONS = ['Strava', 'Hevy', 'Fitbit', 'Garmin', 'Apple Health', 'Whoop', 'Oura', 'Polar', 'Google Calendar']

// ── Scroll reveal ────────────────────────────────────────────────
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShown(true); obs.disconnect() } },
      { threshold: 0.15 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, shown }
}

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, shown } = useReveal<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(30px)',
        transition: `opacity 0.75s ease ${delay}s, transform 0.75s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  )
}

export function LandingPage() {
  const router = useRouter()
  const goLogin = () => router.push('/login')

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden">
      <style>{`
        @keyframes kFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes kFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes kBlink { 0%,100% { opacity: .25; } 50% { opacity: 1; } }
        @keyframes kScan { from { stroke-dashoffset: 1400; } to { stroke-dashoffset: 0; } }
        @keyframes kMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        html { scroll-behavior: smooth; }
      `}</style>

      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50" style={{ background: 'rgba(5,6,8,0.6)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between px-5 sm:px-8 h-[64px]">
          <div className="flex items-center gap-2.5">
            <Logo size={36} />
            <span className="text-[19px] font-bold tracking-tight">Kern</span>
          </div>
          <button onClick={goLogin} className="h-[40px] px-5 rounded-full bg-white text-black font-semibold text-[15px] active:scale-[0.97] transition-transform">
            Log in
          </button>
        </div>
      </header>

      {/* ── Hero — the app front and center ─────────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 pt-[110px] sm:pt-[140px] pb-10">
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[900px] h-[520px] max-w-[130vw] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(45,212,191,0.17) 0%, transparent 65%)', filter: 'blur(55px)' }} />

        <div className="relative grid lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-8 items-center">
          {/* Left — pitch + store badge */}
          <div className="text-center lg:text-left flex flex-col items-center lg:items-start">
            <div className="inline-flex items-center gap-2 h-[32px] px-4 rounded-full mb-7 text-[13px] font-medium text-white/70"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', animation: 'kFadeUp 0.6s ease both' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400" style={{ animation: 'kBlink 1.8s ease-in-out infinite' }} />
              Coming soon to iPhone
            </div>

            <h1 className="text-[44px] sm:text-[66px] font-bold leading-[1.0] tracking-[-0.02em]" style={{ animation: 'kFadeUp 0.6s ease 0.05s both' }}>
              Your AI coach.
              <br />
              <span style={{ background: 'linear-gradient(100deg, #2dd4bf, #5eead4 40%, #fb923c)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                In your pocket.
              </span>
            </h1>

            <p className="text-[17px] sm:text-[19px] text-white/55 mt-6 max-w-lg font-medium leading-relaxed" style={{ animation: 'kFadeUp 0.6s ease 0.12s both' }}>
              Kern reads your training, sleep, recovery, nutrition and calendar — and tells you exactly what to do today. One app, one daily plan.
            </p>

            <div className="mt-9 flex flex-col items-center lg:items-start gap-3" style={{ animation: 'kFadeUp 0.6s ease 0.18s both' }}>
              <AppStoreBadge large />
              <span className="text-[13px] text-white/35">Free to download · Works with every wearable</span>
            </div>
          </div>

          {/* Right — floating iPhone with the Today screen */}
          <div className="relative flex justify-center" style={{ animation: 'kFadeUp 0.7s ease 0.15s both' }}>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.14), transparent 68%)', filter: 'blur(40px)' }} />
            <div style={{ animation: 'kFloat 7s ease-in-out infinite' }}>
              <div className="lg:[transform:perspective(1400px)_rotateY(-7deg)_rotateX(1.5deg)]">
                <PhoneFrame width={310}>
                  <TodayScreen />
                </PhoneFrame>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ECG pulse divider ───────────────────────────────── */}
      <PulseLine />

      {/* ── Integration marquee ─────────────────────────────── */}
      <section className="relative z-10 py-8 overflow-hidden">
        <p className="text-center text-[12px] font-semibold uppercase tracking-[0.18em] text-white/30 mb-6">Plugs into everything you already use</p>
        <div className="relative">
          <div className="flex w-max gap-3" style={{ animation: 'kMarquee 28s linear infinite' }}>
            {[...INTEGRATIONS, ...INTEGRATIONS].map((name, i) => (
              <div key={i} className="flex items-center gap-2 h-[44px] px-5 rounded-full text-[15px] font-semibold text-white/65 whitespace-nowrap"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="w-2 h-2 rounded-full bg-teal-400/70" />
                {name}
              </div>
            ))}
          </div>
          <div className="absolute inset-y-0 left-0 w-24 pointer-events-none" style={{ background: 'linear-gradient(90deg, rgb(5,6,8), transparent)' }} />
          <div className="absolute inset-y-0 right-0 w-24 pointer-events-none" style={{ background: 'linear-gradient(270deg, rgb(5,6,8), transparent)' }} />
        </div>
      </section>

      {/* ── Feature: Rico ───────────────────────────────────── */}
      <FeatureSection
        eyebrow="Meet Rico" eyebrowColor="#2dd4bf"
        title={<>A coach that answers.<br />Any hour, any question.</>}
        body="Should I train today? What do I eat before tonight's intervals? Rico reads your real numbers and your calendar — no generic tips, just what applies to you, right now."
        points={['Knows your sleep, HRV and training load', 'Sees your calendar and plans around it', 'Answers in seconds, 24/7']}
        phone={<CoachScreen />}
      />

      {/* ── Feature: readiness ──────────────────────────────── */}
      <FeatureSection
        flip
        eyebrow="One number, every morning" eyebrowColor="#fb923c"
        title={<>Wake up knowing<br />push or hold back.</>}
        body="HRV, resting heart rate and sleep fused into a single readiness score. Green means go hard, orange means keep it easy — your body decides, Kern translates."
        points={['Sleep stages decoded every night', 'Training load balanced on the ACWR model', 'Rest days called before you dig a hole']}
        phone={<HealthScreen />}
      />

      {/* ── Feature: training ───────────────────────────────── */}
      <FeatureSection
        eyebrow="Training that adapts" eyebrowColor="#a78bfa"
        title={<>Today's session,<br />not a template.</>}
        body="Every workout is sized to what your body did this week — pace, zone and duration included. Running, cycling, swimming and strength, all in one plan."
        points={['Syncs Strava and Hevy automatically', 'Learns how much load you handle', 'Routes generated for runs and rides']}
        phone={<TrainingScreen />}
      />

      {/* ── Feature: food ───────────────────────────────────── */}
      <FeatureSection
        flip
        eyebrow="Fuel to match the work" eyebrowColor="#34d399"
        title={<>Macros that follow<br />your training.</>}
        body="Scan a barcode, log a meal, hit your protein. Targets shift with what your body actually burned today — not a static calorie number from a formula."
        points={['Barcode scanner with instant lookup', 'Meal templates for the food you repeat', 'Protein, carbs and fat tracked live']}
        phone={<FoodScreen />}
      />

      {/* ── Final CTA ───────────────────────────────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-20">
        <Reveal>
          <div className="rounded-[32px] p-10 sm:p-16 overflow-hidden relative text-center"
            style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.12) 0%, rgba(255,120,0,0.08) 100%)', border: '1px solid rgba(255,255,255,0.10)' }}>
            <div className="absolute inset-0 pointer-events-none opacity-60">
              <MiniPulse />
            </div>
            <div className="relative flex flex-col items-center">
              <Logo size={64} />
              <h2 className="text-[34px] sm:text-[54px] font-bold tracking-tight leading-[1.02] mt-7">
                Be first on the start line.
              </h2>
              <p className="text-[17px] text-white/55 mt-4 max-w-xl mx-auto">
                Kern launches soon on the App Store. Your data is already waiting — Strava, your watch, your calendar. All it needs is you.
              </p>
              <div className="mt-9">
                <AppStoreBadge large />
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-12 border-t border-white/[0.06]">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="text-[16px] font-bold">Kern</span>
          </div>
          <p className="text-[13px] text-white/30">© {new Date().getFullYear()} Kern — AI Fitness & Health Coaching</p>
          <button onClick={goLogin} className="text-[14px] text-white/50 hover:text-white transition-colors font-medium">Log in →</button>
        </div>
      </footer>
    </div>
  )
}

// ── Alternating feature block: copy + phone mockup ──────────────
function FeatureSection({ eyebrow, eyebrowColor, title, body, points, phone, flip = false }: {
  eyebrow: string
  eyebrowColor: string
  title: React.ReactNode
  body: string
  points: string[]
  phone: React.ReactNode
  flip?: boolean
}) {
  return (
    <section className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-16 sm:py-20">
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-10 items-center">
        <Reveal className={flip ? 'lg:order-2' : ''}>
          <div className="text-center lg:text-left flex flex-col items-center lg:items-start">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] mb-4" style={{ color: eyebrowColor }}>{eyebrow}</p>
            <h2 className="text-[32px] sm:text-[44px] font-bold tracking-tight leading-[1.06]">{title}</h2>
            <p className="text-[16px] sm:text-[17px] text-white/55 mt-5 max-w-md leading-relaxed">{body}</p>
            <ul className="mt-6 flex flex-col gap-2.5 items-start">
              {points.map((p) => (
                <li key={p} className="flex items-center gap-2.5 text-[15px] text-white/70">
                  <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 text-[11px]"
                    style={{ background: `${eyebrowColor}22`, color: eyebrowColor, border: `1px solid ${eyebrowColor}44` }}>✓</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </Reveal>
        <Reveal delay={0.1} className={flip ? 'lg:order-1' : ''}>
          <div className="relative flex justify-center">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[360px] h-[360px] pointer-events-none"
              style={{ background: `radial-gradient(circle, ${eyebrowColor}1f, transparent 68%)`, filter: 'blur(40px)' }} />
            <PhoneFrame width={280}>{phone}</PhoneFrame>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

// ── Brand logo: heartbeat line in a gradient tile ───────────────
function Logo({ size = 36 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center shrink-0" style={{ width: size, height: size, borderRadius: size * 0.3, background: 'linear-gradient(135deg, rgba(45,212,191,0.28) 0%, rgba(255,120,0,0.20) 100%)', border: '1px solid rgba(255,255,255,0.12)' }}>
      <Activity size={Math.round(size * 0.52)} className="text-teal-400" strokeWidth={2.2} />
    </div>
  )
}

// ── App Store badge — becomes a link once APP_STORE_URL is set ──
function AppStoreBadge({ large = false }: { large?: boolean }) {
  const live = !!APP_STORE_URL
  const h = large ? 62 : 52
  const inner = (
    <span className="inline-flex items-center gap-3 rounded-[16px] select-none"
      style={{
        height: h, paddingInline: large ? 28 : 22,
        background: live ? 'white' : 'rgba(255,255,255,0.07)',
        border: `1px solid ${live ? 'white' : 'rgba(255,255,255,0.16)'}`,
        color: live ? 'black' : 'white',
        boxShadow: '0 20px 60px rgba(45,212,191,0.14)',
      }}>
      <AppleLogo size={large ? 26 : 22} />
      <span className="flex flex-col items-start leading-none">
        <span className="font-medium mb-1" style={{ fontSize: large ? 11 : 10, opacity: 0.6 }}>{live ? 'Download on the' : 'Coming soon on the'}</span>
        <span className="font-semibold tracking-tight" style={{ fontSize: large ? 21 : 18 }}>App Store</span>
      </span>
    </span>
  )
  return live
    ? <a href={APP_STORE_URL!} target="_blank" rel="noopener noreferrer" className="active:scale-[0.98] transition-transform inline-block">{inner}</a>
    : <div className="inline-block cursor-default">{inner}</div>
}

function AppleLogo({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 384 512" width={size} height={size} fill="currentColor" aria-hidden>
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
    </svg>
  )
}

// ═════════════════════════════════════════════════════════════════
// Phone mockup — frame + mini app screens in the app's design tokens
// ═════════════════════════════════════════════════════════════════

function PhoneFrame({ width, children }: { width: number; children: React.ReactNode }) {
  const height = Math.round(width * 2.07)
  return (
    <div className="relative shrink-0" style={{
      width, height,
      borderRadius: width * 0.155,
      padding: 9,
      background: 'linear-gradient(160deg, #2a2d33, #101216 45%, #23262c)',
      border: '1px solid rgba(255,255,255,0.14)',
      boxShadow: '0 50px 110px rgba(0,0,0,0.65), inset 0 0 3px rgba(255,255,255,0.15)',
    }}>
      <div className="relative w-full h-full overflow-hidden" style={{
        borderRadius: width * 0.125,
        background:
          'radial-gradient(ellipse at 75% -10%, rgba(0,210,220,0.20) 0%, transparent 52%), ' +
          'radial-gradient(ellipse at 10% 105%, rgba(255,120,0,0.12) 0%, transparent 52%), ' +
          'rgb(5, 6, 8)',
      }}>
        {/* Dynamic island */}
        <div className="absolute left-1/2 -translate-x-1/2 z-20" style={{ top: 9, width: width * 0.32, height: 22, borderRadius: 12, background: '#000' }} />
        {/* Status bar */}
        <div className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-5" style={{ height: 40 }}>
          <span className="text-[11px] font-semibold text-white/90">9:41</span>
          <div className="flex items-center gap-1">
            <span className="w-[3px] h-[7px] rounded-sm bg-white/80" /><span className="w-[3px] h-[9px] rounded-sm bg-white/80" /><span className="w-[3px] h-[11px] rounded-sm bg-white/80" />
            <span className="ml-1 w-[18px] h-[9px] rounded-[3px] border border-white/50 relative"><span className="absolute inset-[1.5px] right-[4px] rounded-[1px] bg-white/80" /></span>
          </div>
        </div>
        <div className="absolute inset-0 pt-[46px] px-3.5 pb-3 flex flex-col">{children}</div>
      </div>
    </div>
  )
}

// Shared glass card matching the app (`rgba(255,255,255,0.075)` + border-white/[0.09])
function MiniCard({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`rounded-[16px] p-3 ${className}`} style={{ background: 'rgba(255,255,255,0.075)', border: '1px solid rgba(255,255,255,0.09)', ...style }}>
      {children}
    </div>
  )
}

function MiniBottomNav({ active }: { active: number }) {
  const icons = [Home, MessageCircle, Dumbbell, HeartPulse, Utensils]
  return (
    <div className="mt-auto mx-auto flex items-center gap-1 px-2 py-1.5 rounded-full" style={{ background: 'rgba(20,22,26,0.85)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {icons.map((Icon, i) => (
        <span key={i} className="w-[34px] h-[30px] rounded-full flex items-center justify-center" style={i === active ? { background: 'rgba(45,212,191,0.16)' } : {}}>
          <Icon size={15} style={{ color: i === active ? '#2dd4bf' : 'rgba(255,255,255,0.4)' }} strokeWidth={2.2} />
        </span>
      ))}
    </div>
  )
}

// ── Screen 1: Today — readiness ring + advice ───────────────────
function TodayScreen() {
  const R = 44, C = 2 * Math.PI * R, r = 82
  return (
    <>
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">Tuesday, July 1</p>
      <p className="text-[21px] font-bold leading-tight mb-3">Good morning</p>

      <MiniCard className="flex flex-col items-center py-4">
        <div className="relative">
          <svg width="120" height="120" viewBox="0 0 120 120" className="-rotate-90">
            <circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
            <circle cx="60" cy="60" r={R} fill="none" stroke="#2dd4bf" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${(r / 100) * C} ${C}`} style={{ filter: 'drop-shadow(0 0 5px rgba(45,212,191,0.6))' }} />
            <text x="60" y="57" transform="rotate(90 60 60)" textAnchor="middle" className="fill-white" style={{ fontSize: 27, fontWeight: 800 }}>{r}</text>
            <text x="60" y="73" transform="rotate(90 60 60)" textAnchor="middle" style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', fill: '#2dd4bf' }}>READY</text>
          </svg>
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <Zap size={11} className="text-teal-400" />
          <p className="text-[11px] font-semibold text-white/85">Green light — train as planned</p>
        </div>
      </MiniCard>

      <div className="grid grid-cols-3 gap-2 mt-2">
        {[
          { Icon: Moon,       label: 'Sleep', value: '7h 42', tint: '#60a5fa' },
          { Icon: HeartPulse, label: 'HRV',   value: '68',    tint: '#f472b6' },
          { Icon: Activity,   label: 'RHR',   value: '51',    tint: '#2dd4bf' },
        ].map(({ Icon, label, value, tint }) => (
          <MiniCard key={label} className="flex flex-col items-start !p-2.5">
            <Icon size={13} style={{ color: tint }} />
            <span className="text-[13px] font-bold mt-1.5 leading-none">{value}</span>
            <span className="text-[9px] text-white/40 mt-0.5">{label}</span>
          </MiniCard>
        ))}
      </div>

      <MiniCard className="mt-2 flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0" style={{ background: 'rgba(251,146,60,0.16)' }}>
          <Footprints size={15} className="text-orange-400" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold leading-tight">Threshold run · 18:00</p>
          <p className="text-[9.5px] text-white/45">8 km · Zone 4 · route ready</p>
        </div>
      </MiniCard>

      <MiniBottomNav active={0} />
    </>
  )
}

// ── Screen 2: Rico chat ─────────────────────────────────────────
function CoachScreen() {
  const msgs: { me?: boolean; text: string }[] = [
    { me: true, text: 'Should I train today?' },
    { text: 'Readiness 82 — green light. HRV is above baseline, go for the threshold session at 18:00.' },
    { me: true, text: 'What do I eat beforehand?' },
    { text: 'Light carbs ~90 min before: oats with banana works. You still need 48g protein today.' },
  ]
  return (
    <>
      <div className="flex items-center gap-2 pb-2.5 mb-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="w-8 h-8 rounded-full overflow-hidden shrink-0" style={{ border: '1.5px solid rgba(45,212,191,0.4)' }}>
          <img src="/rico.png" alt="Rico" className="w-full h-full object-cover" />
        </div>
        <div>
          <p className="text-[12px] font-semibold leading-tight">Rico</p>
          <p className="text-[9px] text-teal-400 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-teal-400 inline-block" style={{ animation: 'kBlink 1.6s ease-in-out infinite' }} /> Online
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {msgs.map((m, i) => (
          <div key={i} className={`flex ${m.me ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-2.5 py-1.5 text-[10px] leading-relaxed ${m.me ? 'rounded-[11px] rounded-br-[3px]' : 'rounded-[11px] rounded-bl-[3px]'}`}
              style={m.me
                ? { background: 'rgb(45,212,191)', color: 'rgb(5,6,8)', fontWeight: 500 }
                : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto mb-1 flex items-center gap-2 h-[34px] px-3 rounded-full" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.09)' }}>
        <span className="text-[10px] text-white/30 flex-1">Ask Rico anything…</span>
        <Send size={13} className="text-teal-400" />
      </div>
      <MiniBottomNav active={1} />
    </>
  )
}

// ── Screen 3: Training ──────────────────────────────────────────
function TrainingScreen() {
  const week = [
    { Icon: Footprints, name: 'Threshold run',  detail: '8.2 km · 4:38 /km',  tint: '#2dd4bf', done: true },
    { Icon: Dumbbell,   name: 'Push day',       detail: '52 min · 8,420 kg',  tint: '#fb923c', done: true },
    { Icon: Bike,       name: 'Endurance ride', detail: '46 km · Zone 2',     tint: '#22d3ee', done: false },
  ]
  return (
    <>
      <p className="text-[21px] font-bold leading-tight mb-3">Training</p>

      <MiniCard>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">This week</span>
          <span className="text-[10px] font-bold text-teal-400">4 of 5</span>
        </div>
        <div className="flex gap-1">
          {[1, 1, 1, 1, 0].map((v, i) => (
            <span key={i} className="flex-1 h-[5px] rounded-full" style={{ background: v ? '#2dd4bf' : 'rgba(255,255,255,0.10)' }} />
          ))}
        </div>
      </MiniCard>

      <MiniCard className="mt-2" style={{ background: 'rgba(45,212,191,0.09)', border: '1px solid rgba(45,212,191,0.22)' }}>
        <div className="flex items-center gap-1.5 mb-1">
          <Flame size={11} className="text-teal-400" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-teal-400">Today's session</span>
        </div>
        <p className="text-[12px] font-bold leading-tight">Interval run · 6 × 800m</p>
        <p className="text-[9.5px] text-white/50 mt-0.5">Zone 4 · 4:20 /km reps · 45 min total</p>
      </MiniCard>

      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40 mt-3 mb-1.5">Recent</p>
      <div className="flex flex-col gap-1.5">
        {week.map(({ Icon, name, detail, tint }) => (
          <MiniCard key={name} className="flex items-center gap-2.5 !p-2.5">
            <span className="w-7 h-7 rounded-[9px] flex items-center justify-center shrink-0" style={{ background: `${tint}1c` }}>
              <Icon size={13} style={{ color: tint }} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-semibold leading-tight truncate">{name}</p>
              <p className="text-[9px] text-white/40">{detail}</p>
            </div>
            <span className="text-white/25 text-[13px]">›</span>
          </MiniCard>
        ))}
      </div>

      <MiniBottomNav active={2} />
    </>
  )
}

// ── Screen 4: Food — macros ─────────────────────────────────────
function FoodScreen() {
  const macros = [
    { label: 'Protein', now: 132, goal: 180, tint: '#2dd4bf' },
    { label: 'Carbs',   now: 204, goal: 250, tint: '#fb923c' },
    { label: 'Fat',     now: 58,  goal: 80,  tint: '#a78bfa' },
  ]
  const meals = [
    { emoji: '🥣', name: 'Oats + whey',       detail: 'Breakfast · 520 kcal' },
    { emoji: '🥗', name: 'Chicken bowl',      detail: 'Lunch · 640 kcal' },
    { emoji: '🍝', name: 'Pasta pre-workout', detail: 'Dinner · 710 kcal' },
  ]
  return (
    <>
      <p className="text-[21px] font-bold leading-tight mb-3">Food</p>

      <MiniCard>
        <div className="flex items-baseline justify-between mb-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">Today</span>
          <span className="text-[13px] font-bold">1,870 <span className="text-[9px] text-white/40 font-medium">/ 2,450 kcal</span></span>
        </div>
        <div className="flex flex-col gap-2">
          {macros.map(({ label, now, goal, tint }) => (
            <div key={label}>
              <div className="flex justify-between mb-1">
                <span className="text-[9.5px] font-medium text-white/60">{label}</span>
                <span className="text-[9.5px] font-semibold" style={{ color: tint }}>{now}g <span className="text-white/30">/ {goal}g</span></span>
              </div>
              <div className="h-[5px] rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <div className="h-full rounded-full" style={{ width: `${Math.round((now / goal) * 100)}%`, background: tint }} />
              </div>
            </div>
          ))}
        </div>
      </MiniCard>

      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40 mt-3 mb-1.5">Logged</p>
      <div className="flex flex-col gap-1.5">
        {meals.map(({ emoji, name, detail }) => (
          <MiniCard key={name} className="flex items-center gap-2.5 !p-2.5">
            <span className="w-7 h-7 rounded-[9px] flex items-center justify-center text-[13px] shrink-0" style={{ background: 'rgba(255,255,255,0.06)' }}>{emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-semibold leading-tight truncate">{name}</p>
              <p className="text-[9px] text-white/40">{detail}</p>
            </div>
          </MiniCard>
        ))}
      </div>

      <MiniBottomNav active={4} />
    </>
  )
}

// ── Screen 5: Health — sleep + HRV ──────────────────────────────
function HealthScreen() {
  const hrv = [58, 62, 60, 66, 63, 70, 68]
  const max = Math.max(...hrv), min = Math.min(...hrv)
  const pts = hrv.map((v, i) => `${(i / (hrv.length - 1)) * 100},${34 - ((v - min) / (max - min)) * 26}`).join(' ')
  return (
    <>
      <p className="text-[21px] font-bold leading-tight mb-3">Health</p>

      <MiniCard>
        <div className="flex items-center gap-1.5 mb-2">
          <Moon size={12} className="text-blue-400" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">Last night</span>
          <span className="ml-auto text-[13px] font-bold">7h 42m</span>
        </div>
        <div className="flex h-[10px] rounded-full overflow-hidden gap-[2px]">
          <span style={{ width: '22%', background: '#3b82f6' }} />
          <span style={{ width: '52%', background: '#60a5fa' }} />
          <span style={{ width: '26%', background: '#a78bfa' }} />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="text-[8.5px] text-white/40">Deep 1h 41</span>
          <span className="text-[8.5px] text-white/40">Light 4h 01</span>
          <span className="text-[8.5px] text-white/40">REM 2h 00</span>
        </div>
      </MiniCard>

      <MiniCard className="mt-2">
        <div className="flex items-center gap-1.5 mb-1">
          <HeartPulse size={12} className="text-pink-400" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/45">HRV · 7 days</span>
          <span className="ml-auto text-[13px] font-bold">68 <span className="text-[8.5px] text-teal-400 font-semibold">▲ above baseline</span></span>
        </div>
        <svg viewBox="0 0 100 36" className="w-full" style={{ height: 42 }} preserveAspectRatio="none">
          <polyline points={pts} fill="none" stroke="#f472b6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </MiniCard>

      <div className="grid grid-cols-2 gap-2 mt-2">
        <MiniCard className="!p-2.5">
          <span className="text-[9px] text-white/40">Resting HR</span>
          <p className="text-[15px] font-bold leading-tight mt-0.5">51 <span className="text-[9px] text-white/40 font-medium">bpm</span></p>
        </MiniCard>
        <MiniCard className="!p-2.5">
          <span className="text-[9px] text-white/40">Recovery</span>
          <p className="text-[15px] font-bold leading-tight mt-0.5 text-teal-400">Ready</p>
        </MiniCard>
      </div>

      <MiniBottomNav active={3} />
    </>
  )
}

// ── Full-width animated ECG line ────────────────────────────────
function PulseLine() {
  const unit = 'h30 l10,0 l6,-26 l8,46 l8,-34 l6,14 l8,0 '
  const path = `M0,40 ${unit.repeat(14)} h60`
  return (
    <div className="relative z-10 my-4 overflow-hidden" style={{ height: 80 }}>
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2" style={{ background: 'rgba(255,255,255,0.06)' }} />
      <svg className="w-full" height="80" viewBox="0 0 1400 80" preserveAspectRatio="none">
        <defs>
          <linearGradient id="ecg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(45,212,191,0)" />
            <stop offset="50%" stopColor="rgba(45,212,191,0.9)" />
            <stop offset="100%" stopColor="rgba(251,146,60,0.9)" />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke="url(#ecg)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
          style={{ strokeDasharray: 1400, strokeDashoffset: 1400, animation: 'kScan 4s linear infinite', filter: 'drop-shadow(0 0 5px rgba(45,212,191,0.6))' }} />
      </svg>
    </div>
  )
}

// ── Small decorative pulse for the CTA background ───────────────
function MiniPulse() {
  const unit = 'h26 l8,0 l5,-20 l7,36 l7,-26 l5,10 l7,0 '
  const path = `M0,50 ${unit.repeat(16)} h40`
  return (
    <svg className="w-full h-full" viewBox="0 0 1400 100" preserveAspectRatio="none">
      <path d={path} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" strokeLinejoin="round"
        style={{ strokeDasharray: 1400, strokeDashoffset: 1400, animation: 'kScan 6s linear infinite' }} />
    </svg>
  )
}
