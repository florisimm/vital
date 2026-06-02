import type { Metadata, Viewport } from 'next'
import './globals.css'
import { BottomNav } from '@/components/BottomNav'
import { DataProvider } from '@/components/DataProvider'

export const metadata: Metadata = {
  title: 'Vital',
  description: 'AI fitness & health coaching',
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
    <html lang="nl">
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
        <DataProvider />
        <div className="relative">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  )
}
