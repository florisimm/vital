import type { Metadata, Viewport } from 'next'
import './globals.css'
import { BottomNav } from '@/components/BottomNav'
import { DataProvider } from '@/components/DataProvider'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { SWRProvider } from '@/components/SWRProvider'
import { PasswordRecoveryGuard } from '@/components/PasswordRecoveryGuard'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://vital.app'

const DESCRIPTION = 'Your AI fitness coach that reads your training, sleep, recovery, nutrition and calendar — then tells you exactly what to do today.'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Kern — AI Fitness & Health Coaching',
  description: DESCRIPTION,
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: '/favicon-32x32.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kern',
  },
  openGraph: {
    title: 'Kern — Advice that fits your day',
    description: DESCRIPTION,
    url: siteUrl,
    siteName: 'Kern',
    images: [{ url: '/og', width: 1200, height: 630, alt: 'Kern' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kern — Advice that fits your day',
    description: DESCRIPTION,
    images: ['/og'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: 'rgb(5, 6, 8)',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Fixed full-screen background matching AppBackground in Swift */}
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 100% 0%, rgba(0,210,220,0.20) 0%, transparent 55%), ' +
              'radial-gradient(circle at 0% 100%, rgba(255,120,0,0.10) 0%, transparent 60%), ' +
              'rgb(5, 6, 8)',
          }}
        />
        <SWRProvider>
          <PasswordRecoveryGuard />
          <DataProvider />
          <div className="relative">
            {children}
          </div>
          <BottomNav />
        </SWRProvider>
      </body>
    </html>
  )
}
