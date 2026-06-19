'use client'

import { useRouter } from 'next/navigation'
import {
  Activity, Brain, HeartPulse, Utensils, Dumbbell, Moon,
  ArrowRight, Check, Sparkles,
} from 'lucide-react'

// Professional public marketing page shown to logged-out visitors on `/`.
// Logged-in users get the dashboard instead (gated in app/page.tsx).

const FEATURES = [
  { Icon: Brain,      title: 'AI Coach',          desc: 'Rico, your personal coach, reads your data and answers any question about training, recovery and nutrition — instantly.' },
  { Icon: HeartPulse, title: 'Recovery & Readiness', desc: 'HRV, resting heart rate and sleep combine into a single readiness score, so you know exactly when to push.' },
  { Icon: Dumbbell,   title: 'Smart Training',    desc: 'Automatic training advice based on your load, ramp rate and planned sessions — never over- or under-train again.' },
  { Icon: Utensils,   title: 'Nutrition & Macros', desc: 'Scan barcodes, log meals and effortlessly stay on top of your protein and calorie goals.' },
  { Icon: Moon,       title: 'Sleep Insights',    desc: 'Deep sleep, REM and efficiency every night — with concrete tips to recover better.' },
  { Icon: Activity,   title: 'All in One Place',  desc: 'Strava, Hevy, Fitbit and Google Calendar sync automatically into one overview.' },
]

const STEPS = [
  { n: '01', title: 'Connect your apps', desc: 'Link Strava, Hevy, Fitbit and your calendar in a single tap.' },
  { n: '02', title: 'Get insights',      desc: 'Your data is automatically analysed into clear scores and advice.' },
  { n: '03', title: 'Perform better',    desc: 'Follow your AI coach\'s recommendations and watch your progress every day.' },
]

const BENEFITS = [
  'A personal AI coach that truly understands your data',
  'One dashboard for training, recovery, sleep and nutrition',
  'Automatic sync with your favourite apps',
  'Tailored advice — no generic programs',
]

export function LandingPage() {
  const router = useRouter()

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden">
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
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 pt-[140px] pb-24 sm:pt-[180px] sm:pb-32">
        {/* glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[420px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(45,212,191,0.18) 0%, transparent 65%)', filter: 'blur(40px)' }}
        />

        <div className="relative flex flex-col items-center text-center">
          <div
            className="inline-flex items-center gap-2 h-[32px] px-4 rounded-full mb-7 text-[13px] font-medium text-white/70"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)' }}
          >
            <Sparkles size={14} className="text-teal-400" />
            AI Fitness & Health Coaching
          </div>

          <h1 className="text-[44px] sm:text-[68px] font-bold leading-[1.04] tracking-tight max-w-4xl">
            Your body, <span className="text-teal-400">understood</span>.
            <br />
            Every single day.
          </h1>

          <p className="text-[17px] sm:text-[20px] text-white/55 mt-6 max-w-2xl font-medium leading-relaxed">
            Kern combines your training, sleep, recovery and nutrition into one smart dashboard —
            with an AI coach that knows exactly what you need today.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 mt-10 w-full sm:w-auto">
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
      </section>

      {/* ── Features ────────────────────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 py-20">
        <div className="text-center mb-14">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-teal-400/80 mb-3">Features</p>
          <h2 className="text-[34px] sm:text-[46px] font-bold tracking-tight">Everything you need</h2>
          <p className="text-[17px] text-white/50 mt-4 max-w-2xl mx-auto">
            One app that brings all your health data together and turns it into concrete action.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ Icon, title, desc }) => (
            <div
              key={title}
              className="rounded-[22px] p-6 transition-colors hover:bg-white/[0.06]"
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
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 py-20">
        <div className="text-center mb-14">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-orange-400/80 mb-3">How it works</p>
          <h2 className="text-[34px] sm:text-[46px] font-bold tracking-tight">In three steps</h2>
        </div>

        <div className="grid sm:grid-cols-3 gap-6">
          {STEPS.map(({ n, title, desc }) => (
            <div key={n} className="relative">
              <div className="text-[56px] font-bold leading-none text-white/[0.08] mb-3">{n}</div>
              <h3 className="text-[21px] font-bold mb-2">{title}</h3>
              <p className="text-[15px] text-white/50 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Benefits / CTA band ─────────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 py-20">
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
