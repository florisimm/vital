'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  Activity, Brain, HeartPulse, Utensils, Dumbbell, Moon, CalendarDays,
  ArrowRight, Check, Plus, Minus, Zap, TrendingUp, Flame, Waves,
} from 'lucide-react'

// Public marketing page shown to logged-out visitors on `/`.
// Logged-in users get the dashboard instead (gated in app/page.tsx).
//
// Design concept — "read your core": a living health-monitor aesthetic.
// An ECG pulse line threads the whole page, the hero is an interactive
// product demo (drag readiness → watch the AI advice change live), and the
// real algorithms are put on display instead of generic feature copy.

// ── The actual advice logic, mirrored from the app ──────────────
function adviceFor(r: number): { tag: string; color: string; head: string; body: string; Icon: typeof Zap } {
  if (r < 40) return {
    tag: 'Rest', color: '#f87171', Icon: Moon,
    head: 'Take rest today',
    body: `Recovery's only ${r}%. A hard session now digs a deeper hole than it's worth — one rest day protects your whole week.`,
  }
  if (r < 62) return {
    tag: 'Easy', color: '#fb923c', Icon: Waves,
    head: 'Keep it easy — Zone 2',
    body: `${r}% — enough to train, but stay aerobic. An easy 30–40 min run builds your base without adding fatigue.`,
  }
  if (r < 82) return {
    tag: 'Go', color: '#2dd4bf', Icon: Activity,
    head: 'Green light — train as planned',
    body: `${r}% and HRV above baseline. Go hit the threshold run you have scheduled at 18:00 — you're ready for it.`,
  }
  return {
    tag: 'Push', color: '#4ade80', Icon: Flame,
    head: 'Fully charged — push it',
    body: `${r}% — exceptional recovery. This is the day for intervals. Your body can take everything you give it.`,
  }
}

const BENTO = [
  { Icon: Brain,        title: 'Rico, your AI coach',   desc: 'Reads every number you have and answers anything about training, recovery or food — instantly, in plain language.', span: 'sm:col-span-2', accent: '#2dd4bf' },
  { Icon: CalendarDays, title: 'Calendar-aware',        desc: 'Syncs your schedule so advice fits around the sessions you already planned.', span: '', accent: '#fb923c' },
  { Icon: HeartPulse,   title: 'One readiness score',   desc: 'HRV, resting HR and sleep fused into a single number — push or hold back.', span: '', accent: '#f472b6' },
  { Icon: Dumbbell,     title: 'Today, not a template', desc: 'Daily calls from your load, ramp rate and schedule — never a generic weekly plan.', span: 'sm:col-span-2', accent: '#a78bfa' },
  { Icon: Utensils,     title: 'Macros that follow training', desc: 'Scan, log, hit your protein — tied to what your body actually did today.', span: '', accent: '#34d399' },
  { Icon: Moon,         title: 'Sleep, decoded',        desc: 'Deep, REM and efficiency each night, with concrete ways to recover better.', span: '', accent: '#60a5fa' },
]

const DAY = [
  { t: '06:32', emoji: '☀️', tint: '#fbbf24', text: 'Morning. You slept 7h 42m — readiness 82. Today is a green light to push.' },
  { t: '12:15', emoji: '🍗', tint: '#34d399', text: "48g of protein to go. Grab a shake with lunch and you're on target." },
  { t: '17:45', emoji: '🏃', tint: '#2dd4bf', text: 'Threshold run in 15 min. Winds are light — your 8 km loop is ready.' },
  { t: '22:30', emoji: '🌙', tint: '#818cf8', text: "Wind down. Lights out by 23:00 so you're fresh for tomorrow's intervals." },
]

const MATH = [
  { label: 'Readiness', formula: 'sleep × 0.5  +  HRV × 0.3  +  resting HR × 0.2', note: 'Your body’s charge, every morning.' },
  { label: 'Training load', formula: 'acute ÷ chronic  (28-day EWMA)', note: 'The ACWR sweet spot pro coaches use.' },
  { label: 'Fatigue', formula: 'Σ effort · e^(−hours · ln2 ⁄ 36)', note: '36-hour half-life decay on every session.' },
]

