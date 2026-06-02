'use client'

import React from 'react'
import { logError } from '@/lib/logError'

interface Props { children: React.ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    logError(`${error.message}\n\nComponent: ${info.componentStack}`, 'ErrorBoundary')
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center px-8 gap-4"
          style={{ background: 'rgb(5,6,8)' }}>
          <span className="text-[32px]">⚠️</span>
          <p className="text-[18px] font-semibold text-white text-center">Er ging iets mis</p>
          <p className="text-[14px] text-white/40 text-center">{this.state.error.message}</p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
            className="mt-2 px-6 h-[44px] rounded-[14px] bg-white text-black font-semibold text-[15px]"
          >
            Opnieuw laden
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
