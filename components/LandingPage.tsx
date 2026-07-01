'use client'

import { useRouter } from 'next/navigation'
import { Activity, HeartPulse, Brain, CalendarDays } from 'lucide-react'

// Public "coming soon" page shown to logged-out visitors on `/`.
// Logged-in users get the dashboard instead (gated in app/page.tsx).
//
// The web app is invite/login-only — this page exists to point visitors to
// the upcoming iOS app. Set APP_STORE_URL once the app is live and the badge
// becomes a real App Store link.

const APP_STORE_URL: string | null = null

const HIGHLIGHTS = [
  { Icon: Brain,        title: 'AI coach',       desc: 'Reads your training, sleep and nutrition — tells you what to do today.', accent: '#2dd4bf' },
  { Icon: HeartPulse,   title: 'One readiness score', desc: 'HRV, resting HR and sleep fused into a single daily number.',        accent: '#f472b6' },
  { Icon: CalendarDays, title: 'Calendar-aware', desc: 'Advice that fits around the sessions you already planned.',               accent: '#fb923c' },
]

export function LandingPage() {
  const router = useRouter()
  const goLogin = () => router.push('/login')

  return (
    <div className="relative min-h-screen text-white overflow-x-hidden flex flex-col">
      <style>{`
        @keyframes kFadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes kScan { from { stroke-dashoffset: 1400; } to { stroke-dashoffset: 0; } }
        @keyframes kBlink { 0%,100% { opacity: .25; } 50% { opacity: 1; } }
        @keyframes kFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-9px); } }
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

      {/* ── Hero ────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-5 sm:px-8 pt-[120px] pb-12">
        <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[820px] h-[460px] max-w-[120vw] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(45,212,191,0.16) 0%, transparent 65%)', filter: 'blur(50px)' }} />

        <div className="relative max-w-2xl flex flex-col items-center">
          <div style={{ animation: 'kFloat 7s ease-in-out infinite' }}>
            <Logo size={84} />
          </div>

          <div className="inline-flex items-center gap-2 h-[32px] px-4 rounded-full mt-8 mb-6 text-[13px] font-medium text-white/70"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.09)', animation: 'kFadeUp 0.6s ease both' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" style={{ animation: 'kBlink 1.8s ease-in-out infinite' }} />
            Coming soon to iPhone
          </div>

          <h1 className="text-[44px] sm:text-[68px] font-bold leading-[1.02] tracking-[-0.02em]" style={{ animation: 'kFadeUp 0.6s ease 0.05s both' }}>
            Read your{' '}
            <span style={{ background: 'linear-gradient(100deg, #2dd4bf, #5eead4 40%, #fb923c)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>core.</span>
            <br />
            <span className="text-white/85">Train on data.</span>
          </h1>

          <p className="text-[17px] sm:text-[19px] text-white/55 mt-6 max-w-xl font-medium leading-relaxed" style={{ animation: 'kFadeUp 0.6s ease 0.12s both' }}>
            Kern fuses your training, sleep, recovery, nutrition and your calendar into one signal — then tells you exactly what to do today. Launching on the App&nbsp;Store.
          </p>

          <div className="mt-9" style={{ animation: 'kFadeUp 0.6s ease 0.18s both' }}>
            <AppStoreBadge />
          </div>
        </div>
      </main>

      {/* ── ECG pulse divider ───────────────────────────────── */}
      <PulseLine />

      {/* ── What's coming ───────────────────────────────────── */}
      <section className="relative z-10 max-w-4xl mx-auto w-full px-5 sm:px-8 pb-16">
        <div className="grid sm:grid-cols-3 gap-4">
          {HIGHLIGHTS.map(({ Icon, title, desc, accent }, i) => (
            <div key={title} className="rounded-[22px] p-6 text-left"
              style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', animation: `kFadeUp 0.6s ease ${0.22 + i * 0.06}s both` }}>
              <div className="w-11 h-11 rounded-[13px] flex items-center justify-center mb-4"
                style={{ background: `${accent}1c`, border: `1px solid ${accent}33`, color: accent }}>
                <Icon size={21} strokeWidth={2} />
              </div>
              <h3 className="text-[17px] font-bold mb-1.5">{title}</h3>
              <p className="text-[14px] text-white/50 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="relative z-10 max-w-6xl mx-auto w-full px-5 sm:px-8 py-10 border-t border-white/[0.06]">
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

// ── Brand logo: heartbeat line in a gradient tile ───────────────
function Logo({ size = 36 }: { size?: number }) {
  return (
    <div className="rounded-[11px] flex items-center justify-center shrink-0" style={{ width: size, height: size, borderRadius: size * 0.3, background: 'linear-gradient(135deg, rgba(45,212,191,0.28) 0%, rgba(255,120,0,0.20) 100%)', border: '1px solid rgba(255,255,255,0.12)' }}>
      <Activity size={Math.round(size * 0.52)} className="text-teal-400" strokeWidth={2.2} />
    </div>
  )
}

// ── App Store badge — a link once APP_STORE_URL is set ──────────
function AppStoreBadge() {
  const live = !!APP_STORE_URL
  const inner = (
    <span className="inline-flex items-center gap-3 h-[62px] px-7 rounded-[16px] select-none"
      style={{
        background: live ? 'white' : 'rgba(255,255,255,0.06)',
        border: `1px solid ${live ? 'white' : 'rgba(255,255,255,0.14)'}`,
        color: live ? 'black' : 'white',
        boxShadow: '0 20px 60px rgba(45,212,191,0.12)',
      }}>
      <AppleLogo size={26} />
      <span className="flex flex-col items-start leading-none">
        <span className="text-[11px] font-medium mb-1" style={{ opacity: 0.6 }}>{live ? 'Download on the' : 'Coming soon on the'}</span>
        <span className="text-[21px] font-semibold tracking-tight">App Store</span>
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

// ── Full-width animated ECG line ────────────────────────────────
function PulseLine() {
  // One heartbeat unit, repeated. Drawn left→right on loop.
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