const INTEGRATIONS = ['Strava', 'Hevy', 'Fitbit', 'Garmin', 'Apple Health', 'Whoop', 'Oura', 'Polar', 'Google Calendar']

const FAQ = [
  { q: 'Do I need a wearable?', a: 'No — you can track training, nutrition and your calendar without one. Any wearable you own then unlocks recovery, sleep and HRV insights, and you can add it anytime.' },
  { q: 'Which wearables work with Kern?', a: 'Any of them. Fitbit, Garmin, Apple Watch, Whoop, Oura, Polar, Suunto and more — connect whatever you already use, and mix multiple devices if you like.' },
  { q: 'What does it cost?', a: 'Kern is free to get started. Connect your apps and use the dashboard and AI coach right away — no credit card needed.' },
  { q: 'How is this different from a personal trainer?', a: "A coach isn't there at 6am and can't read your HRV overnight. Kern combines all your data with your calendar and gives instant, personalised advice 24/7 — at a fraction of the cost." },
  { q: 'Is my health data private?', a: "Your data is yours. It's used only to power your dashboard and personal advice — never sold. You stay in control of every connection." },
]

// Fade-in on scroll
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

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, shown } = useReveal<HTMLDivElement>()
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? 'translateY(0)' : 'translateY(28px)',
        transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
      }}
    >
      {children}
    </div>
  )
}

