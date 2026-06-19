'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  Activity, Brain, HeartPulse, Utensils, Dumbbell, Moon, CalendarDays,
  ArrowRight, Check, X, Sparkles, Plus, Minus,
} from 'lucide-react'

// Professional public marketing page shown to logged-out visitors on `/`.
// Logged-in users get the dashboard instead (gated in app/page.tsx).

const FEATURES = [
  { Icon: Brain,        title: 'AI Coach',             desc: 'Rico, your personal coach, reads all your data and answers any question about training, recovery and nutrition — instantly, in plain language.' },
  { Icon: CalendarDays, title: 'Calendar-Aware',       desc: 'Kern syncs with your calendar and reads your planned sessions, so every piece of advice fits around the workouts you actually have scheduled.' },
  { Icon: HeartPulse,   title: 'Recovery & Readiness', desc: 'HRV, resting heart rate and sleep combine into a single readiness score, so you know exactly when to push and when to hold back.' },
  { Icon: Dumbbell,     title: 'Smart Training Advice', desc: 'Daily recommendations based on your load, ramp rate and scheduled sessions — telling you what to do today, not a generic weekly template.' },
  { Icon: Utensils,     title: 'Nutrition & Macros',   desc: 'Scan barcodes, log meals and effortlessly stay on top of your protein and calorie goals — tied back to your training demands.' },
  { Icon: Moon,         title: 'Sleep Insights',       desc: 'Deep sleep, REM and efficiency every night — with concrete, personalised tips to recover better.' },
]

const STEPS = [
  { n: '01', title: 'Connect everything', desc: 'Link Strava, Hevy, Fitbit and your calendar in a single tap. Your training, health and schedule flow in automatically.' },
  { n: '02', title: 'We analyse it for you', desc: 'Kern combines your readiness, training load, sleep, nutrition and planned sessions into clear scores — no spreadsheets, no guesswork.' },
  { n: '03', title: 'Get daily advice',    desc: 'Your AI coach tells you what to do today: push, hold back or rest — adapted to what your calendar already has planned.' },
]

const BENEFITS = [
  'A personal AI coach that actually understands your data',
  'Advice that adapts to your calendar and planned sessions',
  'One dashboard for training, recovery, sleep and nutrition',
  'Tailored recommendations — never a generic program',
]

const COMPARE = [
  { feature: 'Reads your real health & training data',      kern: true,  apps: false, pt: false },
  { feature: 'Adapts advice to your calendar',              kern: true,  apps: false, pt: false },
  { feature: 'Combines readiness, load, sleep & nutrition', kern: true,  apps: false, pt: true  },
  { feature: 'Tells you what to do today',                  kern: true,  apps: false, pt: true  },
  { feature: 'Available 24/7, answers instantly',           kern: true,  apps: true,  pt: false },
  { feature: 'Costs a fraction of a coach',                 kern: true,  apps: true,  pt: false },
]

const INTEGRATIONS = ['Strava', 'Hevy', 'Fitbit', 'Google Calendar', 'Apple Health']

const FAQ = [
  { q: 'Do I need a wearable?', a: 'A wearable like Fitbit unlocks recovery, sleep and HRV insights, but it\'s not required. You can still track training, nutrition and your calendar — and add a device anytime.' },
  { q: 'What does it cost?', a: 'Kern is free to get started. You can connect your apps and use the dashboard and AI coach right away — no credit card needed.' },
  { q: 'Which apps does it connect to?', a: 'Strava and Hevy for training, Fitbit for recovery and sleep, and Google Calendar for your schedule. More integrations are on the way.' },
  { q: 'How is this different from a personal trainer?', a: 'A coach isn\'t there at 6am and can\'t read your HRV overnight. Kern combines all your data with your calendar and gives instant, personalised advice 24/7 — at a fraction of the cost.' },
  { q: 'Is my health data private?', a: 'Your data is yours. It\'s used only to power your dashboard and personal advice — never sold. You stay in control of every connection.' },
]

// Fade-in on scroll — adds `data-revealed` once a section enters the viewport.
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setShown(true); obs.disconnect() } },
      { threshold: 0.12 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, shown }
}

function Reveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const { ref, shown } = useReveal<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
      }}
    >
      {children}
    </div>
  )
}

