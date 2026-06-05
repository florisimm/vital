'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

interface BarcodeScannerProps {
  onDetected: (barcode: string) => void
  onClose: () => void
}

export function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Starting camera...')
  const detectedRef = useRef(false)

  useEffect(() => {
    let reader: any
    let cancelled = false

    async function startScanner() {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser')
        if (cancelled) return

        reader = new BrowserMultiFormatReader()

        if (!videoRef.current || cancelled) return
        setStatus('Aim at barcode...')

        await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' } } },
          videoRef.current,
          (result: any) => {
            if (result && !detectedRef.current) {
              detectedRef.current = true
              onDetected(result.getText())
            }
          }
        )
      } catch (e: any) {
        if (!cancelled) {
          if (e?.name === 'NotAllowedError') {
            setError('Camera access denied. Allow camera in your browser settings.')
          } else {
            setError('Could not start camera.')
          }
        }
      }
    }

    startScanner()

    return () => {
      cancelled = true
      try { reader?.reset() } catch {}
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream
        stream.getTracks().forEach(t => t.stop())
        videoRef.current.srcObject = null
      }
    }
  }, [onDetected])

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" style={{ background: 'rgb(0,0,0)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-safe pt-4 pb-4 shrink-0">
        <span className="text-[17px] font-bold text-white">Scan Barcode</span>
        <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <X size={18} className="text-white" />
        </button>
      </div>

      {error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
          <p className="text-white/60 text-[15px] text-center">{error}</p>
          <button onClick={onClose} className="text-teal-400 font-semibold text-[15px]">Close</button>
        </div>
      ) : (
        <div className="flex-1 relative overflow-hidden">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
          />

          {/* Overlay with scanning window */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {/* Dark overlay top */}
            <div className="absolute inset-0 bg-black/50" />

            {/* Scan window */}
            <div className="relative z-10 w-72 h-44">
              {/* Clear window */}
              <div className="absolute inset-0 rounded-xl overflow-hidden" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }} />

              {/* Corner markers */}
              {[
                'top-0 left-0 border-t-2 border-l-2 rounded-tl-xl',
                'top-0 right-0 border-t-2 border-r-2 rounded-tr-xl',
                'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-xl',
                'bottom-0 right-0 border-b-2 border-r-2 rounded-br-xl',
              ].map((cls, i) => (
                <div key={i} className={`absolute w-8 h-8 border-teal-400 ${cls}`} />
              ))}

              {/* Scanning line animation */}
              <div className="absolute inset-x-0 h-0.5 bg-teal-400 opacity-80 animate-scan" style={{ top: '50%' }} />
            </div>

            <p className="relative z-10 mt-6 text-white/70 text-[15px] font-medium">{status}</p>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes scan {
          0%, 100% { top: 10%; }
          50% { top: 90%; }
        }
        .animate-scan {
          animation: scan 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