export function LandingPage() {
  const router = useRouter()
  const go = () => router.push('/login')
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden">
      <style>{`
        @keyframes kFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
        @keyframes kBreathe { 0%,100% { transform: scale(1); opacity: .92; } 50% { transform: scale(1.045); opacity: 1; } }
        @keyframes kFadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes kDraw { to { stroke-dashoffset: 0; } }
        @keyframes kScan { from { stroke-dashoffset: 1400; } to { stroke-dashoffset: 0; } }
        @keyframes kMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @keyframes kBlink { 0%,100% { opacity: .25; } 50% { opacity: 1; } }
        @keyframes kSpin { to { transform: rotate(360deg); } }
        html { scroll-behavior: smooth; }
        .k-grain { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.4'/%3E%3C/svg%3E"); }
      `}</style>

      {/* Film grain overlay for texture */}
      <div className="k-grain fixed inset-0 pointer-events-none z-[1] opacity-[0.035] mix-blend-soft-light" aria-hidden />

      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="fixed top-0 inset-x-0 z-50" style={{ background: 'rgba(5,6,8,0.6)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between px-5 sm:px-8 h-[64px]">
          <div className="flex items-center gap-2.5">
            <Logo size={36} />
            <span className="text-[19px] font-bold tracking-tight">Kern</span>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-[14px] font-medium text-white/50">
            <a href="#demo" className="hover:text-white transition-colors">Try it</a>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
            <a href="#math" className="hover:text-white transition-colors">The math</a>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </nav>
          <button onClick={go} className="h-[40px] px-5 rounded-full bg-white text-black font-semibold text-[15px] active:scale-[0.97] transition-transform">
            Log in
          </button>
        </div>
      </header>

      {/* ── Hero — interactive product demo ─────────────────── */}
      <section id="demo" className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 pt-[120px] pb-16 sm:pt-[150px] sm:pb-20">
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[820px] h-[460px] max-w-[120vw] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(45,212,191,0.16) 0%, transparent 65%)', filter: 'blur(50px)' }} />

        <div className="relative grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-12 items-center">
          {/* Left — kinetic headline */}
          <div className="text-left">
            <div className="inline-flex items-center gap-2 h-[32px] px-4 rounded-full mb-7 text-[13px] font-medium text-white/70"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', animation: 'kFadeUp 0.6s ease both' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400" style={{ animation: 'kBlink 1.8s ease-in-out infinite' }} />
              Live readiness · AI coaching
            </div>

            <h1 className="text-[46px] sm:text-[72px] font-bold leading-[0.98] tracking-[-0.02em]" style={{ animation: 'kFadeUp 0.6s ease 0.05s both' }}>
              Read your
              <br />
              <span className="relative inline-block">
                <span style={{ background: 'linear-gradient(100deg, #2dd4bf, #5eead4 40%, #fb923c)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>core.</span>
              </span>
              <br />
              <span className="text-white/85">Train on data.</span>
            </h1>

            <p className="text-[17px] sm:text-[19px] text-white/55 mt-7 max-w-xl font-medium leading-relaxed" style={{ animation: 'kFadeUp 0.6s ease 0.12s both' }}>
              Kern fuses your training, sleep, recovery, nutrition <span className="text-white/85">and your calendar</span> into one signal — then tells you exactly what to do today.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-9" style={{ animation: 'kFadeUp 0.6s ease 0.18s both' }}>
              <button onClick={go} className="h-[54px] px-8 rounded-full bg-white text-black font-semibold text-[17px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform">
                Start free <ArrowRight size={19} strokeWidth={2.2} />
              </button>
              <span className="text-[13px] text-white/35 sm:ml-2 flex items-center justify-center">No card · Connect in one tap</span>
            </div>
          </div>

          {/* Right — the interactive orb */}
          <Reveal delay={0.1}>
            <ReadinessDemo />
          </Reveal>
        </div>
      </section>

      {/* ── ECG pulse divider ───────────────────────────────── */}
      <PulseLine />

      {/* ── Integration marquee ─────────────────────────────── */}
      <section className="relative z-10 py-10 overflow-hidden">
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
          {/* edge fades */}
          <div className="absolute inset-y-0 left-0 w-24 pointer-events-none" style={{ background: 'linear-gradient(90deg, rgb(5,6,8), transparent)' }} />
          <div className="absolute inset-y-0 right-0 w-24 pointer-events-none" style={{ background: 'linear-gradient(270deg, rgb(5,6,8), transparent)' }} />
        </div>
      </section>

      {/* ── A day with Kern — storytelling timeline ─────────── */}
      <section className="relative z-10 max-w-5xl mx-auto px-5 sm:px-8 py-20 sm:py-24">
        <Reveal>
          <div className="mb-14 max-w-2xl">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-orange-400/80 mb-3">A day with Kern</p>
            <h2 className="text-[34px] sm:text-[48px] font-bold tracking-tight leading-[1.05]">It speaks up at the<br />moments that matter.</h2>
          </div>
        </Reveal>

        <div className="relative pl-6 sm:pl-8">
          {/* vertical spine */}
          <div className="absolute left-[7px] sm:left-[9px] top-2 bottom-2 w-px" style={{ background: 'linear-gradient(180deg, transparent, rgba(45,212,191,0.4), rgba(251,146,60,0.4), transparent)' }} />
          <div className="flex flex-col gap-5">
            {DAY.map((d, i) => (
              <Reveal key={d.t} delay={i * 0.06}>
                <div className="relative">
                  <span className="absolute -left-[22px] sm:-left-[27px] top-5 w-3 h-3 rounded-full" style={{ background: d.tint, boxShadow: `0 0 14px ${d.tint}` }} />
                  <div className="flex items-start gap-4 rounded-[20px] p-4 sm:p-5"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="w-11 h-11 rounded-[13px] flex items-center justify-center text-[20px] shrink-0" style={{ background: `${d.tint}1f`, border: `1px solid ${d.tint}40` }}>
                      {d.emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-mono font-semibold mb-1" style={{ color: d.tint }}>{d.t}</p>
                      <p className="text-[15px] sm:text-[16px] text-white/85 leading-relaxed">{d.text}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bento features ──────────────────────────────────── */}
      <section id="features" className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-20 scroll-mt-20">
        <Reveal>
          <div className="mb-12 max-w-2xl">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-teal-400/80 mb-3">Everything, in one core</p>
            <h2 className="text-[34px] sm:text-[48px] font-bold tracking-tight leading-[1.05]">Not another dashboard.<br />A coach that reads it.</h2>
          </div>
        </Reveal>

        <div className="grid sm:grid-cols-3 gap-4">
          {BENTO.map(({ Icon, title, desc, span, accent }, i) => (
            <Reveal key={title} delay={i * 0.04} className={span}>
              <div className="group h-full rounded-[24px] p-6 sm:p-7 transition-all duration-300 hover:-translate-y-1"
                style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="w-12 h-12 rounded-[14px] flex items-center justify-center mb-5 transition-transform duration-300 group-hover:scale-110"
                  style={{ background: `${accent}1c`, border: `1px solid ${accent}33`, color: accent }}>
                  <Icon size={23} strokeWidth={2} />
                </div>
                <h3 className="text-[19px] font-bold mb-2">{title}</h3>
                <p className="text-[15px] text-white/50 leading-relaxed">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── The math — proof it's real ──────────────────────── */}
      <section id="math" className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-20 scroll-mt-20">
        <Reveal>
          <div className="rounded-[32px] overflow-hidden relative" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="absolute -top-20 -right-20 w-80 h-80 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(45,212,191,0.12), transparent 70%)' }} />
            <div className="relative p-8 sm:p-12">
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-teal-400/80 mb-3">No vibes. Real sports science.</p>
              <h2 className="text-[30px] sm:text-[42px] font-bold tracking-tight leading-[1.06] max-w-2xl">
                Under the hood it&apos;s the same math elite coaches charge for.
              </h2>

              <div className="grid md:grid-cols-3 gap-4 mt-10">
                {MATH.map(({ label, formula, note }) => (
                  <div key={label} className="rounded-[18px] p-5" style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-white/40 mb-3">{label}</p>
                    <code className="block text-[13px] sm:text-[14px] font-mono text-teal-300 leading-relaxed mb-3" style={{ wordBreak: 'break-word' }}>
                      {formula}
                    </code>
                    <p className="text-[13px] text-white/45 leading-relaxed">{note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Meet Rico + live chat ───────────────────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <Reveal>
            <div>
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-orange-400/80 mb-4">Meet your coach</p>
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full overflow-hidden shrink-0" style={{ border: '2px solid rgba(45,212,191,0.4)' }}>
                  <img src="/rico.png" alt="Rico" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h2 className="text-[32px] sm:text-[42px] font-bold tracking-tight leading-none">Say hi to Rico</h2>
                  <p className="text-[15px] text-white/45 mt-1.5">On call 24/7, reads your real numbers</p>
                </div>
              </div>
              <p className="text-[17px] text-white/55 leading-relaxed">
                Ask anything — should I train, how did I sleep, what should I eat, how&apos;s my recovery.
                Rico reads your data and your calendar and answers straight to the point. No generic tips —
                just what applies to <span className="text-white/85">you</span>.
              </p>
              <button onClick={go} className="mt-8 h-[50px] px-7 rounded-full bg-white text-black font-semibold text-[16px] inline-flex items-center gap-2 active:scale-[0.98] transition-transform">
                Chat with Rico <ArrowRight size={18} strokeWidth={2.2} />
              </button>
            </div>
          </Reveal>
          <Reveal delay={0.1}>
            <ChatDemo />
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <section id="faq" className="relative z-10 max-w-3xl mx-auto px-5 sm:px-8 py-20 scroll-mt-20">
        <Reveal>
          <div className="mb-12">
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-orange-400/80 mb-3">FAQ</p>
            <h2 className="text-[34px] sm:text-[46px] font-bold tracking-tight">Good questions.</h2>
          </div>
          <div className="flex flex-col gap-3">
            {FAQ.map((item, i) => {
              const open = openFaq === i
              return (
                <div key={item.q} className="rounded-[18px] overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <button onClick={() => setOpenFaq(open ? null : i)} className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left">
                    <span className="text-[16px] sm:text-[17px] font-semibold text-white">{item.q}</span>
                    <span className="shrink-0 text-teal-400 transition-transform duration-200" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>
                      {open ? <Minus size={19} /> : <Plus size={19} />}
                    </span>
                  </button>
                  <div style={{ maxHeight: open ? 200 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                    <p className="px-5 pb-5 text-[15px] text-white/55 leading-relaxed">{item.a}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </Reveal>
      </section>

      {/* ── Final CTA ───────────────────────────────────────── */}
      <section className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-20">
        <Reveal>
          <div className="rounded-[32px] p-10 sm:p-16 overflow-hidden relative text-center"
            style={{ background: 'linear-gradient(135deg, rgba(45,212,191,0.12) 0%, rgba(255,120,0,0.08) 100%)', border: '1px solid rgba(255,255,255,0.10)' }}>
            <div className="absolute inset-0 pointer-events-none opacity-60">
              <MiniPulse />
            </div>
            <div className="relative">
              <h2 className="text-[34px] sm:text-[54px] font-bold tracking-tight leading-[1.02]">
                Stop guessing.<br />Start reading your core.
              </h2>
              <p className="text-[17px] text-white/55 mt-5 max-w-xl mx-auto">
                Connect your apps, meet Rico, and get advice that actually fits your day — free to start.
              </p>
              <button onClick={go} className="mt-9 h-[58px] px-10 rounded-full bg-white text-black font-semibold text-[18px] inline-flex items-center gap-2 active:scale-[0.98] transition-transform">
                Create your account <ArrowRight size={20} strokeWidth={2.2} />
              </button>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="relative z-10 max-w-6xl mx-auto px-5 sm:px-8 py-12 border-t border-white/[0.06] mt-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Logo size={32} />
            <span className="text-[16px] font-bold">Kern</span>
          </div>
          <p className="text-[13px] text-white/30">© {new Date().getFullYear()} Kern — AI Fitness & Health Coaching</p>
          <button onClick={go} className="text-[14px] text-white/50 hover:text-white transition-colors font-medium">Log in →</button>
        </div>
      </footer>
    </div>
  )
}

// ── Brand logo: heartbeat line in a gradient tile ───────────────
function Logo({ size = 36 }: { size?: number }) {
  return (
    <div className="rounded-[11px] flex items-center justify-center shrink-0" style={{ width: size, height: size, background: 'linear-gradient(135deg, rgba(45,212,191,0.28) 0%, rgba(255,120,0,0.20) 100%)', border: '1px solid rgba(255,255,255,0.12)' }}>
      <Activity size={Math.round(size * 0.52)} className="text-teal-400" strokeWidth={2.2} />
    </div>
  )
}

// ── Interactive readiness orb + live advice (the hero demo) ─────
function ReadinessDemo() {
  const [r, setR] = useState(82)
  const a = adviceFor(r)
  const R = 78, C = 2 * Math.PI * R
  const dash = (r / 100) * C

  return (
    <div className="relative rounded-[28px] p-6 sm:p-7" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)', boxShadow: '0 40px 90px rgba(0,0,0,0.55)', animation: 'kFloat 7s ease-in-out infinite' }}>
      <div className="flex items-center justify-between mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">Today&apos;s Recommendation</p>
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-teal-400/70 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400" style={{ animation: 'kBlink 1.6s ease-in-out infinite' }} /> Live
        </span>
      </div>

      {/* Breathing orb */}
      <div className="flex flex-col items-center">
        <div className="relative" style={{ animation: 'kBreathe 4.5s ease-in-out infinite' }}>
          <div className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${a.color}33, transparent 65%)`, filter: 'blur(18px)' }} />
          <svg width="200" height="200" viewBox="0 0 200 200" className="relative -rotate-90">
            <circle cx="100" cy="100" r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="9" />
            <circle cx="100" cy="100" r={R} fill="none" stroke={a.color} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={`${dash} ${C}`} style={{ transition: 'stroke-dasharray 0.35s ease, stroke 0.35s ease', filter: `drop-shadow(0 0 6px ${a.color}88)` }} />
            <text x="100" y="94" transform="rotate(90 100 100)" textAnchor="middle" className="fill-white" style={{ fontSize: '46px', fontWeight: 800 }}>{r}</text>
            <text x="100" y="118" transform="rotate(90 100 100)" textAnchor="middle" style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', fill: a.color }}>{a.tag.toUpperCase()}</text>
          </svg>
        </div>

        {/* Slider */}
        <div className="w-full mt-3">
          <input
            type="range" min={20} max={98} value={r}
            onChange={(e) => setR(Number(e.target.value))}
            className="w-full appearance-none bg-transparent cursor-pointer"
            style={{ accentColor: a.color }}
            aria-label="Drag to set readiness"
          />
          <p className="text-center text-[12px] text-white/35 mt-1">← drag to feel how the advice changes →</p>
        </div>
      </div>

      {/* Live advice card */}
      <div className="mt-4 rounded-[18px] p-4 flex items-start gap-3" style={{ background: `${a.color}12`, border: `1px solid ${a.color}30`, transition: 'background 0.35s, border-color 0.35s' }}>
        <div className="w-9 h-9 rounded-[11px] flex items-center justify-center shrink-0" style={{ background: `${a.color}22`, color: a.color }}>
          <a.Icon size={18} strokeWidth={2.2} />
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-white leading-tight">{a.head}</p>
          <p className="text-[13px] text-white/55 leading-relaxed mt-1">{a.body}</p>
        </div>
      </div>
    </div>
  )
}

// ── Full-width animated ECG line ────────────────────────────────
function PulseLine() {
  // One heartbeat unit, repeated. Drawn left→right on loop.
  const unit = 'h30 l10,0 l6,-26 l8,46 l8,-34 l6,14 l8,0 '
  const path = `M0,40 ${unit.repeat(14)} h60`
  return (
    <div className="relative z-10 my-6 overflow-hidden" style={{ height: 80 }}>
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

// ── Rico chat demo with typing reveal ───────────────────────────
function ChatDemo() {
  const lines: { role: 'user' | 'rico'; text: string }[] = [
    { role: 'user', text: 'Should I train today?' },
    { role: 'rico', text: 'Readiness 82 — green light. HRV is above baseline, go for the threshold session you have planned at 18:00.' },
    { role: 'user', text: 'How much protein am I missing?' },
    { role: 'rico', text: '48g to go. A 200g chicken breast or a shake with your next meal closes it.' },
  ]
  return (
    <div className="rounded-[24px] p-5 sm:p-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 60px rgba(0,0,0,0.45)' }}>
      <div className="flex items-center gap-3 pb-4 mb-4 border-b border-white/[0.07]">
        <div className="w-9 h-9 rounded-full overflow-hidden shrink-0" style={{ border: '1.5px solid rgba(45,212,191,0.4)' }}>
          <img src="/rico.png" alt="Rico" className="w-full h-full object-cover" />
        </div>
        <div>
          <p className="text-[15px] font-semibold text-white leading-tight">Rico</p>
          <p className="text-[12px] text-teal-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block" style={{ animation: 'kBlink 1.6s ease-in-out infinite' }} /> Online
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {lines.map((l, i) => (
          <div key={i} className={`flex ${l.role === 'user' ? 'justify-end' : 'justify-start'}`} style={{ animation: `kFadeUp 0.5s ease ${0.2 * i}s both` }}>
            <div className={`max-w-[82%] px-4 py-2.5 text-[14px] leading-relaxed ${l.role === 'user' ? 'rounded-[16px] rounded-br-[4px]' : 'rounded-[16px] rounded-bl-[4px]'}`}
              style={l.role === 'user'
                ? { background: 'rgb(45,212,191)', color: 'rgb(5,6,8)' }
                : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {l.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