export function LandingPage() {
  const router = useRouter()
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden" style={{ scrollBehavior: 'smooth' }}>
      <style>{`
        @keyframes lpFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes lpFadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        html { scroll-behavior: smooth; }
      `}</style>

      {/* ── Top nav ─────────────────────────────────────────────── */}
      <header
        className="fixed top-0 inset-x-0 z-50"
        style={{
          background: 'rgba(5,6,8,0.72)',
          backdropFilter: 'blur(18px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between px-5 sm:px-8 h-[64px]">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-[11px] flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(45,212,191,0.28) 0%, rgba(255,120,0,0.20) 100%)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              <Activity size={19} className="text-teal-400" strokeWidth={2.2} />
            </div>
            <span className="text-[19px] font-bold tracking-tight">Kern</span>
          </div>

          {/* Anchor nav — desktop only */}
          <nav className="hidden md:flex items-center gap-7 text-[15px] font-medium text-white/55">
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
            <a href="#why" className="hover:text-white transition-colors">Why Kern</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </nav>

          {/* Login button — top right */}
          <button
            onClick={() => router.push('/login')}
            className="h-[40px] px-5 rounded-full bg-white text-black font-semibold text-[15px] active:scale-[0.97] transition-transform"
          >
            Log in
          </button>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-[130px] pb-20 sm:pt-[160px] sm:pb-24">
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[420px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(45,212,191,0.18) 0%, transparent 65%)', filter: 'blur(40px)' }}
        />

        <div className="relative flex flex-col items-center text-center">
          <div
            className="inline-flex items-center gap-2 h-[32px] px-4 rounded-full mb-7 text-[13px] font-medium text-white/70"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', animation: 'lpFadeUp 0.6s ease both' }}
          >
            <Sparkles size={14} className="text-teal-400" />
            AI Fitness & Health Coaching
          </div>

          <h1 className="text-[44px] sm:text-[68px] font-bold leading-[1.04] tracking-tight max-w-4xl" style={{ animation: 'lpFadeUp 0.6s ease 0.05s both' }}>
            Your body, <span className="text-teal-400">understood</span>.
            <br />
            Advice that fits your day.
          </h1>

          <p className="text-[17px] sm:text-[20px] text-white/55 mt-6 max-w-2xl font-medium leading-relaxed" style={{ animation: 'lpFadeUp 0.6s ease 0.12s both' }}>
            Kern connects your training, sleep, recovery, nutrition <span className="text-white/80">and your calendar</span> —
            then an AI coach tells you exactly what to do today, around the sessions you already have planned.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 mt-10 w-full sm:w-auto" style={{ animation: 'lpFadeUp 0.6s ease 0.18s both' }}>
            <button
              onClick={() => router.push('/login')}
              className="w-full sm:w-auto h-[54px] px-8 rounded-full bg-white text-black font-semibold text-[17px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              Start free
              <ArrowRight size={19} strokeWidth={2.2} />
            </button>
            <button
              onClick={() => router.push('/login')}
              className="w-full sm:w-auto h-[54px] px-8 rounded-full font-semibold text-[17px] text-white active:scale-[0.98] transition-transform"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              Log in
            </button>
          </div>

          <p className="text-[13px] text-white/30 mt-5">No credit card required · Get started instantly</p>
        </div>

        {/* Product preview mockup */}
        <div className="relative mt-16 sm:mt-20 max-w-3xl mx-auto">
          <div
            className="absolute -inset-x-10 -bottom-10 top-10 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse at center, rgba(45,212,191,0.14) 0%, transparent 70%)', filter: 'blur(40px)' }}
          />
          <DashboardMockup />
        </div>
      </section>

      {/* ── Integrations strip ──────────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 py-10">
        <Reveal>
          <p className="text-center text-[13px] font-semibold uppercase tracking-[0.14em] text-white/30 mb-6">Works with your tools</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {INTEGRATIONS.map((name) => (
              <div
                key={name}
                className="flex items-center gap-2 h-[42px] px-5 rounded-full text-[15px] font-semibold text-white/70"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)' }}
              >
                <span className="w-2 h-2 rounded-full bg-teal-400/70" />
                {name}
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── Features ────────────────────────────────────────────── */}
      <section id="features" className="relative max-w-6xl mx-auto px-5 sm:px-8 py-20 scroll-mt-20">
        <Reveal>
          <div className="text-center mb-14">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-teal-400/80 mb-3">What Kern does</p>
            <h2 className="text-[34px] sm:text-[46px] font-bold tracking-tight">Everything, working together</h2>
            <p className="text-[17px] text-white/50 mt-4 max-w-2xl mx-auto">
              Kern brings all your health data <span className="text-white/75">and your schedule</span> together,
              then turns it into clear, daily advice.
            </p>
          </div>
        </Reveal>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ Icon, title, desc }) => (
            <Reveal key={title}>
              <div
                className="h-full rounded-[22px] p-6 transition-colors hover:bg-white/[0.06]"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div
                  className="w-12 h-12 rounded-[14px] flex items-center justify-center mb-5"
                  style={{ background: 'rgba(45,212,191,0.12)', border: '1px solid rgba(45,212,191,0.18)' }}
                >
                  <Icon size={23} className="text-teal-400" strokeWidth={2} />
                </div>
                <h3 className="text-[19px] font-bold mb-2">{title}</h3>
                <p className="text-[15px] text-white/50 leading-relaxed">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Meet Rico + chat demo ───────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 py-20">
        <Reveal>
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-orange-400/80 mb-3">Meet your coach</p>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full overflow-hidden shrink-0" style={{ border: '2px solid rgba(45,212,191,0.4)' }}>
                  <img src="/rico.png" alt="Rico" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h2 className="text-[32px] sm:text-[40px] font-bold tracking-tight leading-none">Say hi to Rico</h2>
                  <p className="text-[15px] text-white/45 mt-1.5">Your data-driven AI coach</p>
                </div>
              </div>
              <p className="text-[17px] text-white/55 leading-relaxed">
                Ask Rico anything — whether you should train today, how you slept, what to eat,
                or how your recovery looks. He reads your real numbers and your calendar, and
                answers straight to the point. No generic tips, just what applies to <span className="text-white/80">you</span>.
              </p>
              <button
                onClick={() => router.push('/login')}
                className="mt-8 h-[50px] px-7 rounded-full bg-white text-black font-semibold text-[16px] inline-flex items-center gap-2 active:scale-[0.98] transition-transform"
              >
                Chat with Rico
                <ArrowRight size={18} strokeWidth={2.2} />
              </button>
            </div>

            {/* Chat demo */}
            <ChatDemo />
          </div>
        </Reveal>
      </section>

      {/* ── How it works ────────────────────────────────────────── */}
      <section id="how-it-works" className="relative max-w-6xl mx-auto px-5 sm:px-8 py-20 scroll-mt-20">
        <Reveal>
          <div className="text-center mb-14">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-orange-400/80 mb-3">How it works</p>
            <h2 className="text-[34px] sm:text-[46px] font-bold tracking-tight">From data to daily advice</h2>
          </div>
        </Reveal>

        <div className="grid sm:grid-cols-3 gap-6">
          {STEPS.map(({ n, title, desc }) => (
            <Reveal key={n}>
              <div className="relative">
                <div className="text-[56px] font-bold leading-none text-white/[0.08] mb-3">{n}</div>
                <h3 className="text-[21px] font-bold mb-2">{title}</h3>
                <p className="text-[15px] text-white/50 leading-relaxed">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Why Kern is better ──────────────────────────────────── */}
      <section id="why" className="relative max-w-5xl mx-auto px-5 sm:px-8 py-20 scroll-mt-20">
        <Reveal>
          <div className="text-center mb-12">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-teal-400/80 mb-3">Why Kern</p>
            <h2 className="text-[34px] sm:text-[46px] font-bold tracking-tight">Why we&apos;re different</h2>
            <p className="text-[17px] text-white/50 mt-4 max-w-2xl mx-auto">
              Most apps just show you numbers. A coach isn&apos;t there at 6am. Kern reads your data,
              your calendar and your recovery — and actually tells you what to do.
            </p>
          </div>

          <div
            className="rounded-[24px] overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
          >
            <div className="grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[1fr_120px_120px_120px] items-center px-4 sm:px-6 py-4 border-b border-white/[0.07]">
              <span className="text-[13px] sm:text-[14px] font-semibold text-white/40">Capability</span>
              <span className="text-[12px] sm:text-[14px] font-bold text-teal-400 text-center px-2">Kern</span>
              <span className="text-[12px] sm:text-[14px] font-semibold text-white/40 text-center px-2">Fitness apps</span>
              <span className="text-[12px] sm:text-[14px] font-semibold text-white/40 text-center px-2">Personal trainer</span>
            </div>

            {COMPARE.map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-[1fr_auto_auto_auto] sm:grid-cols-[1fr_120px_120px_120px] items-center px-4 sm:px-6 py-4 ${i < COMPARE.length - 1 ? 'border-b border-white/[0.05]' : ''}`}
              >
                <span className="text-[14px] sm:text-[15px] text-white/80 font-medium pr-3">{row.feature}</span>
                <Cell on={row.kern} highlight />
                <Cell on={row.apps} />
                <Cell on={row.pt} />
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────── */}
      <section id="faq" className="relative max-w-3xl mx-auto px-5 sm:px-8 py-20 scroll-mt-20">
        <Reveal>
          <div className="text-center mb-12">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-orange-400/80 mb-3">FAQ</p>
            <h2 className="text-[34px] sm:text-[46px] font-bold tracking-tight">Common questions</h2>
          </div>

          <div className="flex flex-col gap-3">
            {FAQ.map((item, i) => {
              const open = openFaq === i
              return (
                <div
                  key={item.q}
                  className="rounded-[18px] overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <button
                    onClick={() => setOpenFaq(open ? null : i)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                  >
                    <span className="text-[16px] sm:text-[17px] font-semibold text-white">{item.q}</span>
                    <span className="shrink-0 text-teal-400">{open ? <Minus size={19} /> : <Plus size={19} />}</span>
                  </button>
                  {open && (
                    <p className="px-5 pb-5 text-[15px] text-white/55 leading-relaxed">{item.a}</p>
                  )}
                </div>
              )
            })}
          </div>
        </Reveal>
      </section>

      {/* ── Benefits / CTA band ─────────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 py-20">
        <Reveal>
          <div
            className="rounded-[32px] p-8 sm:p-14 overflow-hidden relative"
            style={{
              background: 'linear-gradient(135deg, rgba(45,212,191,0.10) 0%, rgba(255,120,0,0.07) 100%)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <h2 className="text-[32px] sm:text-[42px] font-bold tracking-tight leading-tight">
                  Stop guessing.<br />Train on data.
                </h2>
                <div className="flex flex-col gap-3.5 mt-8">
                  {BENEFITS.map((b) => (
                    <div key={b} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-teal-400/15 border border-teal-400/30 flex items-center justify-center shrink-0 mt-0.5">
                        <Check size={14} className="text-teal-400" strokeWidth={3} />
                      </div>
                      <span className="text-[16px] text-white/80 font-medium">{b}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col items-start lg:items-end gap-4">
                <button
                  onClick={() => router.push('/login')}
                  className="w-full lg:w-auto h-[56px] px-10 rounded-full bg-white text-black font-semibold text-[18px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
                >
                  Create your account
                  <ArrowRight size={20} strokeWidth={2.2} />
                </button>
                <p className="text-[14px] text-white/40 lg:text-right">
                  Join in and get the most out of every workout.
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="relative max-w-6xl mx-auto px-5 sm:px-8 py-12 border-t border-white/[0.06] mt-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-[10px] flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.28) 0%, rgba(255,120,0,0.20) 100%)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <Activity size={16} className="text-teal-400" strokeWidth={2.2} />
            </div>
            <span className="text-[16px] font-bold">Kern</span>
          </div>
          <p className="text-[13px] text-white/30">© {new Date().getFullYear()} Kern — AI Fitness & Health Coaching</p>
          <button onClick={() => router.push('/login')} className="text-[14px] text-white/50 hover:text-white transition-colors font-medium">
            Log in →
          </button>
        </div>
      </footer>
    </div>
  )
}

// ── Dashboard preview mockup ────────────────────────────────────
function DashboardMockup() {
  const R = 34, C = 2 * Math.PI * R, score = 82
  const dash = (score / 100) * C
  return (
    <div
      className="relative rounded-[26px] p-5 sm:p-7"
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
        animation: 'lpFloat 6s ease-in-out infinite',
      }}
    >
      {/* Top: readiness ring + recommendation */}
      <div className="flex items-center gap-5">
        <svg width="92" height="92" viewBox="0 0 92 92" className="-rotate-90 shrink-0">
          <circle cx="46" cy="46" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" />
          <circle cx="46" cy="46" r={R} fill="none" stroke="rgb(45,212,191)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${dash} ${C}`} />
          <text x="46" y="42" transform="rotate(90 46 46)" textAnchor="middle" className="fill-white" style={{ fontSize: '22px', fontWeight: 700 }}>{score}</text>
          <text x="46" y="58" transform="rotate(90 46 46)" textAnchor="middle" className="fill-white/40" style={{ fontSize: '9px', fontWeight: 600 }}>READY</text>
        </svg>
        <div className="min-w-0 text-left">
          <p className="text-[11px] font-semibold text-white/30 uppercase tracking-[0.1em] mb-1">Today&apos;s Recommendation</p>
          <p className="text-[18px] sm:text-[20px] font-bold text-white leading-tight">Green light — threshold run</p>
          <p className="text-[13px] text-teal-400 mt-1">Readiness high · HRV above baseline</p>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-3 mt-5">
        {[
          { label: 'HRV', value: '68 ms', sub: '+9%', good: true },
          { label: 'Sleep', value: '7h 42m', sub: 'Score 88', good: true },
          { label: 'Load', value: 'Optimal', sub: 'ACWR 1.1', good: true },
        ].map((m) => (
          <div key={m.label} className="rounded-[14px] px-3 py-3 text-left" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[11px] text-white/35 mb-1">{m.label}</p>
            <p className="text-[16px] font-bold text-white leading-none">{m.value}</p>
            <p className="text-[11px] text-teal-400 mt-1">{m.sub}</p>
          </div>
        ))}
      </div>

      {/* Upcoming */}
      <div className="mt-4 flex items-center gap-3 rounded-[14px] px-4 py-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <CalendarDays size={18} className="text-orange-400 shrink-0" />
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[14px] font-semibold text-white truncate">Threshold run · 18:00</p>
          <p className="text-[12px] text-white/35">From your calendar</p>
        </div>
        <span className="text-white/25 text-[18px]">›</span>
      </div>
    </div>
  )
}

// ── Rico chat demo ──────────────────────────────────────────────
function ChatDemo() {
  const lines: { role: 'user' | 'rico'; text: string }[] = [
    { role: 'user', text: 'Should I train today?' },
    { role: 'rico', text: 'Readiness 82 — green light. HRV is above baseline, go for the threshold session you have planned at 18:00.' },
    { role: 'user', text: 'How much protein am I missing?' },
    { role: 'rico', text: '48g to go. Aim for a 200g chicken breast or a shake with your next meal.' },
  ]
  return (
    <div
      className="rounded-[24px] p-5 sm:p-6"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}
    >
      {/* header */}
      <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/[0.07]">
        <div className="w-9 h-9 rounded-full overflow-hidden shrink-0" style={{ border: '1.5px solid rgba(45,212,191,0.4)' }}>
          <img src="/rico.png" alt="Rico" className="w-full h-full object-cover" />
        </div>
        <div>
          <p className="text-[15px] font-semibold text-white leading-tight">Rico</p>
          <p className="text-[12px] text-teal-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block" /> Online
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {lines.map((l, i) => (
          <div
            key={i}
            className={`flex ${l.role === 'user' ? 'justify-end' : 'justify-start'}`}
            style={{ animation: `lpFadeUp 0.5s ease ${0.15 * i}s both` }}
          >
            <div
              className={`max-w-[82%] px-4 py-2.5 text-[14px] leading-relaxed ${l.role === 'user' ? 'rounded-[16px] rounded-br-[4px]' : 'rounded-[16px] rounded-bl-[4px]'}`}
              style={l.role === 'user'
                ? { background: 'rgb(45,212,191)', color: 'rgb(5,6,8)' }
                : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              {l.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Comparison cell — check for yes, dash for no
function Cell({ on, highlight = false }: { on: boolean; highlight?: boolean }) {
  return (
    <div className="flex justify-center px-2">
      {on ? (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center"
          style={{
            background: highlight ? 'rgba(45,212,191,0.18)' : 'rgba(255,255,255,0.08)',
            border: highlight ? '1px solid rgba(45,212,191,0.35)' : '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <Check size={14} className={highlight ? 'text-teal-400' : 'text-white/60'} strokeWidth={3} />
        </div>
      ) : (
        <X size={16} className="text-white/15" strokeWidth={2.5} />
      )}
    </div>
  )
}
