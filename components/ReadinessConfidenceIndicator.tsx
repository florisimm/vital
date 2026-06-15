import type { ReadinessConfidence } from '@/lib/adaptive-coaching-types'

interface ReadinessConfidenceIndicatorProps {
  confidence: ReadinessConfidence
  compact?: boolean
}

/**
 * Visual indicator showing confidence in the readiness score.
 * Displays as a small badge with color coding:
 * - Green: High confidence (15+ days data)
 * - Yellow: Medium confidence (10-14 days data)
 * - Orange: Low confidence (<10 days data)
 */
export function ReadinessConfidenceIndicator({
  confidence,
  compact = false,
}: ReadinessConfidenceIndicatorProps) {
  const colorMap = {
    high: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', text: 'text-emerald-400' },
    medium: { bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400' },
    low: { bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400' },
  }

  const colors = colorMap[confidence.level]
  const icon =
    confidence.level === 'high' ? '✓' : confidence.level === 'medium' ? '○' : '⚠'

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg border ${colors.bg} ${colors.border}`}
        title={confidence.reason}
      >
        <span className={`text-[12px] font-semibold ${colors.text}`}>{icon}</span>
        <span className={`text-[11px] ${colors.text}`}>{confidence.level}</span>
      </div>
    )
  }

  return (
    <div className={`p-3 rounded-lg border ${colors.bg} ${colors.border}`}>
      <div className="flex items-start gap-2">
        <span className={`text-[14px] ${colors.text} flex-shrink-0 pt-0.5`}>{icon}</span>
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <span className={`text-[12px] font-semibold ${colors.text} uppercase tracking-[0.05em]`}>
            {confidence.level === 'high'
              ? 'Confident'
              : confidence.level === 'medium'
                ? 'Moderate Confidence'
                : 'Low Confidence'}
          </span>
          <span className="text-[12px] text-white/50">{confidence.reason}</span>
        </div>
      </div>
    </div>
  )
}
