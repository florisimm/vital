'use client'

import { useRouter } from 'next/navigation'
import {
  Activity, Brain, HeartPulse, Utensils, Dumbbell, Moon,
  ArrowRight, Check, Sparkles,
} from 'lucide-react'

// Professional public marketing page shown to logged-out visitors on `/`.
// Logged-in users get the dashboard instead (gated in app/page.tsx).

const FEATURES = [
  { Icon: Brain,      title: 'AI Coach',        desc: 'Rico, je persoonlijke coach, leest je data en geeft direct antwoord op elke vraag over training, herstel en voeding.' },
  { Icon: HeartPulse, title: 'Herstel & Readiness', desc: 'HRV, rusthartslag en slaap worden gecombineerd tot één readiness-score zodat je weet wanneer je gas kunt geven.' },
  { Icon: Dumbbell,   title: 'Slimme training', desc: 'Automatische trainingsadviezen op basis van je belasting, ramp rate en geplande sessies — nooit meer over- of ondertrainen.' },
  { Icon: Utensils,   title: 'Voeding & Macro\'s', desc: 'Scan barcodes, log maaltijden en houd je eiwit- en caloriedoelen moeiteloos bij.' },
  { Icon: Moon,       title: 'Slaap-inzichten',  desc: 'Diepe slaap, REM en efficiëntie per nacht — met concrete tips om beter te herstellen.' },
  { Icon: Activity,   title: 'Alles op één plek', desc: 'Strava, Hevy, Fitbit en Google Calendar synchroniseren automatisch in één overzicht.' },
]

const STEPS = [
  { n: '01', title: 'Verbind je apps', desc: 'Koppel Strava, Hevy, Fitbit en je agenda in één tap.' },
  { n: '02', title: 'Krijg inzicht',    desc: 'Je data wordt automatisch geanalyseerd tot heldere scores en adviezen.' },
  { n: '03', title: 'Presteer beter',   desc: 'Volg de aanbevelingen van je AI-coach en zie je vooruitgang elke dag.' },
]

const BENEFITS = [
  'Persoonlijke AI-coach die je data écht begrijpt',
  'Eén dashboard voor training, herstel, slaap en voeding',
  'Automatische synchronisatie met je favoriete apps',
  'Adviezen op maat — geen generieke schema\'s',
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
            Inloggen
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
            Jouw lichaam, <span className="text-teal-400">begrepen</span>.
            <br />
            Elke dag opnieuw.
          </h1>

          <p className="text-[17px] sm:text-[20px] text-white/55 mt-6 max-w-2xl font-medium leading-relaxed">
            Kern combineert je training, slaap, herstel en voeding in één slim dashboard —
            met een AI-coach die precies weet wat jij vandaag nodig hebt.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-3 mt-10 w-full sm:w-auto">
            <button
              onClick={() => router.push('/login')}
              className="w-full sm:w-auto h-[54px] px-8 rounded-full bg-white text-black font-semibold text-[17px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              Begin gratis
              <ArrowRight size={19} strokeWidth={2.2} />
            </button>
            <button
              onClick={() => router.push('/login')}
              className="w-full sm:w-auto h-[54px] px-8 rounded-full font-semibold text-[17px] text-white active:scale-[0.98] transition-transform"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)' }}
            >
              Inloggen
            </button>
          </div>

          <p className="text-[13px] text-white/30 mt-5">Geen creditcard nodig · Direct aan de slag</p>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────── */}
      <section className="relative max-w-6xl mx-auto px-5 sm:px-8 py-20">
        <div className="text-center mb-14">
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-teal-400/80 mb-3">Functies</p>
          <h2 className="text-[34px] sm:text-[46px] font-bold tracking-tight">Alles wat je nodig hebt</h2>
          <p className="text-[17px] text-white/50 mt-4 max-w-2xl mx-auto">
            Eén app die al je gezondheidsdata samenbrengt en omzet in concrete actie.
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
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-orange-400/80 mb-3">Zo werkt het</p>
          <h2 className="text-[34px] sm:text-[46px] font-bold tracking-tight">In drie stappen</h2>
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
                Stop met gokken.<br />Train op data.
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
                Maak je account
                <ArrowRight size={20} strokeWidth={2.2} />
              </button>
              <p className="text-[14px] text-white/40 lg:text-right">
                Sluit je aan en haal het maximale uit elke training.
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
            Inloggen →
          </button>
        </div>
      </footer>
    </div>
  )
}
