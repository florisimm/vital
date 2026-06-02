'use client'

import { useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { PremiumScreen } from '@/components/PremiumScreen'

export default function CoachPage() {
  const [message, setMessage] = useState('')

  return (
    <PremiumScreen title="Coach" subtitle="Objective recommendations" contentGap={18}>

      {/* Chat input — matches HStack with TextField + send Button */}
      <div className="flex items-center gap-3 pt-2.5">
        <input
          type="text"
          placeholder="Ask for analysis"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="flex-1 h-[52px] px-4 rounded-[18px] text-white placeholder:text-white/30 outline-none text-[17px]"
          style={{ background: 'rgba(255,255,255,0.08)' }}
        />
        <button
          onClick={() => setMessage('')}
          aria-label="Send message"
          className="w-[52px] h-[52px] rounded-full bg-white flex items-center justify-center shrink-0"
        >
          <ArrowUp size={20} className="text-black" strokeWidth={2.5} />
        </button>
      </div>
    </PremiumScreen>
  )
}
